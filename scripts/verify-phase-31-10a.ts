import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/interaction/route";
import { DbReferenceAntiphonRecommendationClient } from "../src/application/reference-antiphon-recommendation-client";
import { synchronizeReferenceAntiphons } from "../src/application/reference-antiphon-sync";
import { synchronizeReferenceCatalog } from "../src/application/reference-catalog-sync";
import type { PlanningRole } from "../src/planning-lifecycle";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

const PASS_LINE = "Phase 31.10a authoritative reference antiphon recommendations: PASS";
type Actor = { userId: string; role: PlanningRole };

function runNpm(name: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
    const child = spawn(invocation.command, invocation.args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed with exit code ${code ?? 1}.`)));
  });
}

async function invoke(action: string, input: unknown, actor: Actor = { userId: "admin", role: "admin" }) {
  const response = await POST(new Request("http://localhost/api/interaction", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }),
  }));
  return { status: response.status, body: await response.json() };
}

async function databaseFingerprint(pool: Pool): Promise<string> {
  const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => String(row.tablename));
  return JSON.stringify(await Promise.all(tables.map(async (table) => [table, Number((await pool.query(`select count(*) n from ${table}`)).rows[0].n)])));
}

async function verifySchema(pool: Pool): Promise<void> {
  const columns = await pool.query("select column_name,is_nullable from information_schema.columns where table_name='reference_antiphon_recommendations' order by ordinal_position");
  assert.deepEqual(columns.rows, [
    { column_name: "antiphon_id", is_nullable: "NO" },
    { column_name: "reference_song_id", is_nullable: "NO" },
    { column_name: "updated_at", is_nullable: "NO" },
  ]);
  assert.equal(Number((await pool.query("select count(*) n from pg_constraint where conrelid='reference_antiphon_recommendations'::regclass and contype='p'")).rows[0].n), 1);
  assert.equal(Number((await pool.query("select count(*) n from pg_constraint where conrelid='reference_antiphon_recommendations'::regclass and contype='f'")).rows[0].n), 2);
  assert.equal((await pool.query("select 1 from pg_indexes where indexname='reference_antiphon_recommendations_song_id_idx'")).rows.length, 1);
}

async function verifyReadWriteAndExactShape(pool: Pool): Promise<void> {
  const client = new DbReferenceAntiphonRecommendationClient(
    { userId: "admin", role: "admin" },
    async (action, input, actor) => (await invoke(action, input, actor)).body,
  );
  assert.deepEqual(await client.get("czech:858"), { success: true, value: { antiphonId: "czech:858", recommendedSong: null } });
  const song = (await pool.query("select id,language,canonical_number,title from reference_catalog_songs where id='czech:1'")).rows[0];
  const expectedSong = { referenceSongId: "czech:1", language: song.language, canonicalNumber: Number(song.canonical_number), displayNumber: "1", title: song.title };
  assert.deepEqual(await client.set("czech:858", "czech:1"), { success: true, value: { antiphonId: "czech:858", recommendedSong: expectedSong } });
  assert.deepEqual(await client.get("czech:858"), { success: true, value: { antiphonId: "czech:858", recommendedSong: expectedSong } });
  const replacement = await client.set("czech:858", "polish:1");
  assert.equal(replacement.success && replacement.value.recommendedSong?.referenceSongId, "polish:1");
  assert.equal(Number((await pool.query("select count(*) n from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].n), 1);
  assert.deepEqual(await client.set("czech:858", null), { success: true, value: { antiphonId: "czech:858", recommendedSong: null } });
}

async function verifyStructuredErrors(): Promise<void> {
  const priest = { userId: "priest", role: "priest" } as const;
  assert.deepEqual(await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:1" }, priest), { status: 403, body: { success: false, error: { code: "permissionDenied", message: "Only admin may manage antiphon recommendations." } } });
  assert.deepEqual(await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:800" }), { status: 200, body: { success: true, value: { antiphonId: "czech:800", recommendedSong: null } } });
  assert.equal((await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:99999" })).status, 404);
  for (const antiphonId of ["czech:799", "czech:916", "czech:999", "polish:800", "bad"]) {
    assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId })).status, 400);
  }
  assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:858", extra: true })).status, 400);
  assert.equal((await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858" })).status, 400);
  assert.equal((await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: false })).status, 400);
}

async function verifySynchronizationSafety(pool: Pool): Promise<void> {
  await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:1" });
  await synchronizeReferenceCatalog(pool);
  await synchronizeReferenceAntiphons(pool);
  assert.equal((await pool.query("select reference_song_id from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].reference_song_id, "czech:1");
  await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: null });
}

async function runAcceptance(databaseUrl: string): Promise<void> {
  await runNpm("db:migrate", databaseUrl);
  await runNpm("db:migrate", databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await verifySchema(pool);
    await synchronizeReferenceCatalog(pool);
    await synchronizeReferenceAntiphons(pool);
    await pool.query("insert into app_users(id,display_name) values('admin','Admin'),('priest','Priest'); insert into app_user_roles(user_id,role) values('admin','admin'),('priest','priest')");
    process.env.DATABASE_URL = databaseUrl;
    process.env.ORGANY_RUNTIME = "db";
    await verifyReadWriteAndExactShape(pool);
    await verifyStructuredErrors();
    await verifySynchronizationSafety(pool);
  } finally { await pool.end(); }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.10a verification.");
  const guardUrl = process.env.DATABASE_URL;
  const guard = parseGuardDatabaseUrl(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const guardPool = new Pool({ connectionString: guardUrl });
  const before = await databaseFingerprint(guardPool); await guardPool.end();
  const databaseName = generateE1DatabaseName();
  const databaseUrl = deriveDatabaseUrl(guard, databaseName);
  const originalRuntime = process.env.ORGANY_RUNTIME;
  await control.query(createDatabaseSql(databaseName));
  try {
    await withCleanup(() => runAcceptance(databaseUrl), async () => {
      const [terminate, drop] = dropDatabaseSql(databaseName); await control.query(terminate, [databaseName]); await control.query(drop);
    });
    const finalGuardPool = new Pool({ connectionString: guardUrl }); assert.equal(await databaseFingerprint(finalGuardPool), before); await finalGuardPool.end();
    console.log(PASS_LINE);
  } finally {
    process.env.DATABASE_URL = guardUrl;
    if (originalRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = originalRuntime;
    await control.end();
  }
}
void main().catch((error) => { console.error("Phase 31.10a authoritative reference antiphon recommendations: FAIL"); console.error(error); process.exitCode = 1; });
