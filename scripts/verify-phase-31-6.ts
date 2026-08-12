import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/interaction/route";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { DbInteractionClient } from "../app/planning-lifecycle-client";
import { ReferencePreferenceRequestTracker } from "../src/application/reference-preference-request-tracker";
import { useLocalActorSimulatorForAcceptance } from "../src/application/protected-actor";
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
      const seed = new Pool({ connectionString: isolatedUrl }); try { await seedDemoInteractionKnowledge(seed); await seed.query("insert into app_users (id, display_name, active) values ('aggregate-no-profile', 'Aggregate Reader', true), ('aggregate-inactive', 'Inactive Reader', false)"); await seed.query("insert into app_user_roles (user_id, role) values ('aggregate-no-profile', 'priest'), ('aggregate-no-profile', 'organist'), ('aggregate-no-profile', 'congregation_member'), ('aggregate-no-profile', 'admin'), ('aggregate-inactive', 'priest')"); } finally { await seed.end(); }
      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";
      useLocalActorSimulatorForAcceptance();
      const priest = { userId: "demo-priest-user", role: "priest" }; const organist = { userId: "demo-organist-user", role: "organist" }; const member = { userId: "demo-member-user", role: "congregationMember" }; const admin = { userId: "demo-admin-user", role: "admin" };
      const beforeCandidates = await invoke("queryCandidates", { serviceDate: "2026-07-27", serviceLanguage: "czech", preferenceThreshold: 0, candidateUsages: [] }, priest);
      for (const actor of [priest, organist, member, admin]) { const empty = await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, actor); assert.equal(empty.status, 200); assert.deepEqual(empty.body.value, { referenceSongId: "czech:1", aggregateScore: 0 }); }
      for (const role of ["priest", "organist", "congregationMember", "admin"]) { const result = await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, { userId: "aggregate-no-profile", role }); assert.equal(result.status, 200); assert.equal(result.body.value.aggregateScore, 0); }
      // The aggregate contract exposes neither a profile nor any actor's individual vote.
      assert.deepEqual(Object.keys((await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, admin)).body.value).sort(), ["aggregateScore", "referenceSongId"]);
      const own = await invoke("getReferenceOwnPreference", { referenceSongId: "czech:1" }, priest); assert.deepEqual(own.body.value, { referenceSongId: "czech:1", category: "priest", score: null, limit: 3 });
      assert.deepEqual((await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 3 }, priest)).body.value, { referenceSongId: "czech:1", category: "priest", score: 3, limit: 3 });
      await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 2 }, organist); await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 1 }, member);
      assert.deepEqual((await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, admin)).body.value, { referenceSongId: "czech:1", aggregateScore: 6 });
      await invoke("saveReferenceOwnPreference", { referenceSongId: "czech:1", score: 0 }, priest);
      assert.equal((await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, member)).body.value.aggregateScore, 3);
      assert.equal((await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:2" }, admin)).body.value.aggregateScore, 0);
      const client = new DbInteractionClient(async (action, input, actor) => { const result = await invoke(action, input, actor); return result.body; });
      assert.deepEqual((await client.getReferencePreferenceAggregate({ actor: admin as never, referenceSongId: "czech:1" })).value, { referenceSongId: "czech:1", aggregateScore: 3 });
      for (const actor of [undefined, null, {}, { userId: "" }, { userId: "demo-priest-user", role: "bogus" }]) { const result = await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, actor); assert.equal(result.status, 400); assert.equal(result.body.error.code, "invalidInput"); }
      for (const actor of [{ userId: "missing-user", role: "priest" }, { userId: "aggregate-inactive", role: "priest" }]) { const result = await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, actor); assert.equal(result.status, 403); assert.equal(result.body.error.code, "permissionDenied"); }
      assert.equal((await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:999999999" }, admin)).status, 404);
      assert.equal((await invoke("getReferencePreferenceAggregate", { referenceSongId: "bad" }, admin)).status, 400);
      assert.equal((await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1", profileId: "pref-priest" }, admin)).status, 400);
      const db = new Pool({ connectionString: isolatedUrl }); try { assert.equal((await db.query("select sum(score)::integer total from reference_song_preferences where reference_song_id='czech:1'")).rows[0].total, 3); } finally { await db.end(); }
      const afterCandidates = await invoke("queryCandidates", { serviceDate: "2026-07-27", serviceLanguage: "czech", preferenceThreshold: 0, candidateUsages: [] }, priest);
      assert.equal(beforeCandidates.status, 200); assert.equal(afterCandidates.status, 200);
      const beforeById = new Map(beforeCandidates.body.value.map((candidate: any) => [candidate.songId, candidate]));
      const afterById = new Map(afterCandidates.body.value.map((candidate: any) => [candidate.songId, candidate]));
      assert.deepEqual([...afterById.keys()].sort(), [...beforeById.keys()].sort());
      for (const [songId, beforeCandidate] of beforeById) {
        const afterCandidate = afterById.get(songId); assert(afterCandidate);
        if (songId === "czech:1") {
          const { aggregatePreferenceScore: beforeScore, preferenceShade: beforeShade, orderKey: beforeOrder, melodyMembers: beforeMembers, ...beforeRest } = beforeCandidate as any;
          const { aggregatePreferenceScore: afterScore, preferenceShade: afterShade, orderKey: afterOrder, melodyMembers: afterMembers, ...afterRest } = afterCandidate as any;
          assert.equal(beforeScore, 0); assert.equal(beforeShade, "none");
          assert.equal(afterScore, 3); assert.equal(afterShade, "medium"); assert.equal(afterOrder, beforeOrder);
          assert.deepEqual(afterRest, beforeRest);
          const beforeMemberById = new Map((beforeMembers as any[]).map((entry) => [entry.songId, entry]));
          const afterMemberById = new Map((afterMembers as any[]).map((entry) => [entry.songId, entry]));
          assert.deepEqual([...afterMemberById.keys()], [...beforeMemberById.keys()]);
          for (const [memberId, beforeMember] of beforeMemberById) {
            const afterMember = afterMemberById.get(memberId); assert(afterMember);
            if (memberId === "czech:1") {
              assert.equal((beforeMember as any).aggregatePreferenceScore, 0);
              assert.equal((afterMember as any).aggregatePreferenceScore, 3);
              const { aggregatePreferenceScore: _before, ...beforeMemberRest } = beforeMember as any;
              const { aggregatePreferenceScore: _after, ...afterMemberRest } = afterMember as any;
              assert.deepEqual(afterMemberRest, beforeMemberRest);
            } else {
              assert.deepEqual(afterMember, beforeMember);
            }
          }
        } else {
          assert.deepEqual(afterCandidate, beforeCandidate);
        }
      }
      const tracker = new ReferencePreferenceRequestTracker(); const applied: number[] = []; const stale = tracker.begin(); const current = tracker.begin(); if (tracker.isCurrent(stale)) applied.push(6); if (tracker.isCurrent(current)) applied.push(3); assert.deepEqual(applied, [3]);
      const ui = await readFile(new URL("../app/planning-lifecycle-client.tsx", import.meta.url), "utf8"); assert.match(ui, /Reference preference aggregate/); assert.match(ui, /selectedRole !== "admin" && referencePreference/); assert.match(ui, /refreshReferenceAggregate\(selectedReferenceId, activeActor\)/);
      console.log("Phase 31.6 evidence: separate aggregate contract, admin and all roles, privacy, errors, isolation, refresh staleness, actual route, PostgreSQL, DB client, unchanged own contract, authoritative candidate aggregate projection without candidate-set or candidate-order mutation, and UI projection passed.");
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    process.env.DATABASE_URL = guardUrl; assert.equal(await fingerprint(guardUrl), before); assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    console.log("Phase 31.6 cleanup evidence: guard database fingerprint unchanged and temporary database removed.");
    console.log("Phase 31.6 authoritative reference aggregate preference: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (priorRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = priorRuntime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.6 authoritative reference aggregate preference: FAIL"); console.error(error); process.exitCode = 1; });