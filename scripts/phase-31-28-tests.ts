import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { POST as interactionPost } from "../app/api/interaction/route";
import { POST as planningPost } from "../app/api/planning-lifecycle/route";
import { POST as catalogPost } from "../app/api/catalog/route";
import { ProtectedActorError, resolveProtectedActor } from "../src/application/protected-actor";
import { auth } from "../src/auth/server";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Phase 31.28 acceptance.`);
  return value;
}

const databaseUrl = requiredEnv("DATABASE_URL");
requiredEnv("BETTER_AUTH_SECRET");
const priestPassword = requiredEnv("ORGANY_BOOTSTRAP_PRIEST_PASSWORD");
const adminPassword = requiredEnv("ORGANY_BOOTSTRAP_ADMIN_PASSWORD");
requiredEnv("ORGANY_BOOTSTRAP_ORGANIST_PASSWORD");

async function signIn(username: string, password: string): Promise<Response> {
  return auth.api.signInUsername({ body: { username, password }, asResponse: true });
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  const cookie = values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  assert.ok(cookie, "successful username sign-in must return a session cookie");
  return cookie;
}

async function expectSignInFailure(username: string, password: string) {
  let failed = false;
  try {
    const response = await signIn(username, password);
    failed = response.status >= 400;
  } catch {
    failed = true;
  }
  assert.equal(failed, true, `sign-in for ${username} must fail with rejected credentials`);
}

async function expectEmailSignInDisabled(email: string, password: string) {
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
  assert.ok(response.status >= 400, "synthetic internal email must not be accepted as a login identifier");
  assert.equal(response.headers.get("set-cookie")?.includes("session_token") ?? false, false, "disabled email sign-in must not create a session cookie");
}

async function expectPublicSignupDisabled() {
  let failed = false;
  try {
    const response = await auth.api.signUpEmail({
      body: {
        email: "public-signup-must-not-work@organy.invalid",
        name: "Public signup must not work",
        password: "PublicSignupMustNotWork!2026",
        username: "public-signup-must-not-work",
      },
      asResponse: true,
    });
    failed = response.status >= 400;
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "normal Better Auth instance must reject public privileged signup");
}

async function expectProtectedError(action: () => Promise<unknown>, code: ProtectedActorError["code"]) {
  let caught: unknown;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught instanceof ProtectedActorError, `expected ProtectedActorError ${code}`);
  assert.equal(caught.code, code);
}

function apiRequest(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await seedDemoInteractionKnowledge(pool);
  } finally {
    await pool.end();
  }

  await expectPublicSignupDisabled();

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["run", "db:bootstrap:auth"], { env: process.env, stdio: "inherit" });
  // Bootstrap is idempotent and must not reset an existing password.
  execFileSync(npm, ["run", "db:bootstrap:auth"], { env: process.env, stdio: "inherit" });

  const db = new Pool({ connectionString: databaseUrl });
  try {
    const accountRows = await db.query(`
      select u.id auth_user_id, u.username, u.email, l.app_user_id
      from auth_users u join protected_account_actor_links l on l.auth_user_id = u.id
      order by u.username
    `);
    assert.equal(accountRows.rows.length, 3, "bootstrap creates exactly three protected acceptance accounts");
    assert.deepEqual(accountRows.rows.map((row) => row.username), ["admin", "organist", "priest"]);
    assert.deepEqual(accountRows.rows.map((row) => row.app_user_id).sort(), ["demo-admin-user", "demo-organist-user", "demo-priest-user"]);
    for (const row of accountRows.rows) {
      assert.match(String(row.email), /^protected-[0-9a-f-]+@organy\.invalid$/i, "auth email stays synthetic/internal");
      assert.equal(String(row.email).includes(String(row.username)), false, "synthetic email does not derive from the visible username");
    }
    const priestAccount = accountRows.rows.find((row) => row.username === "priest");
    assert.ok(priestAccount, "bootstrap must create the protected priest account");
    await expectEmailSignInDisabled(String(priestAccount.email), priestPassword);
    assert.equal(Number((await db.query("select count(*)::int n from auth_sessions")).rows[0].n), 0, "bootstrap and rejected email sign-in must not leave any staff account signed in");

    await expectProtectedError(() => resolveProtectedActor(new Headers(), db), "unauthenticated");
    const unauthMutation = await interactionPost(apiRequest("/api/interaction", {
      action: "setMelodyWindow",
      input: { months: 1 },
      actor: { role: "admin" },
    }));
    assert.equal(unauthMutation.status, 401, "real protected Interaction route rejects unauthenticated mutation");

    await expectSignInFailure("priest", `${priestPassword}-wrong`);

    const priestSignIn = await signIn("priest", priestPassword);
    assert.equal(priestSignIn.status, 200, "correct priest username/password signs in");
    const priestCookie = cookieHeader(priestSignIn);
    const priestHeaders = new Headers({ cookie: priestCookie });
    const priestActor = await resolveProtectedActor(priestHeaders, db, { role: "priest" });
    assert.equal(priestActor.userId, "demo-priest-user");
    assert.equal(priestActor.role, "priest");
    assert.equal(priestActor.personId, "demo-priest");

    await expectProtectedError(
      () => resolveProtectedActor(priestHeaders, db, { userId: "demo-admin-user", role: "admin" }),
      "invalidInput",
    );
    await expectProtectedError(() => resolveProtectedActor(priestHeaders, db, { role: "admin" }), "permissionDenied");

    const spoofResponse = await interactionPost(apiRequest("/api/interaction", {
      action: "setMelodyWindow",
      input: { months: 1 },
      actor: { userId: "demo-admin-user", role: "admin" },
    }, priestCookie));
    assert.equal(spoofResponse.status, 400, "real Interaction route rejects client-supplied user identity even with a valid session");
    const spoofBody = await spoofResponse.json() as { error?: { code?: string } };
    assert.equal(spoofBody.error?.code, "invalidInput");

    const roleEscalation = await interactionPost(apiRequest("/api/interaction", {
      action: "setMelodyWindow",
      input: { months: 1 },
      actor: { role: "admin" },
    }, priestCookie));
    assert.equal(roleEscalation.status, 403, "priest session cannot request unassigned admin role");

    await db.query("update app_users set active=false where id='demo-priest-user'");
    await expectProtectedError(() => resolveProtectedActor(priestHeaders, db, { role: "priest" }), "permissionDenied");
    await db.query("update app_users set active=true where id='demo-priest-user'");

    const changedPassword = `${priestPassword}-changed`;
    const changeResult = await auth.api.changePassword({
      headers: priestHeaders,
      body: { currentPassword: priestPassword, newPassword: changedPassword, revokeOtherSessions: true },
    });
    assert.ok(changeResult, "signed-in user can change own password");
    await expectSignInFailure("priest", priestPassword);
    const changedSignIn = await signIn("priest", changedPassword);
    assert.equal(changedSignIn.status, 200, "new password signs in after own password change");
    const changedCookie = cookieHeader(changedSignIn);
    const changedHeaders = new Headers({ cookie: changedCookie });
    assert.equal((await resolveProtectedActor(changedHeaders, db, { role: "priest" })).userId, "demo-priest-user");

    const adminSignIn = await signIn("admin", adminPassword);
    assert.equal(adminSignIn.status, 200);
    const adminCookie = cookieHeader(adminSignIn);
    const adminMutation = await interactionPost(apiRequest("/api/interaction", {
      action: "setMelodyWindow",
      input: { months: 2 },
      actor: { role: "admin" },
    }, adminCookie));
    assert.equal(adminMutation.status, 200, "admin session authorizes a real protected DB mutation");
    const adminBody = await adminMutation.json() as { success?: boolean };
    assert.equal(adminBody.success, true);

    const planningList = await planningPost(apiRequest("/api/planning-lifecycle", {
      action: "listPlanningSets",
      input: {},
      actor: { role: "admin" },
    }, adminCookie));
    assert.equal(planningList.status, 200, "authenticated session crosses the Planning Lifecycle route boundary");

    const catalogList = await catalogPost(apiRequest("/api/catalog", {
      action: "listPeople",
      input: {},
      actor: { role: "admin" },
    }, adminCookie));
    assert.equal(catalogList.status, 200, "authenticated session crosses the Catalog route boundary");

    const signOutResponse = await auth.api.signOut({ headers: changedHeaders, asResponse: true });
    assert.equal(signOutResponse.status, 200, "sign-out endpoint succeeds");
    await expectProtectedError(() => resolveProtectedActor(changedHeaders, db, { role: "priest" }), "unauthenticated");

    console.log("Phase 31.28 protected username/password authentication acceptance: PASS");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("Phase 31.28 protected username/password authentication acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
});
