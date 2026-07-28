import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/interaction/route";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

type Result = { status: number; body: any };
async function invoke(action: string, input: unknown, actor: unknown): Promise<Result> { const response = await POST(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }) })); return { status: response.status, body: await response.json() }; }
async function npmRun(name: string, url: string) { const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]); await new Promise<void>((resolve, reject) => { const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); }); }
async function fingerprint(url: string) { const pool = new Pool({ connectionString: url }); try { return JSON.stringify((await pool.query("select datname from pg_database where datname=current_database()")).rows); } finally { await pool.end(); } }

async function main() {
  assert.equal(process.env.ORGANY_PHASE_31_6_BASELINE ?? "853260944598112f05ee8099806212147f1ed57b", "853260944598112f05ee8099806212147f1ed57b");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.6 verification.");
  const guardUrl = process.env.DATABASE_URL; const guard = parseGuardDatabaseUrl(guardUrl); const before = await fingerprint(guardUrl); const control = new Pool({ connectionString: deriveControlUrl(guard) }); const name = generateE1DatabaseName(); await control.query(createDatabaseSql(name)); const isolatedUrl = deriveDatabaseUrl(guard, name); const priorRuntime = process.env.ORGANY_RUNTIME;
  try {
    await withCleanup(async () => {
      await npmRun("db:migrate", isolatedUrl); await npmRun("db:sync:reference-catalog", isolatedUrl);
      const seed = new Pool({ connectionString: isolatedUrl }); try { await seedDemoInteractionKnowledge(seed); } finally { await seed.end(); }
      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";
      const priest = { userId: "demo-priest-user", role: "priest" }; const organist = { userId: "demo-organist-user", role: "organist" }; const member = { userId: "demo-member-user", role: "congregationMember" };
      const empty = await invoke("getReferenceOwnPreference", { referenceSongId: "czech:1" }, priest); assert.equal(empty.status, 200); assert.equal(empty.body.value.score, null); assert.equal(empty.body.value.aggregatePreferenceScore, 0);
      assert.equal((await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 3 }, priest)).body.value.aggregatePreferenceScore, 3);
      assert.equal((await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 2 }, organist)).body.value.aggregatePreferenceScore, 5);
      assert.equal((await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 1 }, member)).body.value.aggregatePreferenceScore, 6);
      const otherActor = await invoke("getReferenceOwnPreference", { referenceSongId: "czech:1" }, priest); assert.equal(otherActor.body.value.score, 3); assert.equal(otherActor.body.value.aggregatePreferenceScore, 6);
      const replaced = await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 0 }, priest); assert.equal(replaced.body.value.score, 0); assert.equal(replaced.body.value.aggregatePreferenceScore, 3);
      const unrelated = await invoke("getReferenceOwnPreference", { referenceSongId: "czech:2" }, priest); assert.equal(unrelated.body.value.aggregatePreferenceScore, 0);
      const db = new Pool({ connectionString: isolatedUrl }); try { assert.equal((await db.query("select sum(score)::integer total from reference_song_preferences where reference_song_id='czech:1'")).rows[0].total, 3); } finally { await db.end(); }
      const ui = await readFile(new URL("../app/planning-lifecycle-client.tsx", import.meta.url), "utf8"); assert.match(ui, /Aggregate preference:/); assert.match(ui, /aggregatePreferenceScore/);
      console.log("Phase 31.6 evidence: authoritative zero, cross-profile sum, replacement, record isolation, own-value separation, actual route, PostgreSQL, and UI projection passed.");
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    process.env.DATABASE_URL = guardUrl; assert.equal(await fingerprint(guardUrl), before); assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    console.log("Phase 31.6 cleanup evidence: guard database fingerprint unchanged and temporary database removed.");
    console.log("Phase 31.6 authoritative reference aggregate preference: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (priorRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = priorRuntime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.6 authoritative reference aggregate preference: FAIL"); console.error(error); process.exitCode = 1; });
