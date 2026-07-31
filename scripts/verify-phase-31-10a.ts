import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/interaction/route";
import { DbReferenceAntiphonRecommendationClient } from "../src/application/reference-antiphon-recommendation-client";
import { synchronizeReferenceAntiphons } from "../src/application/reference-antiphon-sync";
import { synchronizeReferenceCatalog } from "../src/application/reference-catalog-sync";
import type { PlanningRole } from "../src/planning-lifecycle";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

const run = (name: string, url: string) => new Promise<void>((resolve, reject) => { const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]); const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed`))); });
async function fingerprint(pool: Pool) { const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => row.tablename); return JSON.stringify(await Promise.all(tables.map(async (table) => [table, (await pool.query(`select count(*)::int n from ${table}`)).rows[0].n]))); }
async function invoke(action: string, input: unknown, actor: { userId: string; role: PlanningRole } = { userId: "admin", role: "admin" }) { const response = await POST(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }) })); return { status: response.status, body: await response.json() }; }

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.10a verification.");
  const guardUrl = process.env.DATABASE_URL; const guard = parseGuardDatabaseUrl(guardUrl); const control = new Pool({ connectionString: deriveControlUrl(guard) }); const guardPool = new Pool({ connectionString: guardUrl }); const before = await fingerprint(guardPool); await guardPool.end();
  const name = generateE1DatabaseName(); const url = deriveDatabaseUrl(guard, name); await control.query(createDatabaseSql(name)); const runtime = process.env.ORGANY_RUNTIME;
  try {
    await withCleanup(async () => {
      await run("db:migrate", url); await run("db:migrate", url);
      const pool = new Pool({ connectionString: url });
      try {
        const columns = await pool.query("select column_name,is_nullable from information_schema.columns where table_name='reference_antiphon_recommendations' order by ordinal_position");
        assert.deepEqual(columns.rows, [{ column_name: "reference_antiphon_id", is_nullable: "NO" }, { column_name: "reference_song_id", is_nullable: "NO" }, { column_name: "updated_at", is_nullable: "NO" }]);
        assert.equal((await pool.query("select count(*)::int n from pg_constraint where conrelid='reference_antiphon_recommendations'::regclass and contype='f'")).rows[0].n, 2);
        await synchronizeReferenceCatalog(pool); await synchronizeReferenceAntiphons(pool);
        await pool.query("insert into app_users(id,display_name) values('admin','Admin'),('priest','Priest'); insert into app_user_roles(user_id,role) values('admin','admin'),('priest','priest')");
        process.env.DATABASE_URL = url; process.env.ORGANY_RUNTIME = "db";
        const client = new DbReferenceAntiphonRecommendationClient({ userId: "admin", role: "admin" }, async (action, input, actor) => (await invoke(action, input, actor)).body);
        assert.deepEqual(await client.get("czech:858"), { success: true, value: { referenceAntiphonId: "czech:858", referenceSongId: null } });
        assert.deepEqual(await client.set("czech:858", "czech:1"), { success: true, value: { referenceAntiphonId: "czech:858", referenceSongId: "czech:1" } });
        await synchronizeReferenceCatalog(pool); await synchronizeReferenceAntiphons(pool);
        assert.equal((await pool.query("select reference_song_id from reference_antiphon_recommendations where reference_antiphon_id='czech:858'")).rows[0].reference_song_id, "czech:1");
        assert.equal((await invoke("setReferenceAntiphonRecommendation", { referenceAntiphonId: "czech:858", referenceSongId: "czech:2" }, { userId: "priest", role: "priest" })).status, 403);
        assert.equal((await invoke("setReferenceAntiphonRecommendation", { referenceAntiphonId: "czech:999", referenceSongId: "czech:1" })).status, 404);
        assert.equal((await invoke("setReferenceAntiphonRecommendation", { referenceAntiphonId: "czech:858", referenceSongId: "czech:99999" })).status, 404);
        assert.equal((await invoke("getReferenceAntiphonRecommendation", { referenceAntiphonId: "bad" })).status, 400);
        assert.deepEqual(await client.set("czech:858", null), { success: true, value: { referenceAntiphonId: "czech:858", referenceSongId: null } });
      } finally { await pool.end(); }
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    const afterPool = new Pool({ connectionString: guardUrl }); assert.equal(await fingerprint(afterPool), before); await afterPool.end(); console.log("Phase 31.10a antiphon recommendation backend: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (runtime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = runtime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.10a antiphon recommendation backend: FAIL"); console.error(error); process.exitCode = 1; });
