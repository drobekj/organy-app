import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { PostgresReferenceCatalogProvider } from "../src/application/postgres-reference-catalog";
import { loadAndValidateReferenceCatalog, synchronizeReferenceCatalog } from "../src/application/reference-catalog-sync";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

async function fingerprint(url: string): Promise<string> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const counts: unknown[] = [];
    for (const row of tables.rows) counts.push([row.table_name, (await pool.query(`SELECT count(*)::text count FROM public.\"${String(row.table_name).replaceAll('"', '""')}\"`)).rows[0]?.count]);
    return JSON.stringify([tables.rows, counts]);
  } finally { await pool.end(); }
}

async function npmRun(name: string, databaseUrl: string): Promise<void> {
  const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} exited with code ${code}.`)));
  });
}

async function snapshot(pool: Pool): Promise<Record<string, unknown>[]> {
  return (await pool.query("SELECT id, language, canonical_number, source_id, title, source_url FROM reference_catalog_songs ORDER BY language, canonical_number")).rows;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.2 verification.");
  const guard = parseGuardDatabaseUrl(process.env.DATABASE_URL); const originalGuard = await fingerprint(process.env.DATABASE_URL);
  const control = new Pool({ connectionString: deriveControlUrl(guard), max: 1 }); const name = generateE1DatabaseName();
  await control.query(createDatabaseSql(name)); const databaseUrl = deriveDatabaseUrl(guard, name);
  try {
    await withCleanup(async () => {
      await npmRun("db:migrate", databaseUrl); await npmRun("db:migrate", databaseUrl);
      const pool = new Pool({ connectionString: databaseUrl });
      try {
        const firstCounts = await synchronizeReferenceCatalog(pool); const first = await snapshot(pool);
        const secondCounts = await synchronizeReferenceCatalog(pool); const second = await snapshot(pool);
        assert.deepEqual(firstCounts, { czech: 808, polish: 990, total: 1798 }); assert.deepEqual(secondCounts, firstCounts); assert.deepEqual(second, first);
        const expected = (await loadAndValidateReferenceCatalog()).sort((a, b) => a.language.localeCompare(b.language) || a.canonicalNumber - b.canonicalNumber).map((record) => ({ id: record.id, language: record.language, canonical_number: record.canonicalNumber, source_id: record.sourceId, title: record.title, source_url: record.sourceUrl }));
        assert.deepEqual(second, expected);
        await pool.query("INSERT INTO reference_catalog_songs VALUES ('czech:999999','czech',999999,'stale','stale',NULL)");
        await synchronizeReferenceCatalog(pool); assert.equal((await pool.query("SELECT count(*)::integer count FROM reference_catalog_songs WHERE source_id='stale'")).rows[0]?.count, 0);
        const valid = await snapshot(pool); await assert.rejects(synchronizeReferenceCatalog(pool, { failBeforeCommit: true }), /Injected/); assert.deepEqual(await snapshot(pool), valid);
        assert.equal((await pool.query("SELECT count(*)::integer count FROM reference_catalog_songs WHERE language='czech' AND source_url IS NULL")).rows[0]?.count, 7);
        assert.equal((await pool.query("SELECT count(DISTINCT id)::integer ids, count(DISTINCT (language, canonical_number))::integer numbers, count(DISTINCT (language, source_id))::integer sources FROM reference_catalog_songs")).rows[0]?.ids, 1798);
        const provider = new PostgresReferenceCatalogProvider(pool); assert.deepEqual(await provider.counts(), { all: 1798, czech: 808, polish: 990 });
        assert.equal((await provider.list({ language: "czech", pageSize: 2000 })).total, 808); assert.equal((await provider.list({ language: "polish", pageSize: 2000 })).total, 990);
        assert.equal((await provider.list({ search: "ŻEGNAMY" })).records[0]?.canonicalNumber, 955);
        assert.deepEqual((await provider.list({ search: "751/1" })).records.map((r) => r.id), ["czech:7511"]); assert.deepEqual((await provider.list({ search: "7512" })).records.map((r) => r.id), ["czech:7512"]);
        for (const rejected of ["7521", "752/1", "7522", "752/2"]) assert.equal((await provider.list({ search: rejected })).total, 0);
        const ordinary = await provider.list({ search: "298" }); assert.equal(ordinary.records.find((r) => r.language === "czech")?.sourceUrl, "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce");
        assert.equal((await provider.getById("polish:955"))?.sourceUrl, "https://hymnary.org/hymn/SE2002/955");
        const page0 = await provider.list({ page: 0, pageSize: 10 }); const page1 = await provider.list({ page: 1, pageSize: 10 }); assert.notDeepEqual(page0.records.map((r) => r.id), page1.records.map((r) => r.id)); assert.equal(page0.records[0]?.displayNumber, "1");
        await pool.query("UPDATE reference_catalog_songs SET title='DATABASE PROOF' WHERE id='czech:1'"); assert.equal((await provider.getById("czech:1"))?.title, "DATABASE PROOF");
      } finally { await pool.end(); }
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); assert.equal((await control.query("SELECT 1 FROM pg_database WHERE datname=$1", [name])).rows.length, 0); });
    assert.equal(await fingerprint(process.env.DATABASE_URL), originalGuard);
    console.log("Phase 31.2 evidence: migrations 2; syncs 2; PostgreSQL counts 808 / 990 / 1798; equality, provider, rollback, cleanup and guard checks passed.");
    console.log("Phase 31.2 PostgreSQL catalog persistence: PASS");
  } finally { await control.end(); }
}
void main().catch((error: unknown) => { console.error("Phase 31.2 PostgreSQL catalog persistence: FAIL"); console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
