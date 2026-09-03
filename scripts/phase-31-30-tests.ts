import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { GET as adminGet, POST as adminPost } from "../app/api/protected-accounts/route";
import { ProtectedActorError, resolveProtectedActor } from "../src/application/protected-actor";
import { PostgresCongregationPreferenceAdminService } from "../src/application/congregation-preference-admin";
import { PostgresCongregationPreferenceService } from "../src/application/congregation-preference-voter";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { auth } from "../src/auth/server";

function requiredEnv(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required for Phase 31.30 acceptance.`); return value; }
const databaseUrl = requiredEnv("DATABASE_URL");
const adminPassword = requiredEnv("ORGANY_BOOTSTRAP_ADMIN_PASSWORD");
const priestPassword = requiredEnv("ORGANY_BOOTSTRAP_PRIEST_PASSWORD");
const organistPassword = requiredEnv("ORGANY_BOOTSTRAP_ORGANIST_PASSWORD");
const staffPassword = "Phase31Staff!2026";
const selfAdminPassword = "Phase31SelfAdmin!2026";
const testActorIds = ["phase31-staff-user", "phase31-self-admin-user"];
const adminPreferenceSongIds = ["czech:987654", "polish:987654", "czech:987655"];
let nicknameActorId: string | undefined;

async function signIn(username: string, password: string): Promise<Response> { return auth.api.signInUsername({ body: { username, password }, asResponse: true }); }
function cookieHeader(response: Response): string {
  const h = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = h.getSetCookie?.() ?? (h.get("set-cookie") ? [h.get("set-cookie")!] : []);
  const cookie = values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  assert.ok(cookie); return cookie;
}
async function expectSignInFailure(username: string, password: string) {
  let failed = false;
  try { failed = (await signIn(username, password)).status >= 400; } catch { failed = true; }
  assert.equal(failed, true, `${username} sign-in should fail`);
}
function jsonRequest(method: "GET" | "POST", body?: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/protected-accounts", {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function expectProtectedError(action: () => Promise<unknown>, code: ProtectedActorError["code"]) {
  let caught: unknown; try { await action(); } catch (error) { caught = error; }
  assert.ok(caught instanceof ProtectedActorError); assert.equal(caught.code, code);
}

async function main() {
  const db = new Pool({ connectionString: databaseUrl });
  try {
    await seedDemoInteractionKnowledge(db);
    await db.query("insert into app_users (id, display_name, active) values ($1,$2,true),($3,$4,true) on conflict (id) do update set display_name=excluded.display_name, active=true", [testActorIds[0], "Phase31 Future Staff", testActorIds[1], "Phase31 Self Admin"]);
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileSync(npm, ["run", "db:bootstrap:auth"], { env: process.env, stdio: "inherit" });

    const adminResponse = await signIn("admin", adminPassword); assert.equal(adminResponse.status, 200); const adminCookie = cookieHeader(adminResponse);
    const priestResponse = await signIn("priest", priestPassword); assert.equal(priestResponse.status, 200); const priestCookie = cookieHeader(priestResponse);
    const organistResponse = await signIn("organist", organistPassword); assert.equal(organistResponse.status, 200); const organistCookie = cookieHeader(organistResponse);

    assert.equal((await adminGet(jsonRequest("GET"))).status, 401, "unauthenticated account administration is rejected");
    assert.equal((await adminGet(jsonRequest("GET", undefined, priestCookie))).status, 403, "priest cannot list protected Accounts");
    assert.equal((await adminGet(jsonRequest("GET", undefined, organistCookie))).status, 403, "organist cannot list protected Accounts");
    const adminRolesBeforeUnauthorized = (await db.query("select role from app_user_roles where user_id='demo-admin-user' order by role")).rows.map((row) => row.role);
    assert.equal((await adminPost(jsonRequest("POST", { action: "updateRoles", appUserId: "demo-admin-user", roles: ["priest"], actor: { role: "admin" } }, priestCookie))).status, 403, "priest cannot forge admin authority for a mutation");
    assert.equal((await adminPost(jsonRequest("POST", { action: "setActive", appUserId: "demo-admin-user", active: false, actor: { role: "admin" } }, organistCookie))).status, 403, "organist cannot forge admin authority for a mutation");
    assert.deepEqual((await db.query("select role from app_user_roles where user_id='demo-admin-user' order by role")).rows.map((row) => row.role), adminRolesBeforeUnauthorized, "unauthorized mutations leave admin roles unchanged");
    assert.equal((await db.query("select active from app_users where id='demo-admin-user'")).rows[0].active, true, "unauthorized mutation cannot deactivate admin");

    const voterService = new PostgresCongregationPreferenceService(db);
    const voter = await voterService.enterNickname("Phase31 Account Admin Forbidden");
    nicknameActorId = voter.context.userId;
    const nicknameCookie = `organy_congregation_voter=${encodeURIComponent(voter.token)}`;
    assert.equal((await adminGet(jsonRequest("GET", undefined, nicknameCookie))).status, 401, "nickname voter cookie is not protected admin authority");
    assert.equal((await adminPost(jsonRequest("POST", { action: "updateRoles", appUserId: "demo-admin-user", roles: ["priest"], actor: { role: "admin" } }, nicknameCookie))).status, 401, "nickname voter cannot mutate protected Accounts");

    await db.query(
      `insert into reference_catalog_songs (id, language, canonical_number, source_id, title, source_url)
       values
         ($1, 'czech', 987654, 'phase-31-30-admin-pref-cz', 'Admin preference Czech', null),
         ($2, 'polish', 987654, 'phase-31-30-admin-pref-pl', 'Admin preference Polish', null),
         ($3, 'czech', 987655, 'phase-31-30-voter-zero', 'Voter zero hidden', null)
       on conflict (id) do nothing`,
      adminPreferenceSongIds,
    );
    await voterService.saveOwnReferencePreference(voter.token, adminPreferenceSongIds[0], 1);
    await voterService.saveOwnReferencePreference(voter.token, adminPreferenceSongIds[1], 1);
    await voterService.saveOwnReferencePreference(voter.token, adminPreferenceSongIds[2], 0);

    const preferenceAdmin = new PostgresCongregationPreferenceAdminService(db);
    const adminHeaders = new Headers({ cookie: adminCookie });
    const czechBeforeAdminZero = (await preferenceAdmin.list(adminHeaders, "czech")).find((row) => row.profileId === voter.context.profileId);
    assert.ok(czechBeforeAdminZero);
    assert.deepEqual(
      czechBeforeAdminZero.songs.map((song) => [song.referenceSongId, song.score, song.adminZero]),
      [[adminPreferenceSongIds[0], 1, false]],
      "ordinary voter-set zero remains invisible to Admin",
    );

    await preferenceAdmin.setPreferenceScore(adminHeaders, {
      profileId: voter.context.profileId,
      referenceSongId: adminPreferenceSongIds[0],
      score: 0,
    });
    const czechAfterAdminZero = (await preferenceAdmin.list(adminHeaders, "czech")).find((row) => row.profileId === voter.context.profileId);
    assert.ok(czechAfterAdminZero);
    assert.deepEqual(
      czechAfterAdminZero.songs.map((song) => [song.referenceSongId, song.score, song.adminZero]),
      [[adminPreferenceSongIds[0], 0, true]],
      "Admin-set zero remains visible and is distinguished from ordinary zero",
    );

    const mixedPreferences = (await preferenceAdmin.list(adminHeaders, "mixed")).find((row) => row.profileId === voter.context.profileId);
    assert.ok(mixedPreferences);
    assert.deepEqual(
      mixedPreferences.songs.map((song) => [song.referenceSongId, song.language, song.score, song.adminZero]),
      [
        [adminPreferenceSongIds[0], "czech", 0, true],
        [adminPreferenceSongIds[1], "polish", 1, false],
      ],
      "mixed Admin language lists visible Czech and Polish preferences together",
    );

    await preferenceAdmin.setPreferenceScore(adminHeaders, {
      profileId: voter.context.profileId,
      referenceSongId: adminPreferenceSongIds[0],
      score: 1,
    });
    const restored = (await preferenceAdmin.list(adminHeaders, "czech")).find((row) => row.profileId === voter.context.profileId);
    assert.ok(restored);
    assert.deepEqual(restored.songs.map((song) => [song.referenceSongId, song.score, song.adminZero]), [[adminPreferenceSongIds[0], 1, false]]);

    await preferenceAdmin.setPreferenceScore(adminHeaders, {
      profileId: voter.context.profileId,
      referenceSongId: adminPreferenceSongIds[0],
      score: 0,
    });
    await preferenceAdmin.removePreference(adminHeaders, {
      profileId: voter.context.profileId,
      referenceSongId: adminPreferenceSongIds[0],
    });
    const afterAdminZeroRemove = (await preferenceAdmin.list(adminHeaders, "czech")).find((row) => row.profileId === voter.context.profileId);
    assert.ok(afterAdminZeroRemove);
    assert.equal(afterAdminZeroRemove.songs.length, 0, "Admin-zero preference can still be explicitly removed");

    const initialListResponse = await adminGet(jsonRequest("GET", undefined, adminCookie)); assert.equal(initialListResponse.status, 200);
    const initialList = await initialListResponse.json() as { accounts: Record<string, unknown>[]; eligibleActors: { appUserId: string }[] };
    assert.equal(initialList.accounts.length, 3);
    assert.equal(initialList.accounts.some((row) => Object.prototype.hasOwnProperty.call(row, "email")), false, "synthetic auth email is never user-facing");
    assert.equal(initialList.eligibleActors.some((row) => row.appUserId === nicknameActorId), false, "nickname voters are not provisioning targets");

    assert.equal((await adminPost(jsonRequest("POST", { action: "provision", appUserId: testActorIds[0], username: "phase31staff", password: staffPassword, roles: [] }, adminCookie))).status, 400);
    assert.equal((await adminPost(jsonRequest("POST", { action: "provision", appUserId: testActorIds[0], username: "admin", password: staffPassword, roles: ["organist"] }, adminCookie))).status, 409);
    assert.equal((await adminPost(jsonRequest("POST", { action: "provision", appUserId: "demo-priest-user", username: "anotherpriest", password: staffPassword, roles: ["priest"] }, adminCookie))).status, 409);
    assert.equal((await adminPost(jsonRequest("POST", { action: "provision", appUserId: testActorIds[0], username: "phase31staff", password: "", roles: ["organist"] }, adminCookie))).status, 400);
    assert.equal((await adminPost(jsonRequest("POST", { action: "provision", appUserId: nicknameActorId, username: "forbiddennickname", password: staffPassword, roles: ["admin"] }, adminCookie))).status, 403);

    const provision = await adminPost(jsonRequest("POST", { action: "provision", appUserId: testActorIds[0], username: "phase31staff", password: staffPassword, roles: ["organist"] }, adminCookie));
    assert.equal(provision.status, 200);
    const staffAuth = await db.query("select au.id, au.email from auth_users au join protected_account_actor_links l on l.auth_user_id=au.id where l.app_user_id=$1", [testActorIds[0]]);
    assert.equal(staffAuth.rows.length, 1); assert.match(String(staffAuth.rows[0].email), /^protected-[0-9a-f-]+@organy\.invalid$/i);
    assert.equal(Number((await db.query("select count(*)::int n from auth_sessions where user_id=$1", [staffAuth.rows[0].id])).rows[0].n), 0, "provisioning leaves no signup session");

    const staffSignIn = await signIn("phase31staff", staffPassword); assert.equal(staffSignIn.status, 200); const staffCookie = cookieHeader(staffSignIn); const staffHeaders = new Headers({ cookie: staffCookie });
    assert.equal((await resolveProtectedActor(staffHeaders, db, { role: "organist" })).userId, testActorIds[0]);

    const roleUpdate = await adminPost(jsonRequest("POST", { action: "updateRoles", appUserId: testActorIds[0], roles: ["priest"] }, adminCookie)); assert.equal(roleUpdate.status, 200);
    await expectProtectedError(() => resolveProtectedActor(staffHeaders, db, { role: "organist" }), "permissionDenied");
    assert.equal((await resolveProtectedActor(staffHeaders, db, { role: "priest" })).userId, testActorIds[0]);
    assert.equal((await adminPost(jsonRequest("POST", { action: "updateRoles", appUserId: testActorIds[0], roles: [] }, adminCookie))).status, 400, "active protected account cannot have zero protected roles");

    const deactivate = await adminPost(jsonRequest("POST", { action: "setActive", appUserId: testActorIds[0], active: false }, adminCookie)); assert.equal(deactivate.status, 200);
    assert.equal(Number((await db.query("select count(*)::int n from auth_sessions where user_id=$1", [staffAuth.rows[0].id])).rows[0].n), 0, "deactivation revokes sessions");
    await expectProtectedError(() => resolveProtectedActor(staffHeaders, db, { role: "priest" }), "unauthenticated");
    await expectSignInFailure("phase31staff", staffPassword);
    const reactivate = await adminPost(jsonRequest("POST", { action: "setActive", appUserId: testActorIds[0], active: true }, adminCookie)); assert.equal(reactivate.status, 200);
    assert.equal((await signIn("phase31staff", staffPassword)).status, 200, "reactivation restores the same credential");

    assert.equal((await adminPost(jsonRequest("POST", { action: "updateRoles", appUserId: "demo-admin-user", roles: ["priest"] }, adminCookie))).status, 409, "last active admin cannot lose admin role");
    assert.equal((await adminPost(jsonRequest("POST", { action: "setActive", appUserId: "demo-admin-user", active: false }, adminCookie))).status, 409, "last active admin cannot be deactivated");

    const selfProvision = await adminPost(jsonRequest("POST", { action: "provision", appUserId: testActorIds[1], username: "phase31selfadmin", password: selfAdminPassword, roles: ["admin"] }, adminCookie)); assert.equal(selfProvision.status, 200);
    const selfSignIn = await signIn("phase31selfadmin", selfAdminPassword); assert.equal(selfSignIn.status, 200); const selfCookie = cookieHeader(selfSignIn);
    const selfRemoval = await adminPost(jsonRequest("POST", { action: "updateRoles", appUserId: testActorIds[1], roles: ["organist"] }, selfCookie)); assert.equal(selfRemoval.status, 200);
    const selfPayload = await selfRemoval.json() as { currentAdminLostAccess?: boolean }; assert.equal(selfPayload.currentAdminLostAccess, true);
    assert.equal((await adminGet(jsonRequest("GET", undefined, selfCookie))).status, 403, "self role change is authoritative immediately");

    console.log("Phase 31.30 protected Account administration acceptance: PASS");
  } finally {
    await db.query("delete from auth_users where id in (select auth_user_id from protected_account_actor_links where app_user_id = any($1::text[]))", [testActorIds]).catch(() => undefined);
    await db.query("delete from app_users where id = any($1::text[])", [testActorIds]).catch(() => undefined);
    if (nicknameActorId) await db.query("delete from app_users where id=$1", [nicknameActorId]).catch(() => undefined);
    await db.query("delete from reference_catalog_songs where id = any($1::text[])", [adminPreferenceSongIds]).catch(() => undefined);
    await db.end();
  }
}

main().catch((error) => { console.error("Phase 31.30 protected Account administration acceptance: FAIL"); console.error(error); process.exitCode = 1; });
