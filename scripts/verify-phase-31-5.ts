import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST as interactionPost } from "../app/api/interaction/route";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { PgInteractionRepository } from "../src/application/db-interaction-repository";
import { DbInteractionClient } from "../app/planning-lifecycle-client";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

type Result = { status: number; body: any };
async function invoke(action: string, input: unknown, actor?: unknown): Promise<Result> { const response = await interactionPost(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, ...(actor === undefined ? {} : { actor }) }) })); return { status: response.status, body: await response.json() }; }
async function npmRun(name: string, url: string) { const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]); await new Promise<void>((resolve, reject) => { const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); }); }
async function main() {
  assert.equal(process.env.ORGANY_PHASE_31_5_BASELINE ?? "c4bb1d412bc3efb88b7231a8e57e804f66dfd56b", "c4bb1d412bc3efb88b7231a8e57e804f66dfd56b");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.5 verification.");
  const guardUrl = process.env.DATABASE_URL; const guard = parseGuardDatabaseUrl(guardUrl); const control = new Pool({ connectionString: deriveControlUrl(guard) }); const name = generateE1DatabaseName(); await control.query(createDatabaseSql(name)); const isolatedUrl = deriveDatabaseUrl(guard, name); const runtime = process.env.ORGANY_RUNTIME;
  try { await withCleanup(async () => {
    await npmRun("db:migrate", isolatedUrl);
    await npmRun("db:lifecycle-smoke", isolatedUrl);
    await npmRun("db:phase-30-1-smoke", isolatedUrl);
    await npmRun("db:sync:reference-catalog", isolatedUrl);
    const seedDb = new Pool({ connectionString: isolatedUrl });
    try {
      await seedDemoInteractionKnowledge(seedDb);
      await seedDb.query("insert into app_user_roles (user_id, role) values ('demo-member-user', 'priest') on conflict do nothing");
      await seedDb.query("insert into app_users (id, display_name, active) values ('no-profile-user', 'No Profile', true), ('inactive-preference-user', 'Inactive', false), ('roleless-preference-user', 'Roleless', true)");
      await seedDb.query("insert into app_user_roles (user_id, role) values ('no-profile-user', 'priest'), ('inactive-preference-user', 'priest')");
    } finally { await seedDb.end(); }
    process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";
    const priest = { userId: "demo-priest-user", role: "priest" }; const organist = { userId: "demo-organist-user", role: "organist" }; const member = { userId: "demo-member-user", role: "congregationMember" };
    for (const [actor, maximum, category] of [[priest, 3, "priest"], [organist, 2, "organist"], [member, 1, "congregationMember"]] as const) {
      const initial = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, actor); assert.equal(initial.status, 200); assert.equal(initial.body.value.score, null); assert.equal(initial.body.value.maxScore, maximum); assert.equal(initial.body.value.category, category);
      const saved = await invoke("saveReferenceOwnPreference", { referenceId: "czech:1", score: maximum }, actor); assert.equal(saved.status, 200); assert.equal(saved.body.value.score, maximum);
    }
    // A second assigned role never changes the actor's single stored profile category or bound.
    const multiRole = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, { userId: "demo-member-user", role: "priest" }); assert.equal(multiRole.status, 200); assert.equal(multiRole.body.value.category, "congregationMember"); assert.equal(multiRole.body.value.maxScore, 1); assert.equal(multiRole.body.value.score, 1);
    assert.equal((await invoke("saveReferenceOwnPreference", { referenceId: "czech:1", score: 2 }, { userId: "demo-member-user", role: "priest" })).body.error.code, "invalidInput");
    // Zero is persisted and remains distinguishable from an absent value.
    assert.equal((await invoke("saveReferenceOwnPreference", { referenceId: "czech:1", score: 0 }, priest)).body.value.score, 0); assert.equal((await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, priest)).body.value.score, 0);
    // A fresh repository and the browser-facing DB client both observe persisted state.
    const freshPool = new Pool({ connectionString: isolatedUrl }); try { const fresh = new PgInteractionRepository(freshPool); assert.equal(await fresh.getReferenceOwnPreference("pref-priest", "czech:1"), 0); } finally { await freshPool.end(); }
    const dbClient = new DbInteractionClient(async (action, input, actor) => { const result = await invoke(action, input, actor); return result.status >= 400 ? { success: false as const, error: result.body.error } : result.body; });
    const clientRead = await dbClient.getReferenceOwnPreference({ actor: { userId: "demo-priest-user", displayName: "ignored", role: "priest", personId: "demo-priest" }, referenceId: "czech:1" }); assert.equal(clientRead.success && clientRead.value.score, 0);
    const beforeCandidates = await invoke("queryCandidates", { serviceDate: "2026-07-27", serviceLanguage: "czech", preferenceThreshold: 0, candidateUsages: [] });
    const db = new Pool({ connectionString: isolatedUrl }); try {
      const stored = await db.query("select p.user_id, rp.score from reference_song_preferences rp join preference_profiles p on p.id=rp.profile_id where rp.reference_id='czech:1' order by p.user_id"); assert.deepEqual(stored.rows, [{ user_id: "demo-member-user", score: 1 }, { user_id: "demo-organist-user", score: 2 }, { user_id: "demo-priest-user", score: 0 }]);
      assert.equal((await db.query("select count(*)::int n from song_preferences")).rows[0].n, 3);
      await assert.rejects(db.query("insert into reference_song_preferences(profile_id, reference_id, score) values ('pref-priest','czech:1',1)"), /duplicate key/i);
      await assert.rejects(db.query("insert into reference_song_preferences(profile_id, reference_id, score) values ('pref-priest','czech:2',4)"), /check constraint/i);
      await assert.rejects(db.query("insert into reference_song_preferences(profile_id, reference_id, score) values ('missing-profile','czech:2',1)"), /foreign key/i);
      await assert.rejects(db.query("insert into reference_song_preferences(profile_id, reference_id, score) values ('pref-priest','czech:999999999',1)"), /foreign key/i);
    } finally { await db.end(); }
    assert.deepEqual(await invoke("queryCandidates", { serviceDate: "2026-07-27", serviceLanguage: "czech", preferenceThreshold: 0, candidateUsages: [] }), beforeCandidates);
    for (const [actor, expected] of [[priest, 3], [organist, 2], [member, 1]] as const) { const invalid = await invoke("saveReferenceOwnPreference", { referenceId: "czech:2", score: expected + 1 }, actor); assert.equal(invalid.status, 400); assert.equal(invalid.body.error.code, "invalidInput"); }
    assert.equal((await invoke("saveReferenceOwnPreference", { referenceId: "czech:2", score: 1.5 }, priest)).body.error.code, "invalidInput");
    const missing = await invoke("getReferenceOwnPreference", { referenceId: "czech:999999999" }, priest); assert.equal(missing.status, 404); assert.equal(missing.body.error.code, "notFound");
    const noProfile = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, { userId: "no-profile-user", role: "priest" }); assert.equal(noProfile.status, 404); assert.equal(noProfile.body.error.code, "notFound");
    const forged = await invoke("saveReferenceOwnPreference", { referenceId: "czech:2", score: 3, profileId: "pref-priest", category: "priest" }, member); assert.equal(forged.status, 400); assert.equal(forged.body.error.code, "invalidInput");
    for (const actor of [undefined, null, {}, { userId: "" }, { userId: "demo-priest-user", role: "bogus" }]) { const result = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, actor); assert.equal(result.status, 400); assert.equal(result.body.error.code, "invalidInput"); }
    for (const actor of [{ userId: "unknown-user" }, { userId: "inactive-preference-user" }, { userId: "roleless-preference-user" }, { userId: "demo-priest-user", role: "organist" }]) { const result = await invoke("getReferenceOwnPreference", { referenceId: "czech:1" }, actor); assert.equal(result.status, 403); assert.equal(result.body.error.code, "permissionDenied"); }
    const source = await import("node:fs/promises").then((fs) => fs.readFile("app/planning-lifecycle-client.tsx", "utf8")); assert.match(source, /runtimeMode === "db" && referencePreference/); assert.match(source, /Current:[\s\S]*not set/); assert.match(source, /Save preference/); assert.match(source, /MemoryInteractionClient[\s\S]*Reference preferences are available only in DB runtime/);
    console.log("Phase 31.5 evidence: schema constraints, actual handlers, stored-profile category bounds, null and zero, tampering, isolation, multi-role behavior, fresh repository/client reads, DB UI contract, memory and legacy regressions, and cleanup passed.");
  }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
  console.log("Phase 31.5 persistent own preferences on the authoritative reference catalog: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (runtime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = runtime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.5 persistent own preferences on the authoritative reference catalog: FAIL"); console.error(error); process.exitCode = 1; });
