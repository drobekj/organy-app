import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  process.env.ORGANY_RUNTIME = "db";
  process.env.BETTER_AUTH_SECRET ||= "phase-31-28-ci-secret-that-is-long-enough-for-testing-only";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";

  const [{ auth }, { provisionStaffAccount }, authenticated, interactionRoute, staffSessionRoute, staffProvisionRoute] = await Promise.all([
    import("../src/auth/server"),
    import("../src/auth/provisioning"),
    import("../src/application/authenticated-actor"),
    import("../app/api/interaction/route"),
    import("../app/api/staff-session/route"),
    import("../app/api/staff-admin/provision/route"),
  ]);

  const pool = new Pool({ connectionString: databaseUrl });
  const restoreInteractionPool = interactionRoute.useInteractionPoolForAcceptance(pool);

  function headers(cookie?: string) {
    const value = new Headers({ "content-type": "application/json", origin: "http://localhost:3000" });
    if (cookie) value.set("cookie", cookie);
    return value;
  }

  async function authRequest(path: string, body: Record<string, unknown>, cookie?: string) {
    return auth.handler(new Request("http://localhost:3000/api/auth" + path, {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify(body),
    }));
  }

  function sessionCookie(response: Response) {
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie, "successful sign-in must set a session cookie");
    const match = setCookie.match(/(?:^|,\s*)([^=;,\s]*session[^=;,\s]*)=([^;,\s]+)/i);
    if (match) return match[1] + "=" + match[2];
    const first = setCookie.split(";")[0];
    assert.ok(first.includes("="), "session cookie must be parseable");
    return first;
  }

  async function signIn(username: string, password: string) {
    const response = await authRequest("/sign-in/username", { username, password });
    assert.equal(response.status, 200, "username/password sign-in should succeed");
    return sessionCookie(response);
  }

  async function expectRejected(run: () => Promise<unknown>, pattern: RegExp) {
    await assert.rejects(run, pattern);
  }

  try {
    const tables = await pool.query("select table_name from information_schema.tables where table_schema='public' and table_name like 'auth_%' order by table_name");
    const tableNames = tables.rows.map((row) => String(row.table_name));
    for (const expected of ["auth_account", "auth_session", "auth_user", "auth_user_actor_links", "auth_verification"]) assert.ok(tableNames.includes(expected), "migration must create " + expected);

    await pool.query("delete from auth_user");
    await pool.query("delete from app_user_roles where user_id like 'phase-31-28-%'");
    await pool.query("delete from app_users where id like 'phase-31-28-%'");

    await pool.query("insert into app_users (id, display_name, active) values ('phase-31-28-admin','Phase Admin',true),('phase-31-28-priest','Phase Priest',true),('phase-31-28-member','Phase Member',true),('phase-31-28-organist','Phase Organist',true)");
    await pool.query("insert into app_user_roles (user_id, role) values ('phase-31-28-admin','admin'),('phase-31-28-priest','priest'),('phase-31-28-member','congregation_member'),('phase-31-28-organist','organist')");

    await provisionStaffAccount(pool, { actorUserId: "phase-31-28-admin", username: "phaseadmin", password: "Initial-Admin-28!" });
    await provisionStaffAccount(pool, { actorUserId: "phase-31-28-priest", username: "phasepriest", password: "Initial-Priest-28!" });

    const internalUsers = await pool.query("select id, email, username from auth_user order by username");
    assert.equal(internalUsers.rows.length, 2);
    assert.ok(internalUsers.rows.every((row) => String(row.email).startsWith("auth-") && String(row.email).endsWith("@organy.invalid")), "Better Auth email must be synthetic internal data");
    assert.deepEqual(internalUsers.rows.map((row) => row.username), ["phaseadmin", "phasepriest"]);
    const storedPasswords = await pool.query("select password from auth_account order by account_id");
    assert.ok(storedPasswords.rows.every((row) => typeof row.password === "string" && !String(row.password).includes("Initial-")), "stored credentials must not contain plaintext initial passwords");

    await expectRejected(() => provisionStaffAccount(pool, { actorUserId: "phase-31-28-member", username: "phasemember", password: "Member-Pass-28!" }), /admin, priest, or organist role/i);

    const adminCookie = await signIn("phaseadmin", "Initial-Admin-28!");
    const priestCookie = await signIn("phasepriest", "Initial-Priest-28!");
    const sessions = await pool.query("select count(*)::int as count from auth_session");
    assert.ok(Number(sessions.rows[0].count) >= 2, "sessions must persist in PostgreSQL");

    const adminUser = await authenticated.getAuthenticatedStaffUser(headers(adminCookie), pool);
    assert.equal(adminUser.id, "phase-31-28-admin");
    assert.deepEqual(adminUser.roles, ["admin"]);

    const sessionResponse = await staffSessionRoute.GET(new Request("http://localhost:3000/api/staff-session", { headers: headers(adminCookie) }));
    assert.equal(sessionResponse.status, 200);
    const sessionPayload = await sessionResponse.json() as { value?: Record<string, unknown> };
    assert.equal(sessionPayload.value?.id, "phase-31-28-admin");
    assert.equal("email" in (sessionPayload.value ?? {}), false, "staff session API must not expose synthetic email");

    const forged = await interactionRoute.POST(new Request("http://localhost:3000/api/interaction", {
      method: "POST",
      headers: headers(adminCookie),
      body: JSON.stringify({ action: "resolveActor", actor: { userId: "phase-31-28-priest", role: "admin" }, input: {} }),
    }));
    assert.equal(forged.status, 200);
    const forgedPayload = await forged.json() as { value?: { userId?: string; role?: string } };
    assert.equal(forgedPayload.value?.userId, "phase-31-28-admin", "client userId must not select the authorized actor");
    assert.equal(forgedPayload.value?.role, "admin");

    const noSession = await interactionRoute.POST(new Request("http://localhost:3000/api/interaction", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ action: "resolveActor", actor: { userId: "phase-31-28-admin", role: "admin" }, input: {} }),
    }));
    assert.equal(noSession.status, 403, "forged actor envelope without a session must not authorize");

    const enumeration = await interactionRoute.POST(new Request("http://localhost:3000/api/interaction", {
      method: "POST",
      headers: headers(adminCookie),
      body: JSON.stringify({ action: "listLocalActors", input: {} }),
    }));
    assert.equal(enumeration.status, 403, "DB runtime must not expose demo actor enumeration");

    await expectRejected(() => authenticated.resolveAuthenticatedActor(headers(priestCookie), pool, "admin"), /not assigned/i);
    await pool.query("insert into app_user_roles (user_id, role) values ('phase-31-28-priest','admin')");
    const promoted = await authenticated.resolveAuthenticatedActor(headers(priestCookie), pool, "admin");
    assert.equal(promoted.userId, "phase-31-28-priest", "new role must take effect without re-login");
    await pool.query("delete from app_user_roles where user_id='phase-31-28-priest' and role='admin'");
    await expectRejected(() => authenticated.resolveAuthenticatedActor(headers(priestCookie), pool, "admin"), /not assigned/i);

    await pool.query("update app_users set active=false where id='phase-31-28-priest'");
    await expectRejected(() => authenticated.getAuthenticatedStaffUser(headers(priestCookie), pool), /inactive/i);
    await pool.query("update app_users set active=true where id='phase-31-28-priest'");

    const targetBefore = await pool.query("select count(*)::int as count from auth_user_actor_links where actor_user_id='phase-31-28-organist'");
    assert.equal(Number(targetBefore.rows[0].count), 0);
    const provisionResponse = await staffProvisionRoute.POST(new Request("http://localhost:3000/api/staff-admin/provision", {
      method: "POST",
      headers: headers(adminCookie),
      body: JSON.stringify({ actorUserId: "phase-31-28-organist", username: "phaseorganist", password: "Initial-Organist-28!" }),
    }));
    assert.equal(provisionResponse.status, 200, "authenticated domain admin must provision protected staff account");
    await signIn("phaseorganist", "Initial-Organist-28!");

    const beforeSignup = await pool.query("select count(*)::int as count from auth_user");
    const publicSignup = await authRequest("/sign-up/email", { email: "public@example.com", name: "Public", password: "Public-Pass-28!", username: "public" });
    assert.notEqual(publicSignup.status, 200, "public protected signup endpoint must be disabled");
    const afterSignup = await pool.query("select count(*)::int as count from auth_user");
    assert.equal(Number(afterSignup.rows[0].count), Number(beforeSignup.rows[0].count), "disabled signup must not create an auth user");

    const changePassword = await authRequest("/change-password", { currentPassword: "Initial-Admin-28!", newPassword: "Changed-Admin-28!", revokeOtherSessions: true }, adminCookie);
    assert.equal(changePassword.status, 200, "authenticated owner must change own password");
    const oldLogin = await authRequest("/sign-in/username", { username: "phaseadmin", password: "Initial-Admin-28!" });
    assert.notEqual(oldLogin.status, 200, "old password must stop working");
    await signIn("phaseadmin", "Changed-Admin-28!");

    process.env.ORGANY_INITIAL_PASSWORD = "Bootstrap-Admin-28!";
    execFileSync("npx", ["tsx", "scripts/auth-bootstrap-staff.ts", "--actor-id", "phase-31-28-bootstrap", "--display-name", "Bootstrap Admin", "--role", "admin", "--username", "phasebootstrap"], {
      stdio: "pipe",
      env: { ...process.env, ORGANY_RUNTIME: "db" },
    });
    await signIn("phasebootstrap", "Bootstrap-Admin-28!");
    delete process.env.ORGANY_INITIAL_PASSWORD;

    const ui = await readFile("app/planning-lifecycle-client.tsx", "utf8");
    assert.match(ui, /runtimeMode === "memory"[\s\S]*Change user/);
    assert.match(ui, /Authenticated staff/);
    const gate = await readFile("app/staff-auth-gate.tsx", "utf8");
    assert.match(gate, /Staff sign in/);
    assert.match(gate, /Change password/);
    assert.match(gate, /Sign out/);

    console.log("Phase 31.28 protected staff authentication acceptance: PASS");
  } finally {
    restoreInteractionPool();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
