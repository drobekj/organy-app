import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { apiFailure } from "../src/application/api-error";
import { PostgresLocalActorResolver } from "../src/application/local-actor";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

type Handler = (request: Request) => Promise<Response>;
async function invoke(handler: Handler, action: string, input: unknown, actor?: unknown, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  const response = await handler(new Request("http://localhost/api", { method: "POST", headers, body: JSON.stringify({ action, input, ...(actor !== undefined ? { actor } : {}) }) }));
  return { status: response.status, body: await response.json() as Record<string, any> };
}
async function npmRun(name: string, url: string) {
  const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  await new Promise<void>((resolve, reject) => { const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); });
}
async function fingerprint(url: string) { const pool = new Pool({ connectionString: url }); try { const result = await pool.query("select datname from pg_database where datname=current_database()"); return JSON.stringify(result.rows); } finally { await pool.end(); } }

async function main() {
  assert.equal(apiFailure({ error: { code: "invalidInput", message: "bad" } }, "fallback").error.code, "invalidInput");
  assert.equal(apiFailure({ error: { code: "permissionDenied", message: "denied" } }, "fallback").error.code, "permissionDenied");
  assert.equal(apiFailure({ error: { code: "notFound", message: "missing" } }, "fallback").error.code, "notFound");
  assert.equal(apiFailure({ error: "original validation message" }, "fallback").error.message, "original validation message");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.4 verification.");
  const guardUrl = process.env.DATABASE_URL;
  const guard = parseGuardDatabaseUrl(guardUrl);
  const before = await fingerprint(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const name = generateE1DatabaseName();
  await control.query(createDatabaseSql(name));
  const isolatedUrl = deriveDatabaseUrl(guard, name);
  const priorRuntime = process.env.ORGANY_RUNTIME;
  const priorSecret = process.env.BETTER_AUTH_SECRET;
  const priorBaseUrl = process.env.BETTER_AUTH_URL;
  try {
    await withCleanup(async () => {
      await npmRun("db:migrate", isolatedUrl);
      const pool = new Pool({ connectionString: isolatedUrl });
      let restoreInteractionPool = () => undefined;
      try {
        await seedDemoInteractionKnowledge(pool);
        await pool.query("insert into app_user_roles (user_id, role) values ('demo-admin-user', 'priest') on conflict do nothing");
        await pool.query("insert into app_users (id, display_name, active) values ('inactive-user', 'Inactive', false), ('roleless-user', 'Roleless', true)");
        await pool.query("insert into catalog_persons (id, display_name, active, organist) values ('second-organist', 'Second Organist', true, true)");
        await pool.query("insert into app_users (id, display_name, person_id, active) values ('second-organist-user', 'Second Organist User', 'second-organist', true)");
        await pool.query("insert into app_user_roles (user_id, role) values ('second-organist-user', 'organist')");

        const storedActors = await new PostgresLocalActorResolver(pool).listActiveUsers();
        assert.deepEqual(storedActors.map((user) => user.id).sort(), ["demo-admin-user", "demo-member-user", "demo-organist-user", "demo-priest-user", "second-organist-user"]);
        assert.deepEqual(storedActors.find((user) => user.id === "demo-admin-user")?.roles, ["priest", "admin"]);
        assert.equal(storedActors.find((user) => user.id === "demo-organist-user")?.personId, "demo-organist");

        process.env.DATABASE_URL = isolatedUrl;
        process.env.ORGANY_RUNTIME = "db";
        process.env.BETTER_AUTH_SECRET = "phase-31-4-session-regression-secret-long-enough";
        process.env.BETTER_AUTH_URL = "http://localhost";

        const [{ POST: catalogPost }, interactionModule, { POST: planningPost }, { auth }, { provisionStaffAccount }] = await Promise.all([
          import("../app/api/catalog/route"),
          import("../app/api/interaction/route"),
          import("../app/api/planning-lifecycle/route"),
          import("../src/auth/server"),
          import("../src/auth/provisioning"),
        ]);
        const interactionPost = interactionModule.POST;
        restoreInteractionPool = interactionModule.useInteractionPoolForAcceptance(pool);

        await provisionStaffAccount(pool, { actorUserId: "demo-admin-user", username: "p314admin", password: "Phase-31-4-Admin!" });
        await provisionStaffAccount(pool, { actorUserId: "demo-priest-user", username: "p314priest", password: "Phase-31-4-Priest!" });
        await provisionStaffAccount(pool, { actorUserId: "demo-organist-user", username: "p314organist", password: "Phase-31-4-Organist!" });

        async function signIn(username: string, password: string) {
          const response = await auth.handler(new Request("http://localhost/api/auth/sign-in/username", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost" },
            body: JSON.stringify({ username, password }),
          }));
          assert.equal(response.status, 200, `Phase 31.4 staff sign-in failed for ${username}`);
          const setCookie = response.headers.get("set-cookie");
          assert.ok(setCookie);
          return setCookie.split(";")[0];
        }

        const adminCookie = await signIn("p314admin", "Phase-31-4-Admin!");
        const priestCookie = await signIn("p314priest", "Phase-31-4-Priest!");
        const organistCookie = await signIn("p314organist", "Phase-31-4-Organist!");

        const actors = await invoke(interactionPost, "listLocalActors", {}, undefined, adminCookie);
        assert.equal(actors.status, 403);
        assert.equal(actors.body.error.code, "permissionDenied");
        assert.equal((await invoke(catalogPost, "listSongs", {})).body.success, true);
        assert.equal((await invoke(interactionPost, "listKnowledge", {})).body.success, true);
        assert.equal((await invoke(planningPost, "listPlanningSets", {})).body.success, true);
        assert.equal((await invoke(catalogPost, "getSong", { songId: "missing-song" })).body.error.code, "notFound");
        const catalogValidation = await invoke(catalogPost, "getSong", {});
        assert.equal(catalogValidation.status, 400); assert.deepEqual(apiFailure(catalogValidation.body, "fallback").error, { code: "invalidInput", message: "Non-empty song ID is required." });
        const planningValidation = await invoke(planningPost, "loadPlanningSet", {});
        assert.equal(planningValidation.status, 400); assert.deepEqual(apiFailure(planningValidation.body, "fallback").error, { code: "invalidInput", message: "setId is required." });

        const explicitAdmin = await invoke(interactionPost, "resolveActor", {}, { userId: "demo-priest-user", role: "admin" }, adminCookie);
        assert.equal(explicitAdmin.body.value.userId, "demo-admin-user");
        assert.equal(explicitAdmin.body.value.role, "admin");
        const fallback = await invoke(interactionPost, "resolveActor", {}, { userId: "unknown-user" }, adminCookie);
        assert.equal(fallback.body.value.userId, "demo-admin-user");
        assert.equal(fallback.body.value.role, "admin");
        const bogusRole = await invoke(interactionPost, "setMelodyWindow", { months: 1 }, { userId: "demo-admin-user", role: "bogus" }, adminCookie);
        assert.equal(bogusRole.status, 400); assert.equal(bogusRole.body.error.code, "invalidInput");
        const noSession = await invoke(interactionPost, "setMelodyWindow", { months: 1 }, { userId: "demo-admin-user", role: "admin" });
        assert.equal(noSession.status, 403); assert.equal(noSession.body.error.code, "permissionDenied");
        const forgedAdminFromPriest = await invoke(interactionPost, "setMelodyWindow", { months: 1 }, { userId: "demo-admin-user", role: "admin" }, priestCookie);
        assert.equal(forgedAdminFromPriest.status, 403); assert.equal(forgedAdminFromPriest.body.error.code, "permissionDenied");

        const deniedCatalog = await invoke(catalogPost, "setSongActive", { role: "admin", songId: "demo-cz-101", active: false }, { userId: "demo-admin-user", role: "priest" }, priestCookie);
        assert.equal(deniedCatalog.body.error?.code, "permissionDenied");
        const allowedCatalog = await invoke(catalogPost, "setSongActive", { role: "priest", songId: "demo-cz-101", active: false }, { userId: "demo-priest-user", role: "admin" }, adminCookie);
        assert.equal(allowedCatalog.body.success, true);
        await invoke(catalogPost, "setSongActive", { songId: "demo-cz-101", active: true }, { userId: "demo-admin-user", role: "admin" }, adminCookie);
        assert.equal((await invoke(catalogPost, "savePerson", { person: { displayName: "Denied", active: true, priest: true, organist: false } }, { userId: "demo-admin-user", role: "priest" }, priestCookie)).body.error.code, "permissionDenied");
        assert.equal((await invoke(catalogPost, "savePerson", { person: { id: "proof-person", displayName: "Allowed", active: true, priest: true, organist: false } }, { userId: "demo-priest-user", role: "admin" }, adminCookie)).body.success, true);

        const preference = await invoke(interactionPost, "saveOwnPreference", { actor: { userId: "demo-admin-user", role: "admin", displayName: "forged", personId: "demo-organist" }, songId: "demo-pl-101", score: 1 }, { userId: "demo-member-user", role: "priest" }, priestCookie);
        assert.equal(preference.body.success, true);
        const stored = await pool.query("select profile_id from song_preferences where song_id='demo-pl-101'");
        assert.deepEqual(stored.rows.map((row) => row.profile_id), ["pref-priest"]);

        const repertoireDenied = await invoke(interactionPost, "setRepertoire", { actor: { role: "admin", personId: "second-organist" }, organistPersonId: "second-organist", songId: "demo-pl-101", active: true }, { userId: "demo-admin-user", role: "organist" }, organistCookie);
        assert.equal(repertoireDenied.body.error?.code, "permissionDenied");
        const repertoireOwn = await invoke(interactionPost, "setRepertoire", { organistPersonId: "demo-organist", songId: "demo-pl-101", active: true }, { userId: "demo-admin-user", role: "organist" }, organistCookie);
        assert.equal(repertoireOwn.body.success, true);
        assert.equal((await invoke(interactionPost, "setRepertoire", { organistPersonId: "demo-organist", songId: "demo-pl-101", active: false }, { userId: "demo-organist-user", role: "admin" }, adminCookie)).body.success, true);
        assert.equal((await invoke(interactionPost, "setMelodyWindow", { months: 1 }, { userId: "demo-admin-user", role: "priest" }, priestCookie)).body.error.code, "permissionDenied");
        assert.equal((await invoke(interactionPost, "setMelodyWindow", { months: 1 }, { userId: "demo-priest-user", role: "admin" }, adminCookie)).body.success, true);

        const validPlanningInput = { role: "congregationMember", serviceContext: { serviceDate: "2026-07-20", serviceTime: "10:00", language: "czech", priest: { id: "demo-priest", displayName: "forged priest" }, organist: { id: "demo-organist", displayName: "forged organist" } }, set: { status: "working", language: "czech", rows: [{ song: { songId: "demo-cz-101", language: "czech", number: "101", title: "forged title" } }] } };
        const fakeAdminPlanning = await invoke(planningPost, "saveWorkingSet", { ...validPlanningInput, role: "admin" }, { userId: "demo-admin-user", role: "admin" }, priestCookie);
        assert.equal(fakeAdminPlanning.body.error?.code, "permissionDenied");
        const storedAdminPlanning = await invoke(planningPost, "saveWorkingSet", validPlanningInput, { userId: "demo-priest-user", role: "admin" }, adminCookie);
        assert.equal(storedAdminPlanning.body.success, true);
        const invalidPlanning = await invoke(planningPost, "saveWorkingSet", { ...validPlanningInput, serviceContext: { ...validPlanningInput.serviceContext, serviceTime: "25:00" } }, { userId: "demo-admin-user", role: "admin" }, adminCookie);
        assert.equal(invalidPlanning.body.error?.code, "invalidInput");
        assert.notEqual(invalidPlanning.body.error?.message, undefined);

        const memory = new InMemoryInteractionRepository();
        assert.equal(memory.resolveActor("demo-organist-user", "organist")?.personId, "demo-organist");
        assert.equal(memory.setRepertoire(memory.resolveActor("demo-organist-user", "organist")!, "demo-organist", "demo-pl-101", true), true);
      } finally {
        restoreInteractionPool();
        await pool.end();
      }
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    process.env.DATABASE_URL = guardUrl;
    assert.equal(await fingerprint(guardUrl), before);
    assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    console.log("Phase 31.4 evidence: stored actors/roles/person links, protected sessions, server-authoritative permissions, forgery rejection, memory regression, cleanup and guard checks passed.");
    console.log("Phase 31.4 server-authoritative actor boundary: PASS");
  } finally {
    process.env.DATABASE_URL = guardUrl;
    if (priorRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = priorRuntime;
    if (priorSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = priorSecret;
    if (priorBaseUrl === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = priorBaseUrl;
    await control.end();
  }
}
void main().catch((error) => { console.error("Phase 31.4 server-authoritative actor boundary: FAIL"); console.error(error); process.exitCode = 1; });
