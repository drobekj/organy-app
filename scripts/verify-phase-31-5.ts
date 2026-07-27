import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST as interactionPost } from "../app/api/interaction/route";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

type Result = { status: number; body: any };
async function invoke(action: string, input: unknown, actor?: unknown): Promise<Result> { const response = await interactionPost(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, ...(actor === undefined ? {} : { actor }) }) })); return { status: response.status, body: await response.json() }; }
async function npmRun(name: string, url: string) { const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]); await new Promise<void>((resolve, reject) => { const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); }); }
async function main() {
  assert.equal(process.env.ORGANY_PHASE_31_5_BASELINE ?? "c4bb1d412bc3efb88b7231a8e57e804f66dfd56b", "c4bb1d412bc3efb88b7231a8e57e804f66dfd56b");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.5 verification.");
  const guardUrl = process.env.DATABASE_URL; const guard = parseGuardDatabaseUrl(guardUrl); const control = new Pool({ connectionString: deriveControlUrl(guard) }); const name = generateE1DatabaseName(); await control.query(createDatabaseSql(name)); const isolatedUrl = deriveDatabaseUrl(guard, name); const runtime = process.env.ORGANY_RUNTIME;
  try { await withCleanup(async () => {
    await npmRun("db:migrate", isolatedUrl); await npmRun("db:sync:reference-catalog", isolatedUrl);
    const seedDb = new Pool({ connectionString: isolatedUrl }); try { await seedDemoInteractionKnowledge(seedDb); } finally { await seedDb.end(); }
    process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";
    const priest = { userId: "demo-priest-user", role: "priest" }; const organist = { userId: "demo-organist-user", role: "organist" }; const member = { userId: "demo-member-user", role: "congregationMember" };
    for (const [actor, maximum] of [[priest, 3], [organist, 2], [member, 1]] as const) {
      const initial = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, actor); assert.equal(initial.status, 200); assert.deepEqual(initial.body.value.score, 0); assert.equal(initial.body.value.maxScore, maximum);
      const saved = await invoke("saveReferenceOwnPreference", { referenceId: "czech:1", score: maximum }, actor); assert.equal(saved.status, 200); assert.equal(saved.body.value.score, maximum);
      assert.equal((await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, actor)).body.value.score, maximum);
    }
    const db = new Pool({ connectionString: isolatedUrl }); try {
      const stored = await db.query("select p.user_id, rp.score from reference_song_preferences rp join preference_profiles p on p.id=rp.profile_id where rp.reference_id='czech:1' order by p.user_id"); assert.deepEqual(stored.rows, [{ user_id: "demo-member-user", score: 1 }, { user_id: "demo-organist-user", score: 2 }, { user_id: "demo-priest-user", score: 3 }]);
      assert.equal((await db.query("select count(*)::int n from song_preferences")).rows[0].n, 3);
    } finally { await db.end(); }
    const invalid = await invoke("saveReferenceOwnPreference", { referenceId: "czech:1", score: 4 }, priest); assert.equal(invalid.status, 400); assert.equal(invalid.body.error.code, "invalidInput");
    const fractional = await invoke("saveReferenceOwnPreference", { referenceId: "czech:1", score: 1.5 }, priest); assert.equal(fractional.status, 400); assert.equal(fractional.body.error.code, "invalidInput");
    const missing = await invoke("getReferenceOwnPreference", { referenceId: "czech:999999999" }, priest); assert.equal(missing.status, 404); assert.equal(missing.body.error.code, "notFound");
    const admin = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, { userId: "demo-admin-user", role: "admin" }); assert.equal(admin.status, 403); assert.equal(admin.body.error.code, "permissionDenied");
    const forged = await invoke("saveReferenceOwnPreference", { referenceId: "czech:1", score: 3, profileId: "pref-priest", category: "priest" }, member); assert.equal(forged.status, 400); assert.equal(forged.body.error.code, "invalidInput");
    const absentActor = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }); assert.equal(absentActor.status, 400); assert.equal(absentActor.body.error.code, "invalidInput");
    console.log("Phase 31.5 evidence: actual Interaction handlers, authoritative profiles/categories, isolated persistence, structured failures, legacy preference isolation, and cleanup passed.");
  }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
  console.log("Phase 31.5 persistent reference preferences: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (runtime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = runtime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.5 persistent reference preferences: FAIL"); console.error(error); process.exitCode = 1; });
