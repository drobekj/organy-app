import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST as catalogPost } from "../app/api/catalog/route";
import { POST as interactionPost } from "../app/api/interaction/route";
import { POST as planningPost } from "../app/api/planning-lifecycle/route";
import { InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { apiFailure } from "../src/application/api-error";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

type Handler = (request: Request) => Promise<Response>;
async function invoke(handler: Handler, action: string, input: unknown, actor?: unknown) {
  const response = await handler(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, ...(actor !== undefined ? { actor } : {}) }) }));
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
  const guardUrl = process.env.DATABASE_URL; const guard = parseGuardDatabaseUrl(guardUrl); const before = await fingerprint(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) }); const name = generateE1DatabaseName();
  await control.query(createDatabaseSql(name)); const isolatedUrl = deriveDatabaseUrl(guard, name);
  const priorRuntime = process.env.ORGANY_RUNTIME;
  try {
    await withCleanup(async () => {
      await npmRun("db:migrate", isolatedUrl);
      const pool = new Pool({ connectionString: isolatedUrl }); try {
        await seedDemoInteractionKnowledge(pool);
        await pool.query("insert into app_user_roles (user_id, role) values ('demo-admin-user', 'priest') on conflict do nothing");
        await pool.query("insert into app_users (id, display_name, active) values ('inactive-user', 'Inactive', false), ('roleless-user', 'Roleless', true)");
        await pool.query("insert into catalog_persons (id, display_name, active, organist) values ('second-organist', 'Second Organist', true, true)");
        await pool.query("insert into app_users (id, display_name, person_id, active) values ('second-organist-user', 'Second Organist User', 'second-organist', true)");
        await pool.query("insert into app_user_roles (user_id, role) values ('second-organist-user', 'organist')");
      } finally { await pool.end(); }
      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";

      const actors = await invoke(interactionPost, "listLocalActors", {});
      assert.equal(actors.status, 200); assert.deepEqual(actors.body.value.map((u: any) => u.id).sort(), ["demo-admin-user", "demo-member-user", "demo-organist-user", "demo-priest-user", "second-organist-user"]);
      assert.deepEqual(actors.body.value.find((u: any) => u.id === "demo-admin-user").roles, ["priest", "admin"]);
      assert.equal((await invoke(catalogPost, "listSongs", {})).body.success, true);
      assert.equal((await invoke(interactionPost, "listKnowledge", {})).body.success, true);
      assert.equal((await invoke(planningPost, "listPlanningSets", {})).body.success, true);
      assert.equal((await invoke(catalogPost, "getSong", { songId: "missing-song" })).body.error.code, "notFound");
      const catalogValidation = await invoke(catalogPost, "getSong", {});
      assert.equal(catalogValidation.status, 400); assert.deepEqual(apiFailure(catalogValidation.body, "fallback").error, { code: "invalidInput", message: "Non-empty song ID is required." });
      const planningValidation = await invoke(planningPost, "loadPlanningSet", {});
      assert.equal(planningValidation.status, 400); assert.deepEqual(apiFailure(planningValidation.body, "fallback").error, { code: "invalidInput", message: "setId is required." });
      const explicitAdmin = await invoke(interactionPost, "resolveActor", {}, { userId: "demo-admin-user", role: "admin" });
      assert.equal(explicitAdmin.body.value.role, "admin");
      const fallback = await invoke(interactionPost, "resolveActor", {}, { userId: "demo-admin-user" });
      assert.equal(fallback.body.value.role, "priest");
      for (const actor of [undefined, null, {}, { userId: "" }, { userId: "demo-admin-user", role: "bogus" }]) { const result = await invoke(interactionPost, "setMelodyWindow", { months: 1 }, actor); assert.equal(result.status, 400); assert.equal(result.body.error.code, "invalidInput"); }
      for (const actor of [{ userId: "unknown-user" }, { userId: "inactive-user" }, { userId: "roleless-user" }, { userId: "demo-admin-user", role: "organist" }]) { const result = await invoke(interactionPost, "setMelodyWindow", { months: 1 }, actor); assert.equal(result.status, 403); assert.equal(result.body.error.code, "permissionDenied"); }

      for (const actor of [{ userId: "demo-priest-user", role: "priest" }, { userId: "demo-organist-user", role: "organist" }, { userId: "demo-member-user", role: "congregationMember" }]) {
        const deniedCatalog = await invoke(catalogPost, "setSongActive", { role: "admin", songId: "demo-cz-101", active: false }, actor);
        assert.equal(deniedCatalog.body.error?.code, "permissionDenied");
      }
      const allowedCatalog = await invoke(catalogPost, "setSongActive", { role: "priest", songId: "demo-cz-101", active: false }, { userId: "demo-admin-user", role: "admin" });
      assert.equal(allowedCatalog.body.success, true);
      await invoke(catalogPost, "setSongActive", { songId: "demo-cz-101", active: true }, { userId: "demo-admin-user", role: "admin" });
      assert.equal((await invoke(catalogPost, "savePerson", { person: { displayName: "Denied", active: true, priest: true, organist: false } }, { userId: "demo-priest-user", role: "priest" })).body.error.code, "permissionDenied");
      assert.equal((await invoke(catalogPost, "savePerson", { person: { id: "proof-person", displayName: "Allowed", active: true, priest: true, organist: false } }, { userId: "demo-admin-user", role: "admin" })).body.success, true);

      const preference = await invoke(interactionPost, "saveOwnPreference", { actor: { userId: "demo-priest-user", role: "admin", displayName: "forged", personId: "demo-organist" }, songId: "demo-pl-101", score: 1 }, { userId: "demo-member-user", role: "congregationMember" });
      assert.equal(preference.body.success, true);
      const db = new Pool({ connectionString: isolatedUrl });
      try {
        const stored = await db.query("select profile_id from song_preferences where song_id='demo-pl-101'");
        assert.deepEqual(stored.rows.map((row) => row.profile_id), ["pref-member"]);
      } finally { await db.end(); }

      const repertoireDenied = await invoke(interactionPost, "setRepertoire", { actor: { role: "admin", personId: "second-organist" }, organistPersonId: "second-organist", songId: "demo-pl-101", active: true }, { userId: "demo-organist-user", role: "organist" });
      assert.equal(repertoireDenied.body.error?.code, "permissionDenied");
      const repertoireOwn = await invoke(interactionPost, "setRepertoire", { organistPersonId: "demo-organist", songId: "demo-pl-101", active: true }, { userId: "demo-organist-user", role: "organist" });
      assert.equal(repertoireOwn.body.success, true);
      assert.equal((await invoke(interactionPost, "setRepertoire", { organistPersonId: "demo-organist", songId: "demo-pl-101", active: false }, { userId: "demo-admin-user", role: "admin" })).body.success, true);
      assert.equal((await invoke(interactionPost, "setMelodyWindow", { months: 1 }, { userId: "demo-priest-user", role: "priest" })).body.error.code, "permissionDenied");
      assert.equal((await invoke(interactionPost, "setMelodyWindow", { months: 1 }, { userId: "demo-admin-user", role: "admin" })).body.success, true);

      const validPlanningInput = { role: "congregationMember", serviceContext: { serviceDate: "2026-07-20", serviceTime: "10:00", language: "czech", priest: { id: "demo-priest", displayName: "forged priest" }, organist: { id: "demo-organist", displayName: "forged organist" } }, set: { status: "working", language: "czech", rows: [{ song: { songId: "demo-cz-101", language: "czech", number: "101", title: "forged title" } }] } };
      const fakeAdminPlanning = await invoke(planningPost, "saveWorkingSet", { ...validPlanningInput, role: "admin" }, { userId: "demo-member-user", role: "congregationMember" });
      assert.equal(fakeAdminPlanning.body.error?.code, "permissionDenied");
      const storedAdminPlanning = await invoke(planningPost, "saveWorkingSet", validPlanningInput, { userId: "demo-admin-user", role: "admin" });
      assert.equal(storedAdminPlanning.body.success, true);
      const invalidPlanning = await invoke(planningPost, "saveWorkingSet", { ...validPlanningInput, serviceContext: { ...validPlanningInput.serviceContext, serviceTime: "25:00" } }, { userId: "demo-admin-user", role: "admin" });
      assert.equal(invalidPlanning.body.error?.code, "invalidInput");
      assert.notEqual(invalidPlanning.body.error?.message, undefined);

      const memory = new InMemoryInteractionRepository();
      assert.equal(memory.resolveActor("demo-organist-user", "organist")?.personId, "demo-organist");
      assert.equal(memory.setRepertoire(memory.resolveActor("demo-organist-user", "organist")!, "demo-organist", "demo-pl-101", true), true);
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    process.env.DATABASE_URL = guardUrl;
    assert.equal(await fingerprint(guardUrl), before);
    assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    console.log("Phase 31.4 evidence: handlers, stored actors/roles/person links, permissions, ownership, explicit errors, memory regression, cleanup and guard checks passed.");
    console.log("Phase 31.4 server-authoritative local actor boundary: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (priorRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = priorRuntime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.4 server-authoritative local actor boundary: FAIL"); console.error(error); process.exitCode = 1; });
