import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST, useInteractionPoolForAcceptance } from "../app/api/interaction/route";
import { DbReferenceAntiphonRecommendationClient } from "../src/application/reference-antiphon-recommendation-client";
import { PgReferenceAntiphonRecommendationRepository } from "../src/application/reference-antiphon-recommendation";
import { loadAndValidateReferenceAntiphons, synchronizeReferenceAntiphons } from "../src/application/reference-antiphon-sync";
import { loadAndValidateReferenceCatalog, synchronizeReferenceCatalog } from "../src/application/reference-catalog-sync";
import type { PlanningRole } from "../src/planning-lifecycle";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl } from "./engineering-e1-core";

const PASS_LINE = "Phase 31.10A authoritative antiphon recommendation backend: PASS";
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
async function databaseFingerprintAt(databaseUrl: string): Promise<string> {
  const pool = new Pool({ connectionString: databaseUrl });
  try { return await databaseFingerprint(pool); } finally { await pool.end(); }
}

async function verifySchema(pool: Pool): Promise<void> {
  const columns = await pool.query("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='reference_antiphon_recommendations' order by ordinal_position");
  assert.deepEqual(columns.rows, [
    { column_name: "antiphon_id", data_type: "text", is_nullable: "NO", column_default: null },
    { column_name: "reference_song_id", data_type: "text", is_nullable: "NO", column_default: null },
    { column_name: "updated_at", data_type: "timestamp with time zone", is_nullable: "NO", column_default: "now()" },
  ]);
  assert.equal(Number((await pool.query("select count(*) n from pg_constraint where conrelid='reference_antiphon_recommendations'::regclass and contype='p'")).rows[0].n), 1);
  const foreignKeys = await pool.query(`select source.attname::text source_column, c.confrelid::regclass::text target_table,
      target.attname::text target_column, case c.confdeltype when 'c' then 'CASCADE' else c.confdeltype::text end on_delete
    from pg_constraint c
    join unnest(c.conkey, c.confkey) with ordinality k(source_attnum,target_attnum,ord) on true
    join pg_attribute source on source.attrelid=c.conrelid and source.attnum=k.source_attnum
    join pg_attribute target on target.attrelid=c.confrelid and target.attnum=k.target_attnum
    where c.conrelid='reference_antiphon_recommendations'::regclass and c.contype='f' order by source.attname::text`);
  assert.deepEqual(foreignKeys.rows, [
    { source_column: "antiphon_id", target_table: "reference_antiphons", target_column: "id", on_delete: "CASCADE" },
    { source_column: "reference_song_id", target_table: "reference_catalog_songs", target_column: "id", on_delete: "CASCADE" },
  ]);
  assert.deepEqual((await pool.query(`select i.indisunique, json_agg(a.attname::text order by k.ord)::text columns_json
    from pg_class x join pg_index i on i.indexrelid=x.oid join unnest(i.indkey) with ordinality k(attnum,ord) on true join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where x.relname='reference_antiphon_recommendations_song_id_idx' group by i.indisunique`)).rows, [{ indisunique: false, columns_json: '["reference_song_id"]' }]);
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
  const firstUpdatedAt = (await pool.query("select updated_at from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].updated_at;
  await pool.query("select pg_sleep(0.01)");
  assert.deepEqual(await client.set("czech:858", "czech:1"), { success: true, value: { antiphonId: "czech:858", recommendedSong: expectedSong } });
  assert.ok((await pool.query("select updated_at > $1 advanced from reference_antiphon_recommendations where antiphon_id='czech:858'", [firstUpdatedAt])).rows[0].advanced);
  assert.deepEqual(await client.get("czech:858"), { success: true, value: { antiphonId: "czech:858", recommendedSong: expectedSong } });
  const replacement = await client.set("czech:858", "polish:1");
  assert.equal(replacement.success && replacement.value.recommendedSong?.referenceSongId, "polish:1");
  assert.equal(Number((await pool.query("select count(*) n from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].n), 1);
  assert.deepEqual(await client.set("czech:858", null), { success: true, value: { antiphonId: "czech:858", recommendedSong: null } });
  assert.deepEqual(await client.set("czech:858", null), { success: true, value: { antiphonId: "czech:858", recommendedSong: null } });
}

async function verifyStructuredErrors(): Promise<void> {
  for (const actor of [
    { userId: "admin", role: "admin" },
    { userId: "priest", role: "priest" },
    { userId: "organist", role: "organist" },
    { userId: "member", role: "congregationMember" },
  ] as Actor[]) assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:800" }, actor)).status, 200);
  for (const actor of [{ userId: "priest", role: "priest" }, { userId: "organist", role: "organist" }, { userId: "member", role: "congregationMember" }] as Actor[]) {
    assert.deepEqual(await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:1" }, actor), { status: 403, body: { success: false, error: { code: "permissionDenied", message: "Only admin may manage antiphon recommendations." } } });
  }
  assert.deepEqual(await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:800" }), { status: 200, body: { success: true, value: { antiphonId: "czech:800", recommendedSong: null } } });
  assert.equal((await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:99999" })).status, 404);
  for (const antiphonId of ["czech:799", "czech:916", "czech:999", "polish:800", "bad"]) {
    assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId })).status, 400);
  }
  assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:858", extra: true })).status, 400);
  assert.equal((await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858" })).status, 400);
  assert.equal((await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: false })).status, 400);
  for (const actor of [undefined, null, {}, [], { userId: "" }, { userId: "missing", role: "admin" }, { userId: "inactive", role: "admin" }, { userId: "unassigned", role: "admin" }, { userId: "priest", role: "admin" }]) {
    const response = await POST(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "getReferenceAntiphonRecommendation", input: { antiphonId: "czech:858" }, actor }) }));
    assert.ok(response.status === 400 || response.status === 403);
    const body = await response.json(); assert.ok(body.error && ["invalidInput", "permissionDenied"].includes(body.error.code));
  }
  for (const input of [undefined, null, [], {}, { antiphonId: 858 }, { antiphonId: "czech:858", referenceSongId: "czech:1" }]) assert.equal((await invoke("getReferenceAntiphonRecommendation", input)).status, 400);
  const malformed = await POST(new Request("http://localhost/api/interaction", { method: "POST", body: "{" })); assert.equal(malformed.status, 400);
  assert.equal((await invoke("unsupported", {})).status, 400);
  const databaseUrl = process.env.DATABASE_URL; const runtime = process.env.ORGANY_RUNTIME;
  delete process.env.ORGANY_RUNTIME; assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:858" })).status, 400);
  process.env.ORGANY_RUNTIME = "db"; delete process.env.DATABASE_URL; assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:858" })).status, 500);
  process.env.DATABASE_URL = databaseUrl; process.env.ORGANY_RUNTIME = runtime;
}

async function verifyValidMissingAntiphon(pool: Pool): Promise<void> {
  await pool.query("delete from reference_antiphons where id='czech:915'");
  assert.deepEqual(await invoke("getReferenceAntiphonRecommendation", { antiphonId: "czech:915" }), { status: 404, body: { success: false, error: { code: "notFound", message: "Reference antiphon was not found." } } });
  assert.equal((await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:915", referenceSongId: "czech:1" })).status, 404);
  await synchronizeReferenceAntiphons(pool);
}

async function verifyIsolationRollbackAndConcurrency(pool: Pool): Promise<void> {
  const repository = new PgReferenceAntiphonRecommendationRepository(pool);
  assert.equal((await repository.set("czech:858", "czech:1")).kind, "ok");
  assert.equal((await repository.get("czech:859"))?.recommendedSong, null);
  await pool.query(`create function reject_phase_31_10a_song() returns trigger language plpgsql as $$ begin if new.reference_song_id='czech:3' then raise exception 'injected recommendation failure'; end if; return new; end $$;
    create trigger reject_phase_31_10a_song before insert or update on reference_antiphon_recommendations for each row execute function reject_phase_31_10a_song()`);
  await assert.rejects(() => repository.set("czech:858", "czech:3"), /injected recommendation failure/);
  assert.equal((await repository.get("czech:858"))?.recommendedSong?.referenceSongId, "czech:1");
  await pool.query("drop trigger reject_phase_31_10a_song on reference_antiphon_recommendations; drop function reject_phase_31_10a_song() ");
  const sameAntiphon = await Promise.all([repository.set("czech:858", "czech:1"), repository.set("czech:858", "czech:2")]);
  assert.ok(sameAntiphon.every((result) => result.kind === "ok"));
  assert.equal(Number((await pool.query("select count(*) n from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].n), 1);
  const differentAntiphons = await Promise.all([repository.set("czech:860", "czech:1"), repository.set("czech:861", "polish:1")]);
  assert.ok(differentAntiphons.every((result) => result.kind === "ok"));
  assert.deepEqual((await pool.query("select antiphon_id from reference_antiphon_recommendations where antiphon_id in ('czech:860','czech:861') order by antiphon_id")).rows.map((row) => row.antiphon_id), ["czech:860", "czech:861"]);
  await pool.query("delete from reference_antiphon_recommendations");
}

const UNAFFECTED_TABLES = ["antiphon_mappings", "liturgical_season_mappings", "song_preferences", "reference_song_preferences", "organist_repertoire", "reference_organist_repertoire", "melody_equivalence_classes", "song_melody_equivalence", "reference_melody_classes", "reference_song_melody_memberships", "service_contexts", "service_sets", "service_set_rows", "completed_services", "completed_service_rows"] as const;
async function unaffectedFingerprint(pool: Pool): Promise<string> {
  return JSON.stringify(await Promise.all(UNAFFECTED_TABLES.map(async (table) => [table, (await pool.query(`select * from ${table} order by 1,2`)).rows])));
}

async function verifyUnrelatedBackendBehaviorIsUnchanged(pool: Pool): Promise<void> {
  await pool.query(`insert into catalog_songs(song_id,language,number,title) values('legacy-song','czech','101','Legacy song');
    insert into antiphon_mappings(id,antiphon_key,song_id,synthetic) values('legacy-antiphon','legacy-key','legacy-song',false);
    insert into liturgical_season_mappings(id,season_key,song_id,synthetic) values('legacy-season','legacy-season','legacy-song',false);
    insert into preference_profiles(id,user_id,category) values('legacy-profile','priest','priest');
    insert into song_preferences(profile_id,song_id,score) values('legacy-profile','legacy-song',2);
    insert into organist_repertoire(organist_person_id,song_id) values('organist-person','legacy-song');
    insert into melody_equivalence_classes(id,label,synthetic) values('legacy-melody','Legacy melody',false);
    insert into song_melody_equivalence(song_id,class_id) values('legacy-song','legacy-melody')`);
  const candidateInput = { serviceDate: "2026-07-31", serviceLanguage: "czech", antiphonKey: "legacy-key" };
  const candidateBefore = await invoke("queryCandidates", candidateInput);
  assert.equal(candidateBefore.status, 200);
  assert.equal(candidateBefore.body.success, true);
  assert.ok(candidateBefore.body.value.length > 0);
  assert.equal(candidateBefore.body.value.some((candidate: any) => candidate.songId === "legacy-song"), false);
  assert.equal(candidateBefore.body.value.every((candidate: any) => candidate.antiphonMatch === false), true);
  const hydrationInput = { songs: [{ songId: "legacy-song", language: "czech", number: "101", title: "Legacy song" }], antiphonKey: "legacy-key" };
  const hydrationBefore = await invoke("hydrateCandidates", hydrationInput);
  assert.equal(hydrationBefore.status, 200);
  assert.deepEqual(hydrationBefore.body.value, [{
    songId: "legacy-song",
    language: "czech",
    number: "101",
    title: "Legacy song",
    equivalentNumbers: [],
    aggregatePreferenceScore: 0,
    antiphonMatch: false,
    seasonMatch: false,
    signal: "none",
    preferenceShade: "none",
    repertoire: false,
    availability: { kind: "available" },
    suppressedByMelodyWindow: false,
    orderKey: "rehydrated:czech:101:legacy-song",
  }]);
  const before = await unaffectedFingerprint(pool);
  await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:1" });
  assert.equal(await unaffectedFingerprint(pool), before, "legacy mappings, preferences, repertoire, melody, Service Context and lifecycle tables must remain unchanged");
  assert.deepEqual(await invoke("queryCandidates", candidateInput), candidateBefore);
  assert.deepEqual(await invoke("hydrateCandidates", hydrationInput), hydrationBefore);
  await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: null });
  assert.equal(await unaffectedFingerprint(pool), before);
}

async function verifySynchronizationSafety(pool: Pool): Promise<void> {
  await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:1" });
  const recommendationBeforeMetadataSync = (await pool.query("select * from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0];
  const catalogRecords = await loadAndValidateReferenceCatalog();
  const antiphonRecords = await loadAndValidateReferenceAntiphons();
  await synchronizeReferenceCatalog(pool, { records: catalogRecords.map((record) => record.id === "czech:1" ? { ...record, title: "Metadata-only catalog update" } : record) });
  await synchronizeReferenceAntiphons(pool, { records: antiphonRecords.map((record) => record.id === "czech:858" ? { ...record, title: "Metadata-only antiphon update" } : record) });
  assert.equal((await pool.query("select reference_song_id from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].reference_song_id, "czech:1");
  assert.deepEqual((await pool.query("select * from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0], recommendationBeforeMetadataSync);
  await assert.rejects(() => synchronizeReferenceCatalog(pool, { records: catalogRecords.map((record) => record.id === "czech:1" ? { ...record, title: "Must roll back" } : record), failBeforeCommit: true }), /Injected reference catalog synchronization failure/);
  assert.equal((await pool.query("select title from reference_catalog_songs where id='czech:1'")).rows[0].title, "Metadata-only catalog update");
  await assert.rejects(() => synchronizeReferenceAntiphons(pool, { records: antiphonRecords.map((record) => record.id === "czech:858" ? { ...record, title: "Must roll back" } : record), failBeforeCommit: true }), /Injected antiphon synchronization failure/);
  assert.equal((await pool.query("select title from reference_antiphons where id='czech:858'")).rows[0].title, "Metadata-only antiphon update");
  assert.equal((await pool.query("select reference_song_id from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].reference_song_id, "czech:1");
  await synchronizeReferenceCatalog(pool);
  await synchronizeReferenceAntiphons(pool);
  assert.equal((await pool.query("select reference_song_id from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].reference_song_id, "czech:1");
  await pool.query("delete from reference_antiphons where id='czech:858'");
  assert.equal(Number((await pool.query("select count(*) n from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].n), 0);
  await synchronizeReferenceAntiphons(pool); await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: "czech:1" });
  await pool.query("delete from reference_catalog_songs where id='czech:1'");
  assert.equal(Number((await pool.query("select count(*) n from reference_antiphon_recommendations where antiphon_id='czech:858'")).rows[0].n), 0);
  await synchronizeReferenceCatalog(pool);
  await invoke("setReferenceAntiphonRecommendation", { antiphonId: "czech:858", referenceSongId: null });
}

async function runAcceptance(databaseUrl: string): Promise<void> {
  await runNpm("db:migrate", databaseUrl);
  await runNpm("db:migrate", databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });
  let poolError: Error | undefined;
  (pool as Pool & { on(event: "error", listener: (error: Error) => void): void }).on("error", (error) => { poolError ??= error; });
  const restoreRoutePoolLease = useInteractionPoolForAcceptance(pool);
  try {
    await verifySchema(pool);
    await synchronizeReferenceCatalog(pool);
    await synchronizeReferenceAntiphons(pool);
    await pool.query("insert into catalog_persons(id,display_name,active,organist) values('organist-person','Organist',true,true); insert into app_users(id,display_name,person_id) values('admin','Admin',null),('priest','Priest',null),('organist','Organist','organist-person'),('member','Member',null),('inactive','Inactive',null),('unassigned','Unassigned',null); update app_users set active=false where id='inactive'; insert into app_user_roles(user_id,role) values('admin','admin'),('priest','priest'),('organist','organist'),('member','congregation_member'),('inactive','admin')");
    process.env.DATABASE_URL = databaseUrl;
    process.env.ORGANY_RUNTIME = "db";
    await verifyReadWriteAndExactShape(pool);
    await verifyStructuredErrors();
    await verifyValidMissingAntiphon(pool);
    await verifyIsolationRollbackAndConcurrency(pool);
    await verifyUnrelatedBackendBehaviorIsUnchanged(pool);
    await verifySynchronizationSafety(pool);
    if (poolError) throw poolError;
  } finally {
    restoreRoutePoolLease();
    await pool.end();
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.10a verification.");
  const guardUrl = process.env.DATABASE_URL;
  const guard = parseGuardDatabaseUrl(guardUrl);
  const before = await databaseFingerprintAt(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const databaseName = generateE1DatabaseName();
  const databaseUrl = deriveDatabaseUrl(guard, databaseName);
  const originalRuntime = process.env.ORGANY_RUNTIME;
  let databaseCreated = false;
  let databaseDropped = false;
  try {
    await control.query(createDatabaseSql(databaseName));
    databaseCreated = true;
    await runAcceptance(databaseUrl);
    const [, drop] = dropDatabaseSql(databaseName);
    await control.query(drop);
    databaseDropped = true;
    assert.equal(await databaseFingerprintAt(guardUrl), before);
    console.log(PASS_LINE);
  } catch (acceptanceError) {
    if (databaseCreated && !databaseDropped) {
      const [terminate, drop] = dropDatabaseSql(databaseName);
      const cleanupErrors: unknown[] = [];
      try { await control.query(terminate, [databaseName]); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
      try { await control.query(drop); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
      if (cleanupErrors.length) throw new AggregateError([acceptanceError, ...cleanupErrors], "Acceptance and deterministic database cleanup failed.");
    }
    throw acceptanceError;
  } finally {
    process.env.DATABASE_URL = guardUrl;
    if (originalRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = originalRuntime;
    await control.end();
  }
}
void main().catch((error) => { console.error("Phase 31.10A authoritative antiphon recommendation backend: FAIL"); console.error(error); process.exitCode = 1; });
