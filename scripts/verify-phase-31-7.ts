import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/interaction/route";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { DbInteractionClient } from "../app/planning-lifecycle-client";
import { ReferencePreferenceRequestTracker } from "../src/application/reference-preference-request-tracker";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

type Result = { status: number; body: any };
async function invoke(action: string, input: unknown, actor: unknown): Promise<Result> { const response = await POST(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }) })); return { status: response.status, body: await response.json() }; }
async function npmRun(name: string, url: string) { const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]); await new Promise<void>((resolve, reject) => { const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); }); }
async function fingerprint(url: string) { const pool = new Pool({ connectionString: url }); try { return JSON.stringify((await pool.query("select datname from pg_database where datname=current_database()" )).rows); } finally { await pool.end(); } }
const exact = (result: Result, id: string, person: string, active: boolean) => { assert.equal(result.status, 200); assert.deepEqual(result.body.value, { referenceSongId: id, organistPersonId: person, active }); assert.deepEqual(Object.keys(result.body.value).sort(), ["active", "organistPersonId", "referenceSongId"]); };

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.7 verification.");
  const guardUrl = process.env.DATABASE_URL; const guard = parseGuardDatabaseUrl(guardUrl); const before = await fingerprint(guardUrl); const control = new Pool({ connectionString: deriveControlUrl(guard) }); const name = generateE1DatabaseName(); await control.query(createDatabaseSql(name)); const isolatedUrl = deriveDatabaseUrl(guard, name); const oldRuntime = process.env.ORGANY_RUNTIME;
  try {
    await withCleanup(async () => {
      await npmRun("db:migrate", isolatedUrl); await npmRun("db:sync:reference-catalog", isolatedUrl);
      const db = new Pool({ connectionString: isolatedUrl }); let legacyBefore = "";
      try {
        await seedDemoInteractionKnowledge(db);
        await db.query("insert into catalog_persons(id,display_name,active,organist) values ('other-organist','Other',true,true),('inactive-organist','Inactive',false,true),('not-organist','Not organist',true,false)");
        await db.query("insert into app_users(id,display_name,person_id,active) values ('other-organist-user','Other','other-organist',true),('unlinked-organist','Unlinked',null,true),('inactive-link-user','Inactive link','inactive-organist',true),('wrong-link-user','Wrong link','not-organist',true),('roleless-user','Roleless',null,true),('inactive-user','Inactive user',null,false)");
        await db.query("insert into app_user_roles(user_id,role) values ('other-organist-user','organist'),('unlinked-organist','organist'),('inactive-link-user','organist'),('wrong-link-user','organist'),('inactive-user','organist')");
        const table = await db.query("select column_name,is_nullable from information_schema.columns where table_name='reference_organist_repertoire' order by ordinal_position"); assert.deepEqual(table.rows.map((r) => r.column_name), ["organist_person_id", "reference_song_id", "updated_at"]); assert.ok(table.rows.every((r) => r.is_nullable === "NO"));
        const fks = await db.query("select count(*)::int n from information_schema.table_constraints where table_name='reference_organist_repertoire' and constraint_type='FOREIGN KEY'"); assert.equal(fks.rows[0].n, 2);
        const unique = await db.query("select indexdef from pg_indexes where tablename='reference_organist_repertoire' and indexname='reference_organist_repertoire_person_song_idx'"); assert.match(String(unique.rows[0].indexdef), /UNIQUE.*organist_person_id.*reference_song_id/i);
        legacyBefore = JSON.stringify({ columns: (await db.query("select column_name,data_type,is_nullable from information_schema.columns where table_name='organist_repertoire' order by ordinal_position")).rows, rows: (await db.query("select * from organist_repertoire order by organist_person_id,song_id")).rows });
      } finally { await db.end(); }
      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";
      const organist = { userId: "demo-organist-user", role: "organist" }; const admin = { userId: "demo-admin-user", role: "admin" }; const priest = { userId: "demo-priest-user", role: "priest" }; const member = { userId: "demo-member-user", role: "congregationMember" };
      const beforeCandidates = await invoke("queryCandidates", { serviceDate: "2026-07-28", serviceLanguage: "czech", candidateUsages: [] }, priest);
      const beforePreference = await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, admin);
      const ownPreference = await invoke("getReferenceOwnPreference", { referenceSongId: "czech:1" }, priest); assert.equal(ownPreference.status, 200); assert.equal(ownPreference.body.value.score, null);
      exact(await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1" }, organist), "czech:1", "demo-organist", false);
      exact(await invoke("setReferenceRepertoireMembership", { referenceSongId: "czech:1", active: true }, organist), "czech:1", "demo-organist", true);
      exact(await invoke("setReferenceRepertoireMembership", { referenceSongId: "czech:1", active: true }, organist), "czech:1", "demo-organist", true);
      let check = new Pool({ connectionString: isolatedUrl }); try { assert.equal((await check.query("select count(*)::int n from reference_organist_repertoire")).rows[0].n, 1); } finally { await check.end(); }
      exact(await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:2" }, organist), "czech:2", "demo-organist", false);
      exact(await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1", organistPersonId: "other-organist" }, admin), "czech:1", "other-organist", false);
      exact(await invoke("setReferenceRepertoireMembership", { referenceSongId: "czech:1", organistPersonId: "other-organist", active: true }, admin), "czech:1", "other-organist", true);
      exact(await invoke("setReferenceRepertoireMembership", { referenceSongId: "czech:1", active: false }, organist), "czech:1", "demo-organist", false);
      exact(await invoke("setReferenceRepertoireMembership", { referenceSongId: "czech:1", active: false }, organist), "czech:1", "demo-organist", false);
      assert.equal((await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1" }, admin)).body.error.code, "invalidInput");
      for (const target of ["missing", "inactive-organist", "not-organist"]) assert.equal((await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1", organistPersonId: target }, admin)).body.error.code, "notFound");
      assert.equal((await invoke("setReferenceRepertoireMembership", { referenceSongId: "czech:1", organistPersonId: "other-organist", active: false }, organist)).body.error.code, "invalidInput");
      for (const userId of ["unlinked-organist", "inactive-link-user", "wrong-link-user"]) assert.equal((await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1" }, { userId, role: "organist" })).body.error.code, "permissionDenied");
      for (const actor of [priest, member]) for (const action of ["getReferenceRepertoireMembership", "setReferenceRepertoireMembership"]) assert.equal((await invoke(action, action.startsWith("set") ? { referenceSongId: "czech:1", active: true } : { referenceSongId: "czech:1" }, actor)).body.error.code, "permissionDenied");
      assert.equal((await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:999999999", organistPersonId: "other-organist" }, admin)).body.error.code, "notFound");
      for (const input of [{}, { referenceSongId: 1 }, { referenceSongId: "bad" }, { referenceSongId: "czech:1", extra: true }, { referenceSongId: "czech:1", active: "yes" }]) assert.equal((await invoke("setReferenceRepertoireMembership", input, organist)).body.error.code, "invalidInput");
      for (const actor of [null, {}, { userId: "" }, { userId: "demo-organist-user", role: "bogus" }, { userId: "demo-organist-user", role: "organist", personId: "forged" }]) assert.equal((await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1" }, actor)).body.error.code, "invalidInput");
      for (const actor of [{ userId: "missing", role: "organist" }, { userId: "inactive-user", role: "organist" }, { userId: "roleless-user" }, { userId: "demo-priest-user", role: "organist" }]) assert.equal((await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1" }, actor)).body.error.code, "permissionDenied");
      const client = new DbInteractionClient(async (action, input, actor) => (await invoke(action, input, actor)).body); exact({ status: 200, body: await client.getReferenceRepertoireMembership({ actor: admin as never, referenceSongId: "czech:1", organistPersonId: "other-organist" }) }, "czech:1", "other-organist", true); exact({ status: 200, body: await client.setReferenceRepertoireMembership({ actor: admin as never, referenceSongId: "czech:1", organistPersonId: "other-organist", active: false }) }, "czech:1", "other-organist", false);
      const tracker = new ReferencePreferenceRequestTracker(); for (const scope of ["song", "actor", "role", "person-link", "admin-target", "runtime", "competing-write"]) { const stale = tracker.begin(); const current = tracker.begin(); assert.equal(tracker.isCurrent(stale), false, scope); assert.equal(tracker.isCurrent(current), true, scope); }
      const ui = await readFile(new URL("../app/planning-lifecycle-client.tsx", import.meta.url), "utf8"); for (const pattern of [/My repertoire:/, /Add to my repertoire/, /Remove from my repertoire/, /Authoritative repertoire organist target/, /referenceRepertoireRequests/, /activeActor\.personId/]) assert.match(ui, pattern); assert.doesNotMatch(ui, /referenceRepertoireTarget[^\n]*demo-organist/);
      assert.deepEqual(await invoke("queryCandidates", { serviceDate: "2026-07-28", serviceLanguage: "czech", candidateUsages: [] }, priest), beforeCandidates); assert.deepEqual(await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, admin), beforePreference);
      check = new Pool({ connectionString: isolatedUrl }); try { const legacyAfter = JSON.stringify({ columns: (await check.query("select column_name,data_type,is_nullable from information_schema.columns where table_name='organist_repertoire' order by ordinal_position")).rows, rows: (await check.query("select * from organist_repertoire order by organist_person_id,song_id")).rows }); assert.equal(legacyAfter, legacyBefore); assert.equal((await check.query("select count(*)::int n from reference_organist_repertoire")).rows[0].n, 0); } finally { await check.end(); }
      process.env.ORGANY_RUNTIME = "memory"; assert.equal((await invoke("getReferenceRepertoireMembership", { referenceSongId: "czech:1" }, organist)).status, 400); process.env.ORGANY_RUNTIME = "db";
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    process.env.DATABASE_URL = guardUrl; assert.equal(await fingerprint(guardUrl), before); assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    console.log("Phase 31.7 authoritative reference organist repertoire: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (oldRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = oldRuntime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.7 authoritative reference organist repertoire: FAIL"); console.error(error); process.exitCode = 1; });
