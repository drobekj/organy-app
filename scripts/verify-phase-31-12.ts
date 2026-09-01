import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST, useInteractionPoolForAcceptance } from "../app/api/interaction/route";
import { POST as planningLifecyclePOST } from "../app/api/planning-lifecycle/route";
import type { CandidateQueryInput, CandidateQueryResult } from "../src/application/interaction-contracts";
import { useLocalActorSimulatorForAcceptance } from "../src/application/protected-actor";
import { disposeAppDbPoolForAcceptance } from "../src/db/app-pool";
import { candidatesForView } from "../src/planning-lifecycle/candidate-view";
import {
  createDatabaseSql,
  createNpmInvocation,
  deriveControlUrl,
  deriveDatabaseUrl,
  dropDatabaseSql,
  generateE1DatabaseName,
  parseGuardDatabaseUrl,
  withCleanup,
} from "./engineering-e1-core";

const PASS_LINE = "Phase 31.12 authoritative Planning candidates: PASS";
const ACTOR = { userId: "demo-admin-user", role: "admin" } as const;

type ExtendedCandidate = CandidateQueryResult & {
  melodyClassId: string;
  melodyMembers: Array<{
    songId: string;
    language: "czech" | "polish";
    number: string;
    title: string;
    repertoire: boolean;
    aggregatePreferenceScore: number;
    sheetMusicUrl?: string;
  }>;
};

function runNpm(name: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
    const child = spawn(invocation.command, invocation.args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed with exit code ${code ?? 1}.`)));
  });
}

async function invoke(action: string, input: unknown) {
  const response = await POST(new Request("http://localhost/api/interaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  }));
  return { status: response.status, body: await response.json() as any };
}

async function invokePlanning(action: string, input: unknown) {
  const response = await planningLifecyclePOST(new Request("http://localhost/api/planning-lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input, actor: ACTOR }),
  }));
  return { status: response.status, body: await response.json() as any };
}

async function databaseFingerprint(pool: Pool): Promise<string> {
  const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => String(row.tablename));
  return JSON.stringify(await Promise.all(tables.map(async (table) => [table, Number((await pool.query(`select count(*)::int n from public.${table}`)).rows[0].n)])));
}

async function focusedSnapshot(pool: Pool): Promise<string> {
  const queries = [
    "select * from catalog_songs order by song_id",
    "select * from song_preferences order by profile_id,song_id",
    "select * from organist_repertoire order by organist_person_id,song_id",
    "select * from melody_equivalence_classes order by id",
    "select * from song_melody_equivalence order by song_id",
    "select * from antiphon_mappings order by id",
    "select * from liturgical_season_mappings order by id",
    "select * from reference_song_preferences order by profile_id,reference_song_id",
    "select * from reference_organist_repertoire order by organist_person_id,reference_song_id",
    "select * from reference_melody_classes order by id",
    "select * from reference_song_melody_memberships order by reference_song_id",
    "select * from reference_antiphon_recommendations order by antiphon_id",
    "select * from service_contexts order by id",
  ];
  return JSON.stringify(await Promise.all(queries.map(async (sql) => (await pool.query(sql)).rows)));
}

async function waitForDatabaseConnectionsToClose(control: Pool, databaseName: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await control.query("select count(*)::int count from pg_stat_activity where datname=$1 and pid <> pg_backend_pid()", [databaseName]);
    if (Number(result.rows[0].count) === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Acceptance pool connections to ${databaseName} did not close within 2 seconds.`);
}

async function seedFocusedAuthority(pool: Pool) {
  await pool.query(
    "insert into catalog_persons(id,display_name,active,priest,organist,melody_protection_months) values('demo-organist','Phase 31.12 Demo Organist',true,false,true,2) on conflict(id) do update set active=true,organist=true,melody_protection_months=2,updated_at=now()",
  );
  await pool.query("update reference_catalog_songs set title='Phase 31.12 Authoritative Candidate' where id='czech:1'");
  const profiles = (await pool.query("select id,category from preference_profiles order by category,id")).rows;
  assert.ok(profiles.length > 0, "deterministic profiles were not seeded");
  const profileId = String(profiles.find((row) => row.category === "priest")?.id ?? profiles[0].id);
  await pool.query("delete from reference_song_preferences where reference_song_id in ('czech:1','polish:1')");
  await pool.query("insert into reference_song_preferences(profile_id,reference_song_id,score) values($1,'czech:1',3),($1,'polish:1',1)", [profileId]);
  await pool.query("delete from reference_organist_repertoire where organist_person_id='demo-organist' and reference_song_id in ('czech:1','polish:1','czech:5210')");
  await pool.query("insert into reference_organist_repertoire(organist_person_id,reference_song_id) values('demo-organist','czech:1'),('demo-organist','czech:5210')");
  const czechClass = String((await pool.query("select class_id from reference_song_melody_memberships where reference_song_id='czech:1'")).rows[0].class_id);
  const polishClass = String((await pool.query("select class_id from reference_song_melody_memberships where reference_song_id='polish:1'")).rows[0].class_id);
  await pool.query("update reference_song_melody_memberships set class_id=$1,updated_at=now() where reference_song_id='polish:1'", [czechClass]);
  if (polishClass !== czechClass) await pool.query("delete from reference_melody_classes where id=$1 and not exists(select 1 from reference_song_melody_memberships where class_id=$1)", [polishClass]);
  await pool.query("insert into reference_antiphon_recommendations(antiphon_id,reference_song_id) values('czech:800','czech:1') on conflict(antiphon_id) do update set reference_song_id=excluded.reference_song_id,updated_at=now()");
  await pool.query("delete from reference_antiphons where id='czech:915'");
  await pool.query("insert into melody_non_repetition_config(id,months) values('global',2) on conflict(id) do update set months=2,updated_at=now()");
}

function baseQuery(changes: Partial<CandidateQueryInput> = {}): CandidateQueryInput {
  return {
    serviceDate: "2026-08-09",
    serviceLanguage: "czech",
    organistPersonId: "demo-organist",
    preferenceThreshold: 1,
    candidateUsages: [],
    ...changes,
  };
}

async function query(input: CandidateQueryInput): Promise<ExtendedCandidate[]> {
  const result = await invoke("queryCandidates", input);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.success, true);
  return result.body.value as ExtendedCandidate[];
}

async function verifyAuthoritativeCandidates(pool: Pool) {
  const noSignal = await query(baseQuery({ queryText: "Phase 31.12" }));
  assert.equal(noSignal.length, 1);
  assert.equal(noSignal[0].songId, "czech:1");
  assert.equal(noSignal[0].number, "1");
  assert.equal(noSignal[0].title, "Phase 31.12 Authoritative Candidate", "candidate did not read PostgreSQL-only Reference metadata");
  assert.equal(noSignal[0].aggregatePreferenceScore, 3);
  assert.equal(noSignal[0].repertoire, true);
  assert.equal(noSignal[0].signal, "none");
  assert.equal(noSignal[0].seasonMatch, false);
  assert.deepEqual(noSignal[0].equivalentNumbers, [{ songId: "polish:1", number: "1", repertoire: false }]);
  const sourceUrl = (await pool.query("select source_url from reference_catalog_songs where id='czech:1'")).rows[0].source_url as string | null;
  assert.equal(noSignal[0].sheetMusicUrl, sourceUrl ?? undefined);
  assert.equal(noSignal[0].melodyMembers[0].sheetMusicUrl, sourceUrl ?? undefined);
  assert.deepEqual(noSignal[0].melodyMembers.map((member) => member.songId), ["czech:1", "polish:1"]);

  const highlighted = await query(baseQuery({ referenceAntiphonId: "czech:800", queryText: "1" }));
  assert.equal(highlighted[0].songId, "czech:1");
  assert.equal(highlighted[0].antiphonMatch, true);
  assert.equal(highlighted[0].signal, "antiphon");

  const legacyOnly = await query(baseQuery({ antiphonKey: "synthetic-entry", liturgicalSeasonKey: "synthetic-advent", queryText: "1" }));
  assert.equal(legacyOnly[0].signal, "none");
  assert.equal(legacyOnly[0].seasonMatch, false);

  const noRecommendation = await query(baseQuery({ referenceAntiphonId: "czech:801", queryText: "1" }));
  assert.equal(noRecommendation[0].signal, "none");
  const unknownAntiphon = await query(baseQuery({ referenceAntiphonId: "czech:915", queryText: "1" }));
  assert.equal(unknownAntiphon[0].signal, "none");

  const polish = candidatesForView(await query(baseQuery({ serviceLanguage: "polish", queryText: "1" })), "songs");
  assert.deepEqual(polish.map((candidate) => candidate.songId), ["polish:1"]);
  assert.equal(polish[0].repertoire, false);
  const mixed = await query(baseQuery({ serviceLanguage: "mixed", referenceAntiphonId: "czech:800", queryText: "1" }));
  assert.deepEqual(mixed.map((candidate) => candidate.songId), ["czech:1", "polish:1"]);
  assert.deepEqual(mixed[0].equivalentNumbers, [{ songId: "polish:1", number: "1", repertoire: false }]);
  assert.deepEqual(mixed[1].equivalentNumbers, [{ songId: "czech:1", number: "1", repertoire: true }]);
  assert.equal(mixed[0].signal, "antiphon");
  assert.equal(mixed[1].signal, "none");

  const blocked = await query(baseQuery({ referenceAntiphonId: "czech:800", queryText: "1", candidateUsages: [{ songId: "polish:1", serviceDate: "2026-07-01", source: "completed" }] }));
  assert.equal(blocked.length, 0, "recommended class bypassed authoritative melody non-repetition");
  const currentExcluded = await query(baseQuery({ currentPlanId: "plan-a", referenceAntiphonId: "czech:800", queryText: "1", candidateUsages: [{ songId: "czech:1", serviceDate: "2026-08-01", source: "working", planId: "plan-a" }] }));
  assert.equal(currentExcluded[0].songId, "czech:1");

  const hardFiltered = candidatesForView(
    await query(baseQuery({ organistPersonId: "no-authoritative-repertoire", referenceAntiphonId: "czech:800", queryText: "1" })),
    "songs",
  );
  assert.equal(hardFiltered.length, 0, "recommendation bypassed authoritative repertoire hard filter");

  const tooHigh = await query(baseQuery({ queryText: "1", preferenceThreshold: 4 }));
  assert.equal(tooHigh.length, 0);
  const canonicalVariant = await query(baseQuery({ preferenceThreshold: 0, queryText: "5210" }));
  assert.ok(canonicalVariant.some((candidate) => candidate.songId === "czech:5210"));
  const displayVariant = await query(baseQuery({ preferenceThreshold: 0, queryText: "52/1" }));
  assert.ok(displayVariant.some((candidate) => candidate.songId === "czech:5210"));

  const hydrated = await invoke("hydrateCandidates", { songs: [{ songId: "czech:1", language: "czech", number: "OLD", title: "Historical" }], organistPersonId: "demo-organist", referenceAntiphonId: "czech:800" });
  assert.equal(hydrated.status, 200);
  assert.equal(hydrated.body.value[0].title, "Historical");
  assert.equal(hydrated.body.value[0].number, "OLD");
  assert.equal(hydrated.body.value[0].aggregatePreferenceScore, 3);
  assert.equal(hydrated.body.value[0].signal, "antiphon");
  assert.deepEqual(hydrated.body.value[0].melodyMembers.map((member: { songId: string }) => member.songId), ["czech:1", "polish:1"]);
  const historical = await invoke("hydrateCandidates", { songs: [{ songId: "historical:czech:999", language: "czech", number: "999", title: "Historical only" }] });
  assert.equal(historical.body.value[0].title, "Historical only");
  assert.equal(historical.body.value[0].songId, "historical:czech:999");
  assert.equal(historical.body.value[0].melodyClassId, undefined);
  assert.equal(historical.body.value[0].melodyMembers, undefined);
  assert.equal(historical.body.value[0].orderKey, "rehydrated:czech:999:historical:czech:999");
}

async function verifyReferenceCandidateLifecycle(pool: Pool) {
  assert.equal(Number((await pool.query("select count(*)::int n from catalog_songs where song_id='czech:1'")).rows[0].n), 0, "focused Reference song unexpectedly existed in the legacy catalog");
  const selected = (await query(baseQuery({ referenceAntiphonId: "czech:800", queryText: "1" })))[0];
  const savedReferenceCandidate = await invokePlanning("saveWorkingSet", {
    serviceContext: {
      serviceDate: "2026-08-09",
      serviceTime: "13:12",
      language: "czech",
      priest: { id: "demo-priest", displayName: "Demo Priest" },
      organist: { id: "demo-organist", displayName: "Demo Organist" },
      antiphonKey: "legacy-test",
    },
    set: {
      status: "working",
      language: "czech",
      rows: [{ song: { songId: selected.songId, language: selected.language, number: selected.number, title: selected.title } }],
    },
  });
  assert.equal(savedReferenceCandidate.status, 200);
  assert.equal(savedReferenceCandidate.body.success, true, JSON.stringify(savedReferenceCandidate.body));
  assert.deepEqual(savedReferenceCandidate.body.value.rows[0].song, { songId: "czech:1", language: "czech", number: "1", title: "Phase 31.12 Authoritative Candidate" });
  const loadedReferenceCandidate = await invokePlanning("loadPlanningSet", { setId: String(savedReferenceCandidate.body.value.id) });
  assert.equal(loadedReferenceCandidate.body.success, true);
  assert.deepEqual(loadedReferenceCandidate.body.value.rows[0].song, savedReferenceCandidate.body.value.rows[0].song, "Reference song snapshot did not persist through Working save/reload");
}

async function verifyStrictRoute() {
  const invalidValues: unknown[] = [
    { ...baseQuery(), referenceAntiphonId: null },
    { ...baseQuery(), referenceAntiphonId: "czech:0" },
    { ...baseQuery(), referenceAntiphonId: "polish:0" },
    { ...baseQuery(), referenceAntiphonId: "english:1" },
    { ...baseQuery(), referenceAntiphonId: "czech:-1" },
    { ...baseQuery(), extra: true },
    { ...baseQuery(), serviceLanguage: "english" },
    { ...baseQuery(), serviceDate: "2026-02-31" },
    { ...baseQuery(), candidateUsages: "bad" },
  ];
  for (const input of invalidValues) {
    const result = await invoke("queryCandidates", input);
    assert.equal(result.status, 400, `invalid query was not rejected: ${JSON.stringify(input)}`);
    assert.equal(result.body.error.code, "invalidInput");
  }
  const badHydration = await invoke("hydrateCandidates", { songs: [{ songId: "czech:1", language: "czech", number: "1", extra: true }] });
  assert.equal(badHydration.status, 400);
  assert.equal(badHydration.body.error.code, "invalidInput");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.12 verification.");
  await runNpm("test:phase-31-12", process.env.DATABASE_URL);
  const migrationFiles = (await readdir("drizzle")).filter((name) => /^\d{4}.*\.sql$/.test(name));
  assert.equal(migrationFiles.some((name) => name.includes("31_12")), false, "Phase 31.12 unexpectedly introduced a migration");

  const guardUrl = process.env.DATABASE_URL;
  const guard = parseGuardDatabaseUrl(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const guardPool = new Pool({ connectionString: guardUrl });
  const before = await databaseFingerprint(guardPool);
  await guardPool.end();
  const name = generateE1DatabaseName();
  const databaseUrl = deriveDatabaseUrl(guard, name);
  await control.query(createDatabaseSql(name));
  const previousRuntime = process.env.ORGANY_RUNTIME;
  try {
    await withCleanup(async () => {
      await runNpm("db:migrate", databaseUrl);
      await runNpm("db:migrate", databaseUrl);
      await runNpm("db:sync:reference-catalog", databaseUrl);
      await runNpm("db:sync:reference-antiphons", databaseUrl);
      await runNpm("db:seed:catalog", databaseUrl);
      const pool = new Pool({ connectionString: databaseUrl });
      const restore = useInteractionPoolForAcceptance(pool);
      try {
        process.env.DATABASE_URL = databaseUrl;
        process.env.ORGANY_RUNTIME = "db";
        useLocalActorSimulatorForAcceptance({ userId: "demo-admin-user", role: "admin" });
        await seedFocusedAuthority(pool);
        const beforeReads = await focusedSnapshot(pool);
        await verifyAuthoritativeCandidates(pool);
        await verifyStrictRoute();
        assert.equal(await focusedSnapshot(pool), beforeReads, "read-only candidate operations mutated authoritative or legacy state");
        await verifyReferenceCandidateLifecycle(pool);
      } finally {
        restore();
        await disposeAppDbPoolForAcceptance(databaseUrl);
        await pool.end();
        await waitForDatabaseConnectionsToClose(control, name);
      }
    }, async () => {
      const [terminate, drop] = dropDatabaseSql(name);
      await control.query(terminate, [name]);
      await control.query(drop);
    });
    assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    const afterPool = new Pool({ connectionString: guardUrl });
    try { assert.equal(await databaseFingerprint(afterPool), before, "guard database fingerprint changed"); }
    finally { await afterPool.end(); }
    console.log(PASS_LINE);
  } finally {
    process.env.DATABASE_URL = guardUrl;
    if (previousRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = previousRuntime;
    await control.end();
  }
}

void main().catch((error) => { console.error("Phase 31.12 authoritative Planning candidates: FAIL"); console.error(error); process.exitCode = 1; });
