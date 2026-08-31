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
type Actor = { userId: string; role?: string };
const GET = "getReferenceRepertoireMembership";
const SET = "setReferenceRepertoireMembership";

async function invoke(action: string, input: unknown, actor: unknown): Promise<Result> {
  const response = await POST(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }) }));
  return { status: response.status, body: await response.json() };
}
async function npmRun(name: string, url: string) {
  const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  await new Promise<void>((resolve, reject) => { const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); });
}
async function fingerprint(url: string) { const pool = new Pool({ connectionString: url }); try { return JSON.stringify((await pool.query("select datname from pg_database where datname=current_database()")).rows); } finally { await pool.end(); } }
function exact(result: Result, id: string, person: string, active: boolean) { assert.equal(result.status, 200); assert.deepEqual(result.body.value, { referenceSongId: id, organistPersonId: person, active }); assert.deepEqual(Object.keys(result.body.value).sort(), ["active", "organistPersonId", "referenceSongId"]); }
async function expectErrorBoth(actor: unknown, readInput: unknown, writeInput: unknown, code: string) {
  for (const [action, input] of [[GET, readInput], [SET, writeInput]] as const) { const result = await invoke(action, input, actor); assert.equal(result.body.error?.code, code, `${action} expected ${code}: ${JSON.stringify(result.body)}`); }
}
type DeferredRequest = { actual: Promise<Result>; resolve: (payload: unknown) => void };
async function deferredStale(
  label: string,
  older: (client: DbInteractionClient) => Promise<any>,
  current: (client: DbInteractionClient) => Promise<any>,
  expectedCurrent: unknown,
  between: () => Promise<void> = async () => undefined,
) {
  const pending: DeferredRequest[] = [];
  const client = new DbInteractionClient(((action: string, input: unknown, actor?: Actor) => new Promise((resolve) => {
    // The real DB request starts immediately, but its browser transport promise remains unresolved.
    pending.push({ actual: invoke(action, input, actor), resolve });
  })) as any);
  const tracker = new ReferencePreferenceRequestTracker(); const applied: unknown[] = [];
  const olderToken = tracker.begin(); const olderPromise = older(client);
  const olderActual = await pending[0].actual;
  await between();
  const currentToken = tracker.begin(); const currentPromise = current(client);
  const currentActual = await pending[1].actual;
  pending[1].resolve(currentActual.body); const currentResult = await currentPromise;
  if (tracker.isCurrent(currentToken)) applied.push(currentResult.success ? currentResult.value : currentResult.error);
  pending[0].resolve(olderActual.body); const olderResult = await olderPromise;
  if (tracker.isCurrent(olderToken)) applied.push(olderResult.success ? olderResult.value : olderResult.error);
  assert.deepEqual(applied, [expectedCurrent], `${label} stale response overwrote current scope`);
}

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
        await db.query("insert into app_user_roles(user_id,role) values ('other-organist-user','organist'),('unlinked-organist','organist'),('inactive-link-user','organist'),('wrong-link-user','organist'),('inactive-user','organist'),('demo-organist-user','admin')");
        const table = await db.query("select column_name,is_nullable from information_schema.columns where table_name='reference_organist_repertoire' order by ordinal_position"); assert.deepEqual(table.rows.map((r) => r.column_name), ["organist_person_id", "reference_song_id", "updated_at"]); assert.ok(table.rows.every((r) => r.is_nullable === "NO"));
        assert.equal((await db.query("select count(*)::int n from information_schema.table_constraints where table_name='reference_organist_repertoire' and constraint_type='FOREIGN KEY'")).rows[0].n, 2);
        const unique = await db.query("select indexdef from pg_indexes where tablename='reference_organist_repertoire' and indexname='reference_organist_repertoire_person_song_idx'"); assert.match(String(unique.rows[0].indexdef), /UNIQUE.*organist_person_id.*reference_song_id/i);
        legacyBefore = JSON.stringify({ columns: (await db.query("select column_name,data_type,is_nullable from information_schema.columns where table_name='organist_repertoire' order by ordinal_position")).rows, rows: (await db.query("select * from organist_repertoire order by organist_person_id,song_id")).rows });
      } finally { await db.end(); }

      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";
      useLocalActorSimulatorForAcceptance();
      const organist = { userId: "demo-organist-user", role: "organist" }; const otherOrganist = { userId: "other-organist-user", role: "organist" }; const admin = { userId: "demo-admin-user", role: "admin" }; const priest = { userId: "demo-priest-user", role: "priest" }; const member = { userId: "demo-member-user", role: "congregationMember" };
      const beforeCandidates = await invoke("queryCandidates", { serviceDate: "2026-07-28", serviceLanguage: "czech", candidateUsages: [] }, priest);
      const beforePreference = await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, admin);

      // Full lifecycle, idempotence, exact row count, isolation, and updated_at policy.
      exact(await invoke(GET, { referenceSongId: "czech:1" }, organist), "czech:1", "demo-organist", false);
      exact(await invoke(SET, { referenceSongId: "czech:1", active: true }, organist), "czech:1", "demo-organist", true);
      let check = new Pool({ connectionString: isolatedUrl }); let firstUpdatedAtEpoch: number;
      try { const row = (await check.query("select extract(epoch from updated_at)::double precision updated_at_epoch from reference_organist_repertoire where organist_person_id='demo-organist' and reference_song_id='czech:1'")).rows[0]; firstUpdatedAtEpoch = Number(row.updated_at_epoch); assert.ok(Number.isFinite(firstUpdatedAtEpoch)); } finally { await check.end(); }
      exact(await invoke(SET, { referenceSongId: "czech:1", active: true }, organist), "czech:1", "demo-organist", true);
      check = new Pool({ connectionString: isolatedUrl }); try { const rows = await check.query("select extract(epoch from updated_at)::double precision updated_at_epoch from reference_organist_repertoire where organist_person_id='demo-organist' and reference_song_id='czech:1'"); assert.equal(rows.rows.length, 1); assert.equal(Number(rows.rows[0].updated_at_epoch), firstUpdatedAtEpoch!, "idempotent add preserves the native PostgreSQL timestamp because no write occurs"); } finally { await check.end(); }
      exact(await invoke(GET, { referenceSongId: "czech:2" }, organist), "czech:2", "demo-organist", false);
      exact(await invoke(GET, { referenceSongId: "czech:1", organistPersonId: "other-organist" }, admin), "czech:1", "other-organist", false);
      exact(await invoke(SET, { referenceSongId: "czech:1", active: false }, organist), "czech:1", "demo-organist", false);
      exact(await invoke(SET, { referenceSongId: "czech:1", active: false }, organist), "czech:1", "demo-organist", false);
      check = new Pool({ connectionString: isolatedUrl }); try { await check.query("select pg_sleep(0.01)"); } finally { await check.end(); }
      exact(await invoke(SET, { referenceSongId: "czech:1", active: true }, organist), "czech:1", "demo-organist", true);
      check = new Pool({ connectionString: isolatedUrl }); try { const rows = await check.query("select extract(epoch from updated_at)::double precision updated_at_epoch from reference_organist_repertoire where organist_person_id='demo-organist' and reference_song_id='czech:1'"); assert.equal(rows.rows.length, 1); assert.ok(Number(rows.rows[0].updated_at_epoch) > firstUpdatedAtEpoch!, "remove/re-add receives a strictly later native PostgreSQL timestamp"); } finally { await check.end(); }

      // Every required error category is exercised through both real actions.
      for (const pair of [[{}, {}], [{ referenceSongId: 1 }, { referenceSongId: 1, active: true }], [{ referenceSongId: "czech:1", extra: true }, { referenceSongId: "czech:1", active: true, extra: true }]] as const) await expectErrorBoth(organist, pair[0], pair[1], "invalidInput");
      await expectErrorBoth(admin, { referenceSongId: "czech:999999999", organistPersonId: "other-organist" }, { referenceSongId: "czech:999999999", organistPersonId: "other-organist", active: true }, "notFound");
      for (const target of ["missing", "inactive-organist", "not-organist"]) await expectErrorBoth(admin, { referenceSongId: "czech:1", organistPersonId: target }, { referenceSongId: "czech:1", organistPersonId: target, active: true }, "notFound");
      await expectErrorBoth(organist, { referenceSongId: "czech:1", organistPersonId: "other-organist" }, { referenceSongId: "czech:1", organistPersonId: "other-organist", active: false }, "invalidInput");
      for (const userId of ["unlinked-organist", "inactive-link-user", "wrong-link-user"]) await expectErrorBoth({ userId, role: "organist" }, { referenceSongId: "czech:1" }, { referenceSongId: "czech:1", active: true }, "permissionDenied");
      for (const actor of [priest, member]) await expectErrorBoth(actor, { referenceSongId: "czech:1" }, { referenceSongId: "czech:1", active: true }, "permissionDenied");
      assert.equal((await invoke(GET, { referenceSongId: "czech:1" }, admin)).body.error.code, "invalidInput"); assert.equal((await invoke(SET, { referenceSongId: "czech:1", active: true }, admin)).body.error.code, "invalidInput");
      for (const actor of [null, {}, { userId: "" }, { userId: "demo-organist-user", role: "organist", extra: true }, { userId: "demo-organist-user", role: "malformed" }]) await expectErrorBoth(actor, { referenceSongId: "czech:1" }, { referenceSongId: "czech:1", active: true }, "invalidInput");
      for (const actor of [{ userId: "missing-user", role: "organist" }, { userId: "inactive-user", role: "organist" }, { userId: "roleless-user" }, { userId: "demo-priest-user", role: "organist" }]) await expectErrorBoth(actor, { referenceSongId: "czech:1" }, { referenceSongId: "czech:1", active: true }, "permissionDenied");

      // Browser DB client calls both actual actions.
      const client = new DbInteractionClient(async (action, input, actor) => (await invoke(action, input, actor)).body);
      exact({ status: 200, body: await client.getReferenceRepertoireMembership({ actor: organist as never, referenceSongId: "czech:1" }) }, "czech:1", "demo-organist", true);
      exact({ status: 200, body: await client.setReferenceRepertoireMembership({ actor: organist as never, referenceSongId: "czech:1", active: true }) }, "czech:1", "demo-organist", true);

      // Genuinely deferred browser transport promises cover every invalidation dimension.
      const ownRead = (c: DbInteractionClient) => c.getReferenceRepertoireMembership({ actor: organist as never, referenceSongId: "czech:1" });
      await deferredStale("song", ownRead, (c) => c.getReferenceRepertoireMembership({ actor: organist as never, referenceSongId: "czech:2" }), { referenceSongId: "czech:2", organistPersonId: "demo-organist", active: false });
      await deferredStale("actor", ownRead, (c) => c.getReferenceRepertoireMembership({ actor: otherOrganist as never, referenceSongId: "czech:1" }), { referenceSongId: "czech:1", organistPersonId: "other-organist", active: false });
      await deferredStale("role", ownRead, (c) => c.getReferenceRepertoireMembership({ actor: { userId: "demo-organist-user", role: "admin" } as never, referenceSongId: "czech:1", organistPersonId: "other-organist" }), { referenceSongId: "czech:1", organistPersonId: "other-organist", active: false });
      await deferredStale("person link", (c) => c.getReferenceRepertoireMembership({ actor: otherOrganist as never, referenceSongId: "czech:1" }), (c) => c.getReferenceRepertoireMembership({ actor: otherOrganist as never, referenceSongId: "czech:1" }), { referenceSongId: "czech:1", organistPersonId: "demo-organist", active: true }, async () => { const pool = new Pool({ connectionString: isolatedUrl }); try { await pool.query("update app_users set person_id='demo-organist' where id='other-organist-user'"); } finally { await pool.end(); } });
      await deferredStale("admin target", (c) => c.getReferenceRepertoireMembership({ actor: admin as never, referenceSongId: "czech:1", organistPersonId: "demo-organist" }), (c) => c.getReferenceRepertoireMembership({ actor: admin as never, referenceSongId: "czech:1", organistPersonId: "other-organist" }), { referenceSongId: "czech:1", organistPersonId: "other-organist", active: false });
      await deferredStale("runtime", ownRead, (c) => c.getReferenceRepertoireMembership({ actor: organist as never, referenceSongId: "czech:1" }), { code: "invalidInput", message: "Interaction DB runtime is not enabled." }, async () => { process.env.ORGANY_RUNTIME = "memory"; }); process.env.ORGANY_RUNTIME = "db";
      await deferredStale("competing writes", (c) => c.setReferenceRepertoireMembership({ actor: organist as never, referenceSongId: "czech:1", active: false }), (c) => c.setReferenceRepertoireMembership({ actor: organist as never, referenceSongId: "czech:1", active: true }), { referenceSongId: "czech:1", organistPersonId: "demo-organist", active: true });
      exact(await invoke(GET, { referenceSongId: "czech:1" }, organist), "czech:1", "demo-organist", true);

      // Deterministic UI contract evidence after Catalog step 3: authoritative repertoire drives Catalog availability and guarded role-aware mutations.
      const ui = await readFile(new URL("../app/planning-lifecycle-client.tsx", import.meta.url), "utf8");
      const runtimeClients = await readFile(new URL("../app/planning-runtime-clients.ts", import.meta.url), "utf8");
      const catalogUi = await readFile(new URL("../app/catalog-workspace.tsx", import.meta.url), "utf8");
      const candidateService = await readFile(new URL("../src/application/reference-candidate-service.ts", import.meta.url), "utf8");
      for (const pattern of [/aria-label="Catalog organist"/, /canManageRepertoire/, /viewMode === "melodies" && availabilityMode === "available"/, /viewMode === "songs" && availabilityMode === "unavailable"/, /candidate\.repertoire/, /member\.repertoire/, /window\.confirm/, /await reloadCandidates\(\)/, /<MelodyClassDetail/, /className="candidate-inline-detail"/]) assert.match(catalogUi, pattern);
      for (const pattern of [/members\.some\(\(member\) => member\.repertoire\)/, /availabilityMode === "available"/, /classHasRepertoire/]) assert.match(candidateService, pattern);
      assert.doesNotMatch(catalogUi, /disabled=\{actor\.role === "organist"\}/);
      assert.match(catalogUi, /actor\.role === "organist" && actor\.personId === organistPersonId/);
      assert.match(catalogUi, /actor\.role === "admin" \? organistPersonId : undefined/);
      assert.match(catalogUi, /freshAvailableClass[\s\S]*?find\(\(member\) => member\.repertoire\)/);
      for (const pattern of [/getReferenceRepertoireMembership/, /setReferenceRepertoireMembership/]) assert.match(runtimeClients, pattern);
      assert.match(ui, /runtimeMode !== "db"/);
      assert.match(catalogUi, /canManageRepertoire[\s\S]*?actor\.role === "organist"[\s\S]*?actor\.personId === organistPersonId/);
      const memoryClientSection = runtimeClients.slice(runtimeClients.indexOf("export class MemoryInteractionClient"), runtimeClients.indexOf("export class DbCatalogClient")); assert.match(memoryClientSection, /getReferenceRepertoireMembership\(\).*permissionDenied/); assert.match(memoryClientSection, /setReferenceRepertoireMembership\(\).*permissionDenied/);

      assert.deepEqual(await invoke("queryCandidates", { serviceDate: "2026-07-28", serviceLanguage: "czech", candidateUsages: [] }, priest), beforeCandidates); assert.deepEqual(await invoke("getReferencePreferenceAggregate", { referenceSongId: "czech:1" }, admin), beforePreference);
      check = new Pool({ connectionString: isolatedUrl }); try { await check.query("delete from reference_organist_repertoire"); const legacyAfter = JSON.stringify({ columns: (await check.query("select column_name,data_type,is_nullable from information_schema.columns where table_name='organist_repertoire' order by ordinal_position")).rows, rows: (await check.query("select * from organist_repertoire order by organist_person_id,song_id")).rows }); assert.equal(legacyAfter, legacyBefore); assert.equal((await check.query("select count(*)::int n from reference_organist_repertoire")).rows[0].n, 0); } finally { await check.end(); }
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    process.env.DATABASE_URL = guardUrl; assert.equal(await fingerprint(guardUrl), before); assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    console.log("Phase 31.7 authoritative reference organist repertoire: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (oldRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = oldRuntime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.7 authoritative reference organist repertoire: FAIL"); console.error(error); process.exitCode = 1; });
