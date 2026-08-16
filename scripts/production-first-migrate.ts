import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/db/schema";

const APPLY_FLAG = "--apply";
const DIRECT_URL_KEY = "DATABASE_URL_UNPOOLED";

const SAFE_FAILURES = new Set([
  `${DIRECT_URL_KEY} is required for the first production migration.`,
  `${DIRECT_URL_KEY} must be a valid PostgreSQL URL.`,
  `${DIRECT_URL_KEY} must use the postgres or postgresql protocol.`,
  `${DIRECT_URL_KEY} must be the direct/unpooled PostgreSQL endpoint.`,
  `Only the optional ${APPLY_FLAG} argument is accepted.`,
  "First-production migration refuses a target that already contains public application tables.",
  "First-production migration refuses a target with Neon Auth/Data API state.",
  "Migration completed without creating the expected application schema.",
  "Migration unexpectedly introduced Neon Auth/Data API state.",
  "Schema migration unexpectedly created application rows; bootstrap/seed side effects are forbidden.",
]);

type DatabaseError = Error & { code?: string };

type ProviderBoundary = {
  publicTables: string[];
  neonAuthSchema: boolean;
  authenticatedRole: boolean;
  anonymousRole: boolean;
};

function readDirectUrl(): string {
  const value = process.env[DIRECT_URL_KEY]?.trim();
  if (!value) throw new Error(`${DIRECT_URL_KEY} is required for the first production migration.`);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${DIRECT_URL_KEY} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${DIRECT_URL_KEY} must use the postgres or postgresql protocol.`);
  }
  if (parsed.hostname.toLowerCase().includes("-pooler")) {
    throw new Error(`${DIRECT_URL_KEY} must be the direct/unpooled PostgreSQL endpoint.`);
  }
  return value;
}

function requestedApply(): boolean {
  const args = process.argv.slice(2);
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === APPLY_FLAG) return true;
  throw new Error(`Only the optional ${APPLY_FLAG} argument is accepted.`);
}

async function inspectProviderBoundary(pool: Pool): Promise<ProviderBoundary> {
  const publicTables = (await pool.query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  )).rows.map((row) => String(row.tablename));

  const provider = (await pool.query(`
    select
      exists(select 1 from pg_namespace where nspname='neon_auth') as neon_auth_schema,
      exists(select 1 from pg_roles where rolname='authenticated') as authenticated_role,
      exists(select 1 from pg_roles where rolname='anonymous') as anonymous_role
  `)).rows[0] as Record<string, boolean>;

  return {
    publicTables,
    neonAuthSchema: Boolean(provider.neon_auth_schema),
    authenticatedRole: Boolean(provider.authenticated_role),
    anonymousRole: Boolean(provider.anonymous_role),
  };
}

function assertEmptyFirstMigrationTarget(boundary: ProviderBoundary): void {
  if (boundary.publicTables.length !== 0) {
    throw new Error("First-production migration refuses a target that already contains public application tables.");
  }
  if (boundary.neonAuthSchema || boundary.authenticatedRole || boundary.anonymousRole) {
    throw new Error("First-production migration refuses a target with Neon Auth/Data API state.");
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function nonEmptyPublicTables(pool: Pool): Promise<string[]> {
  const tables = (await pool.query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  )).rows.map((row) => String(row.tablename));
  const nonEmpty: string[] = [];
  for (const table of tables) {
    const result = await pool.query(`select count(*)::int as n from public.${quoteIdentifier(table)}`);
    if (Number(result.rows[0]?.n ?? 0) !== 0) nonEmpty.push(table);
  }
  return nonEmpty;
}

function safeFailure(error: unknown): string {
  if (error instanceof Error) {
    if (SAFE_FAILURES.has(error.message)) return error.message;
    const code = (error as DatabaseError).code;
    if (code && /^[0-9A-Z]{5}$/.test(code)) return `Database operation failed (${code}).`;
  }
  return "Database operation failed.";
}

async function main(): Promise<void> {
  let apply = false;
  let pool: Pool | undefined;

  try {
    apply = requestedApply();
    const directUrl = readDirectUrl();
    pool = new Pool({ connectionString: directUrl, max: 1 });

    const before = await inspectProviderBoundary(pool);
    assertEmptyFirstMigrationTarget(before);

    if (!apply) {
      console.log("First production schema migration preflight: PASS");
      console.log(`Target is empty; no migration was applied. Re-run with ${APPLY_FLAG} only at the authorized HUMAN checkpoint.`);
      return;
    }

    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });

    const after = await inspectProviderBoundary(pool);
    if (after.publicTables.length === 0) throw new Error("Migration completed without creating the expected application schema.");
    if (after.neonAuthSchema || after.authenticatedRole || after.anonymousRole) {
      throw new Error("Migration unexpectedly introduced Neon Auth/Data API state.");
    }

    const nonEmpty = await nonEmptyPublicTables(pool);
    if (nonEmpty.length !== 0) {
      throw new Error("Schema migration unexpectedly created application rows; bootstrap/seed side effects are forbidden.");
    }

    console.log("First production schema migration: PASS");
    console.log("Reviewed Drizzle schema applied through the direct/unpooled connection; public application tables remain row-empty.");
  } catch (error) {
    console.error(apply ? "First production schema migration: FAIL" : "First production schema migration preflight: FAIL");
    console.error(safeFailure(error));
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }
}

void main();
