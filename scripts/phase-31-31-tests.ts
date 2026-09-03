import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { GET as adminGet, POST as adminPost } from "../app/api/protected-accounts/route";
import { ProtectedActorError, resolveProtectedActor } from "../src/application/protected-actor";
import { PostgresCongregationPreferenceService } from "../src/application/congregation-preference-voter";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { auth } from "../src/auth/server";

function requiredEnv(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required for Phase 31.31 acceptance.`); return value; }
const databaseUrl = requiredEnv("DATABASE_URL");
const adminPassword = requiredEnv("ORGANY_BOOTSTRAP_ADMIN_PASSWORD");
const priestPassword = requiredEnv("ORGANY_BOOTSTRAP_PRIEST_PASSWORD");
const organistPassword = requiredEnv("ORGANY_BOOTSTRAP_ORGANIST_PASSWORD");
const oldPassword = "Phase31ResetOld!2026";
const replacementPassword = "Phase31ResetNew!2026";
const inactiveReplacementPassword = "Phase31ResetInactive!2026";
const recoveredAdminPassword = "Phase31RecoveredAdmin!2026";
const resetActorId = "phase31-reset-user";
const unlinkedActorId = "phase31-reset-unlinked-user";
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
function containsPasswordKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPasswordKey);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => key.toLowerCase().includes("password") || containsPasswordKey(child));
}

async function main() {
  const db = new Pool({ connectionString: databaseUrl });
  try {
    await seedDemoInteractionKnowledge(db);
    await db.query(
      "insert into app_users (id, display_name, active) values ($1,$2,true),($3,$4,true) on conflict (id) do update set display_name=excluded.display_name, active=true",
      [resetActorId, "Phase31 Reset Staff", unlinkedActorId, "Phase31 Reset Unlinked"],
    );
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileSync(npm, ["run", "db:bootstrap:auth"], { env: process.env, stdio: "inherit" });

    const adminResponse = await signIn("admin", adminPassword); assert.equal(adminResponse.status, 200); const adminCookie = cookieHeader(adminResponse);
    const priestResponse = await signIn("priest", priestPassword); assert.equal(priestResponse.status, 200); const priestCookie = cookieHeader(priestResponse);
    const organistResponse = await signIn("organist", organistPassword); assert.equal(organistResponse.status, 200); const organistCookie = cookieHeader(organistResponse);

    const provision = await adminPost(jsonRequest("POST", { action: "provision", appUserId: resetActorId, username: "phase31reset", password: oldPassword, roles: ["organist"] }, adminCookie));
    assert.equal(provision.status, 200);
    const targetAuth = await db.query("select au.id from auth_users au join protected_account_actor_links l on l.auth_user_id=au.id where l.app_user_id=$1", [resetActorId]);
    const targetAuthUserId = String(targetAuth.rows[0].id);

    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: resetActorId, password: replacementPassword }))).status, 401, "unauthenticated reset is rejected");
    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: resetActorId, password: replacementPassword }, priestCookie))).status, 403, "priest cannot reset protected passwords");
    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: resetActorId, password: replacementPassword }, organistCookie))).status, 403, "organist cannot reset protected passwords");
    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: "demo-admin-user", password: replacementPassword }, adminCookie))).status, 403, "normal admin boundary rejects self reset");
    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: resetActorId, password: "short" }, adminCookie))).status, 400, "malformed replacement password is rejected");
    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: unlinkedActorId, password: replacementPassword }, adminCookie))).status, 404, "unlinked Actor is rejected");

    await db.query(`insert into app_users (id, display_name, active) values ('congregation-voter:phase31-password-reset','Phase31 Password Reset Forbidden',true);
      insert into app_user_roles (user_id, role) values ('congregation-voter:phase31-password-reset','congregation_member');
      insert into preference_profiles (id,user_id,category) values ('congregation-pref:phase31-password-reset','congregation-voter:phase31-password-reset','congregation_member');
      insert into congregation_voter_accounts (id,user_id,nickname,nickname_normalized,email,email_normalized,status,is_new_registration,confirmed_at)
      values ('congregation-account:phase31-password-reset','congregation-voter:phase31-password-reset','Phase31 Password Reset Forbidden','phase31 password reset forbidden','phase31-password-reset@example.invalid','phase31-password-reset@example.invalid','active',true,now());`);
    const voterSignIn = await new PostgresCongregationPreferenceService(db).signIn("Phase31 Password Reset Forbidden");
    assert.equal(voterSignIn.kind, "signedIn");
    if (voterSignIn.kind !== "signedIn") throw new Error("Acceptance voter sign-in failed.");
    const voter = voterSignIn.session;
    nicknameActorId = voter.context.userId;
    const nicknameCookie = `organy_congregation_voter=${encodeURIComponent(voter.token)}`;
    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: resetActorId, password: replacementPassword }, nicknameCookie))).status, 401, "nickname voter is not reset authority");
    assert.equal((await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: nicknameActorId, password: replacementPassword }, adminCookie))).status, 404, "nickname voter cannot be a password-reset target");

    const targetSignIn = await signIn("phase31reset", oldPassword); assert.equal(targetSignIn.status, 200); const targetCookie = cookieHeader(targetSignIn);
    const targetHeaders = new Headers({ cookie: targetCookie });
    assert.equal((await resolveProtectedActor(targetHeaders, db, { role: "organist" })).userId, resetActorId);
    assert.ok(Number((await db.query("select count(*)::int n from auth_sessions where user_id=$1", [targetAuthUserId])).rows[0].n) >= 1);

    const rolesBefore = (await db.query("select role from app_user_roles where user_id=$1 order by role", [resetActorId])).rows.map((row) => row.role);
    const reset = await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: resetActorId, password: replacementPassword }, adminCookie));
    assert.equal(reset.status, 200);
    const resetPayload = await reset.json();
    assert.equal(containsPasswordKey(resetPayload), false, "reset response contains no password field");
    assert.equal(JSON.stringify(resetPayload).includes(replacementPassword), false, "reset response never echoes the replacement password");
    assert.equal(Number((await db.query("select count(*)::int n from auth_sessions where user_id=$1", [targetAuthUserId])).rows[0].n), 0, "reset revokes all target sessions");
    await expectProtectedError(() => resolveProtectedActor(targetHeaders, db, { role: "organist" }), "unauthenticated");
    await expectSignInFailure("phase31reset", oldPassword);
    const newSignIn = await signIn("phase31reset", replacementPassword); assert.equal(newSignIn.status, 200);
    const newHeaders = new Headers({ cookie: cookieHeader(newSignIn) });
    assert.equal((await resolveProtectedActor(newHeaders, db, { role: "organist" })).userId, resetActorId);
    assert.deepEqual((await db.query("select role from app_user_roles where user_id=$1 order by role", [resetActorId])).rows.map((row) => row.role), rolesBefore, "reset preserves authoritative roles");

    const listResponse = await adminGet(jsonRequest("GET", undefined, adminCookie)); assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(containsPasswordKey(listPayload), false, "account-list API contains no password data");
    assert.equal(JSON.stringify(listPayload).includes(replacementPassword), false);

    assert.equal((await adminPost(jsonRequest("POST", { action: "setActive", appUserId: resetActorId, active: false }, adminCookie))).status, 200);
    const inactiveReset = await adminPost(jsonRequest("POST", { action: "resetPassword", appUserId: resetActorId, password: inactiveReplacementPassword }, adminCookie));
    assert.equal(inactiveReset.status, 200, "inactive protected Account may receive a replacement credential");
    assert.equal((await db.query("select active from app_users where id=$1", [resetActorId])).rows[0].active, false, "password reset does not reactivate Actor");
    await expectSignInFailure("phase31reset", replacementPassword);
    await expectSignInFailure("phase31reset", inactiveReplacementPassword);
    assert.equal((await adminPost(jsonRequest("POST", { action: "setActive", appUserId: resetActorId, active: true }, adminCookie))).status, 200);
    assert.equal((await signIn("phase31reset", inactiveReplacementPassword)).status, 200, "reactivation restores sign-in with replacement credential");

    const adminAuth = await db.query("select au.id from auth_users au join protected_account_actor_links l on l.auth_user_id=au.id where l.app_user_id='demo-admin-user'");
    const adminAuthUserId = String(adminAuth.rows[0].id);
    assert.ok(Number((await db.query("select count(*)::int n from auth_sessions where user_id=$1", [adminAuthUserId])).rows[0].n) >= 1);
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const recoveryOutput = execFileSync(npx, ["tsx", "scripts/db-recover-protected-admin-password.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, ORGANY_RECOVERY_ADMIN_USERNAME: "admin", ORGANY_RECOVERY_ADMIN_PASSWORD: recoveredAdminPassword },
      encoding: "utf8",
    });
    assert.equal(recoveryOutput.includes(recoveredAdminPassword), false, "operator recovery output never prints replacement password");
    assert.equal(Number((await db.query("select count(*)::int n from auth_sessions where user_id=$1", [adminAuthUserId])).rows[0].n), 0, "operator recovery revokes target admin sessions");
    assert.equal((await db.query("select active from app_users where id='demo-admin-user'")).rows[0].active, true, "operator recovery preserves active state");
    assert.deepEqual((await db.query("select role from app_user_roles where user_id='demo-admin-user' order by role")).rows.map((row) => row.role), ["admin"], "operator recovery preserves admin role");
    await expectSignInFailure("admin", adminPassword);
    assert.equal((await signIn("admin", recoveredAdminPassword)).status, 200, "operator recovery replacement credential works");

    console.log("Phase 31.31 protected credential reset/recovery acceptance: PASS");
  } finally {
    await db.query("delete from auth_users where id in (select auth_user_id from protected_account_actor_links where app_user_id = $1)", [resetActorId]).catch(() => undefined);
    await db.query("delete from app_users where id in ($1,$2)", [resetActorId, unlinkedActorId]).catch(() => undefined);
    if (nicknameActorId) await db.query("delete from app_users where id=$1", [nicknameActorId]).catch(() => undefined);
    await db.end();
  }
}

main().catch((error) => { console.error("Phase 31.31 protected credential reset/recovery acceptance: FAIL"); console.error(error); process.exitCode = 1; });
