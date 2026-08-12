import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  buildNonRepetitionPlanMelodyUsages,
  findNonRepetitionPlanConflicts,
  validateMelodyWindowMonths,
  type NonRepetitionPlanMelodyUsage,
} from "../src/application/non-repetition-period";
import { PostgresNonRepetitionPeriodService } from "../src/application/postgres-non-repetition-period";
import { ReferenceCandidateService } from "../src/application/reference-candidate-service";
import { POST, useInteractionPoolForAcceptance } from "../app/api/interaction/route";
import type { ActorIdentity } from "../src/application/interaction-contracts";
import { auth } from "../src/auth/server";
import { provisionStaffAccount } from "../src/auth/provisioning";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Phase 31.24 acceptance.");

const pool = new Pool({ connectionString: databaseUrl });
const marker = `p3124-${process.pid}-${Date.now()}`;
const adminUserId = `${marker}-admin`;
const priestUserId = `${marker}-priest`;
const organistPersonId = `${marker}-organist`;
const classId = `${marker}-melody`;
const czechSongId = "czech:990001";
const polishSongId = "polish:990001";
const unresolvedSongId = "czech:990003";
const admin: ActorIdentity = { userId: adminUserId, displayName: "Phase 31.24 Admin", role: "admin" };
const priest: ActorIdentity = { userId: priestUserId, displayName: "Phase 31.24 Priest", role: "priest" };
const apiCookies = new Map<string, string>();
let originalMonths = 2;
let workingA = "";
let workingC = "";
let finalB = "";
let finalD = "";

async function main() {
  pureContractChecks();
  await setup();
  try {
    await databaseContractChecks();
    await apiContractChecks();
    console.log("Phase 31.24 acceptance PASS");
  } finally {
    await cleanup();
    await pool.end();
  }
}

function pureContractChecks() {
  assert.equal(validateMelodyWindowMonths(0), true);
  assert.equal(validateMelodyWindowMonths(2), true);
  assert.equal(validateMelodyWindowMonths(-1), false);
  assert.equal(validateMelodyWindowMonths(1.5), false);
  assert.equal(validateMelodyWindowMonths(Number.NaN), false);
  assert.equal(validateMelodyWindowMonths(Number.POSITIVE_INFINITY), false);
  assert.equal(validateMelodyWindowMonths("2"), false);

  const usages: NonRepetitionPlanMelodyUsage[] = [
    { planId: "w1", status: "working", serviceDate: "2030-01-01", melodyClassId: "m1" },
    { planId: "w2", status: "working", serviceDate: "2030-02-01", melodyClassId: "m1" },
    { planId: "f1", status: "final", serviceDate: "2030-02-15", melodyClassId: "m1" },
    { planId: "f2", status: "final", serviceDate: "2030-03-01", melodyClassId: "m1" },
    { planId: "w1", status: "working", serviceDate: "2030-01-01", melodyClassId: "m1" },
  ];
  const conflicts = findNonRepetitionPlanConflicts(usages, 2);
  assert.ok(conflicts.some((item) => item.left.status === "working" && item.right.status === "working"), "Working↔Working must conflict");
  assert.ok(conflicts.some((item) => item.left.status !== item.right.status), "Working↔Final must conflict");
  assert.ok(conflicts.some((item) => item.left.status === "final" && item.right.status === "final"), "Final↔Final must conflict");
  assert.deepEqual(conflicts, [...conflicts].sort((left, right) => `${left.left.serviceDate}:${left.left.planId}:${left.right.serviceDate}:${left.right.planId}:${left.melodyClassId}`.localeCompare(`${right.left.serviceDate}:${right.left.planId}:${right.right.serviceDate}:${right.right.planId}:${right.melodyClassId}`)));

  const derived = buildNonRepetitionPlanMelodyUsages([
    {
      id: "plan",
      status: "working",
      serviceContext: { serviceDate: "2030-01-01" },
      rows: [{ song: { songId: "cz" } }, {}, { song: { songId: "unknown" } }, { song: { songId: "cz" } }],
    },
  ], new Map([["cz", "same-melody"]]));
  assert.deepEqual(derived, [{ planId: "plan", status: "working", serviceDate: "2030-01-01", melodyClassId: "same-melody" }], "Note-only/unresolved rows and same-plan duplicates are ignored");
}

async function setup() {
  const current = await pool.query("select months from melody_non_repetition_config where id = 'global'");
  originalMonths = Number(current.rows[0]?.months ?? 2);

  await pool.query("insert into catalog_persons (id, display_name, active, organist) values ($1, 'Phase 31.24 Organist', true, true)", [organistPersonId]);
  await pool.query("insert into app_users (id, display_name, active) values ($1, 'Phase 31.24 Admin', true), ($2, 'Phase 31.24 Priest', true)", [adminUserId, priestUserId]);
  await pool.query("insert into app_user_roles (user_id, role) values ($1, 'admin'), ($2, 'priest')", [adminUserId, priestUserId]);

  await pool.query(
    `insert into reference_catalog_songs (id, language, canonical_number, source_id, title)
     values
       ($1, 'czech', 990001, $2, 'Phase 31.24 Czech'),
       ($3, 'polish', 990001, $4, 'Phase 31.24 Polish'),
       ($5, 'czech', 990003, $6, 'Phase 31.24 unresolved')`,
    [czechSongId, `${marker}-cz`, polishSongId, `${marker}-pl`, unresolvedSongId, `${marker}-unresolved`],
  );
  await pool.query("insert into reference_melody_classes (id) values ($1)", [classId]);
  await pool.query(
    "insert into reference_song_melody_memberships (reference_song_id, class_id) values ($1, $3), ($2, $3)",
    [czechSongId, polishSongId, classId],
  );
  await pool.query(
    "insert into reference_organist_repertoire (organist_person_id, reference_song_id) values ($1, $2)",
    [organistPersonId, czechSongId],
  );

  workingA = await createPlan("working", "2098-01-01", czechSongId, 11);
  finalB = await createPlan("final", "2098-02-15", polishSongId, 12);
  workingC = await createPlan("working", "2098-06-01", czechSongId, 13);
  finalD = await createPlan("final", "2098-07-15", polishSongId, 14);

  const completedContextId = await createContext("2098-01-20", 21, "completed");
  const completed = await pool.query("insert into completed_services (service_context_id, service_set_id) values ($1, null) returning id", [completedContextId]);
  await pool.query(
    "insert into completed_service_rows (completed_service_id, position, song_id, song_language, song_number, song_title) values ($1, 1, $2, 'czech', '990001', 'Completed-only same melody')",
    [completed.rows[0].id, czechSongId],
  );
}

async function createContext(serviceDate: string, minute: number, suffix: string): Promise<number> {
  const result = await pool.query(
    `insert into service_contexts (name, service_date, service_time, service_language, priest_display_name, organist_display_name)
     values ($1, $2, $3, 'mixed', 'Phase 31.24 Priest', 'Phase 31.24 Organist') returning id`,
    [`${marker}-${suffix}`, serviceDate, `09:${String(minute).padStart(2, "0")}:00`],
  );
  return Number(result.rows[0].id);
}

async function createPlan(status: "working" | "final", serviceDate: string, songId: string, minute: number): Promise<string> {
  const contextId = await createContext(serviceDate, minute, `${status}-${minute}`);
  const set = await pool.query("insert into service_sets (service_context_id, status) values ($1, $2) returning id", [contextId, status]);
  const setId = String(set.rows[0].id);
  await pool.query(
    `insert into service_set_rows (service_set_id, position, song_id, song_language, song_number, song_title)
     values ($1, 1, $2, $3, '990001', 'Phase 31.24 song'), ($1, 2, null, null, null, null), ($1, 3, $4, 'czech', '990003', 'Unresolved historical snapshot')`,
    [setId, songId, songId.startsWith("polish:") ? "polish" : "czech", unresolvedSongId],
  );
  return setId;
}

async function databaseContractChecks() {
  const service = new PostgresNonRepetitionPeriodService(pool);
  const initial = await service.get(admin);
  assert.equal(initial.success, true);
  if (initial.success) assert.equal(initial.value.months, originalMonths);

  const denied = await service.set(priest, 0);
  assert.equal(denied.success, false);
  if (!denied.success) assert.equal(denied.error.code, "permissionDenied");

  for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
    const before = await readMonths();
    const result = await service.set(admin, invalid);
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, "invalidInput");
    assert.equal(await readMonths(), before, `Invalid ${String(invalid)} must not mutate configuration`);
  }

  const conflict = await service.set(admin, 2);
  assert.equal(conflict.success, false);
  if (!conflict.success) {
    assert.equal(conflict.error.code, "conflict");
    assert.ok(conflict.error.conflicts?.some((item) => item.left.planId === workingA && item.right.planId === finalB && item.melodyClassId === classId), "Cross-language same melody must identify Working↔Final blocker");
    assert.ok(conflict.error.conflicts?.some((item) => item.left.planId === workingC && item.right.planId === finalD && item.melodyClassId === classId), "Final/working blocker must be deterministic");
  }
  assert.equal(await readMonths(), originalMonths, "Conflict must leave previous configuration unchanged");

  const zero = await service.set(admin, 0);
  assert.deepEqual(zero, { success: true, value: { months: 0 } });
  assert.equal(await readMonths(), 0);
  const freshService = new PostgresNonRepetitionPeriodService(pool);
  assert.deepEqual(await freshService.get(admin), { success: true, value: { months: 0 } }, "Fresh repository/service read must observe persisted value");

  const candidatesWithZeroWindow = await new ReferenceCandidateService(pool).queryCandidates({
    serviceDate: "2098-02-01",
    serviceLanguage: "czech",
    organistPersonId,
    candidateUsages: [{ songId: czechSongId, serviceDate: "2098-01-01", source: "completed" }],
  });
  assert.ok(candidatesWithZeroWindow.some((candidate) => candidate.songId === czechSongId), "Subsequent candidate query must use successfully persisted zero-month window");

  await pool.query("delete from service_contexts where id = (select service_context_id from service_sets where id = $1)", [finalB]);
  finalB = "";
  await pool.query("delete from service_contexts where id = (select service_context_id from service_sets where id = $1)", [finalD]);
  finalD = "";
  const afterDelete = await service.set(admin, 2);
  assert.deepEqual(afterDelete, { success: true, value: { months: 2 } }, "Deleting blocking saved sets must allow retry");

  assert.equal(await readMonths(), 2);
  assert.ok(workingA && workingC, "Working fixture plans remain present");
}

async function apiContractChecks() {
  const restorePool = useInteractionPoolForAcceptance(pool);
  const previousRuntime = process.env.ORGANY_RUNTIME;
  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  const previousBaseUrl = process.env.BETTER_AUTH_URL;
  process.env.ORGANY_RUNTIME = "db";
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_SECRET ||= "phase-31-24-regression-secret-long-enough-for-testing";
  process.env.BETTER_AUTH_URL ||= "http://localhost";
  try {
    await provisionStaffAccount(pool, { actorUserId: adminUserId, username: `${marker}-admin`.replace(/[^a-zA-Z0-9_]/g, ""), password: "Phase-31-24-Admin!" });
    await provisionStaffAccount(pool, { actorUserId: priestUserId, username: `${marker}-priest`.replace(/[^a-zA-Z0-9_]/g, ""), password: "Phase-31-24-Priest!" });
    apiCookies.set(adminUserId, await signIn(`${marker}-admin`.replace(/[^a-zA-Z0-9_]/g, ""), "Phase-31-24-Admin!"));
    apiCookies.set(priestUserId, await signIn(`${marker}-priest`.replace(/[^a-zA-Z0-9_]/g, ""), "Phase-31-24-Priest!"));

    const read = await api("getMelodyWindow", {}, adminUserId, "admin");
    assert.equal(read.status, 200);
    assert.equal(read.body.success, true);
    assert.equal(read.body.value.months, 2);

    for (const input of [{ months: "2" }, { months: 1.2 }, { months: -1 }, { months: null }, { months: 2, extra: true }]) {
      const response = await api("setMelodyWindow", input, adminUserId, "admin");
      assert.equal(response.status, 400, `Malformed input ${JSON.stringify(input)} must be rejected at the API boundary`);
      assert.equal(await readMonths(), 2);
    }

    const nonAdmin = await api("setMelodyWindow", { months: 1 }, priestUserId, "priest");
    assert.equal(nonAdmin.status, 403);
    assert.equal(nonAdmin.body.error.code, "permissionDenied");
  } finally {
    restorePool();
    if (previousRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = previousRuntime;
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = previousSecret;
    if (previousBaseUrl === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = previousBaseUrl;
  }
}

async function signIn(username: string, password: string): Promise<string> {
  const response = await auth.handler(new Request("http://localhost/api/auth/sign-in/username", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ username, password }),
  }));
  assert.equal(response.status, 200, `Phase 31.24 regression staff sign-in failed for ${username}`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Phase 31.24 regression sign-in must set a session cookie");
  return setCookie.split(";")[0];
}

async function api(action: string, input: unknown, userId: string, role: string) {
  const cookie = apiCookies.get(userId);
  assert.ok(cookie, `Missing authenticated regression session for ${userId}`);
  const response = await POST(new Request("http://localhost/api/interaction", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ action, input, actor: { userId, role } }),
  }));
  return { status: response.status, body: await response.json() };
}

async function readMonths(): Promise<number> {
  const result = await pool.query("select months from melody_non_repetition_config where id = 'global'");
  return Number(result.rows[0]?.months ?? 2);
}

async function cleanup() {
  await pool.query("delete from service_contexts where name like $1", [`${marker}-%`]);
  await pool.query("delete from auth_user where id in (select auth_user_id from auth_user_actor_links where actor_user_id in ($1, $2))", [adminUserId, priestUserId]);
  await pool.query("delete from app_users where id in ($1, $2)", [adminUserId, priestUserId]);
  await pool.query("delete from catalog_persons where id = $1", [organistPersonId]);
  await pool.query("delete from reference_catalog_songs where id in ($1, $2, $3)", [czechSongId, polishSongId, unresolvedSongId]);
  await pool.query("delete from reference_melody_classes where id = $1", [classId]);
  await pool.query(
    "insert into melody_non_repetition_config (id, months) values ('global', $1) on conflict (id) do update set months = excluded.months, updated_at = now()",
    [originalMonths],
  );
}

main().catch(async (error) => {
  console.error(error);
  try { await cleanup(); } catch {}
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
