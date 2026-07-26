import { spawn } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import {
  createDatabaseSql, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql,
  generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup,
} from "./engineering-e1-core";

class InjectedE1Failure extends Error { readonly code = "E1_INJECTED_FAILURE"; }
const PROBE_TABLE = "engineering_e1_transaction_probe";

function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }

async function guardFingerprint(connectionString: string): Promise<string> {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    const columns = await client.query(`SELECT table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
    const counts: Array<[string, string]> = [];
    for (const row of tables.rows) {
      const tableName = row.table_name as string;
      const result = await client.query(`SELECT count(*)::text AS count FROM public.${quoteIdentifier(tableName)}`);
      counts.push([tableName, result.rows[0].count as string]);
    }
    await client.query("COMMIT");
    return JSON.stringify({ tables: tables.rows.map((row) => row.table_name), columns: columns.rows, counts });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function runMigration(databaseUrl: string): Promise<void> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npm, ["run", "db:migrate"], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`db:migrate exited with code ${code}.\n${output}`)));
  });
}

async function assertMigrated(client: PoolClient): Promise<void> {
  const journal = await client.query(`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`);
  if (Number(journal.rows[0]?.count ?? 0) < 1) throw new Error("Drizzle migration journal has no applied migrations.");
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [["service_contexts", "service_sets", "completed_services"]]);
  if (tables.rows.length !== 3) throw new Error("Expected current-main representative tables were not migrated.");
}

async function probe(client: PoolClient): Promise<void> {
  const sentinel = "engineering-e1-sentinel";
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TABLE ${quoteIdentifier(PROBE_TABLE)} (value text NOT NULL)`);
    await client.query(`INSERT INTO ${quoteIdentifier(PROBE_TABLE)} (value) VALUES ($1)`, [sentinel]);
    const result = await client.query(`SELECT value FROM ${quoteIdentifier(PROBE_TABLE)}`);
    if (result.rows[0]?.value !== sentinel) throw new Error("Engineering E1 sentinel could not be read back.");
  } finally { await client.query("ROLLBACK"); }
  const exists = await client.query("SELECT to_regclass('public.engineering_e1_transaction_probe')::text AS name");
  if (exists.rows[0]?.name !== null) throw new Error("Rolled-back Engineering E1 probe table still exists.");
}

async function main(): Promise<void> {
  const rawGuardUrl = process.env.DATABASE_URL;
  if (!rawGuardUrl) throw new Error("DATABASE_URL is required for Engineering E1.");
  const guard = parseGuardDatabaseUrl(rawGuardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard), max: 1 });
  const originalFingerprint = await guardFingerprint(rawGuardUrl);
  const initialDatabases = (await control.query("SELECT datname FROM pg_database ORDER BY datname")).rows.map((row) => row.datname);
  const usedNames = new Set<string>();
  const assertGuard = async () => {
    if (await guardFingerprint(rawGuardUrl) !== originalFingerprint) throw new Error("Guard database fingerprint changed.");
  };
  const runScenario = async (injected: boolean) => {
    let name = generateE1DatabaseName();
    while (usedNames.has(name)) name = generateE1DatabaseName();
    usedNames.add(name);
    await control.query(createDatabaseSql(name));
    const databaseUrl = deriveDatabaseUrl(guard, name);
    await withCleanup(async () => {
      await runMigration(databaseUrl);
      if (!injected) {
        await runMigration(databaseUrl);
        console.log("Successful scenario: existing migrations completed twice.");
      }
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const client = await pool.connect();
        try { await assertMigrated(client); await probe(client); } finally { client.release(); }
      } finally { await pool.end(); }
      if (injected) throw new InjectedE1Failure("Intentional Engineering E1 lifecycle failure.");
    }, async () => {
      const [terminate, drop] = dropDatabaseSql(name);
      await control.query(terminate, [name]);
      await control.query(drop);
      const remaining = await control.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      if (remaining.rows.length !== 0) throw new Error("Temporary Engineering E1 database was not removed.");
    });
    await assertGuard();
  };
  try {
    await runScenario(false);
    try { await runScenario(true); throw new Error("Injected Engineering E1 failure was not observed."); }
    catch (error) { if (!(error instanceof InjectedE1Failure)) throw error; await assertGuard(); }
    const finalDatabases = (await control.query("SELECT datname FROM pg_database ORDER BY datname")).rows.map((row) => row.datname);
    if (JSON.stringify(finalDatabases) !== JSON.stringify(initialDatabases)) throw new Error("PostgreSQL database list changed outside the temporary E1 lifecycle.");
    await assertGuard();
    console.log("Engineering E1 PostgreSQL acceptance: PASS");
    console.log("Temporary databases migrated, probed and removed.");
    console.log("Guard database unchanged.");
  } finally { await control.end(); }
}

void main().catch((error: unknown) => { console.error("Engineering E1 PostgreSQL acceptance: FAIL"); console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
