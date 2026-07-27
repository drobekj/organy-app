import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST as catalogPost } from "../app/api/catalog/route";
import { POST as interactionPost } from "../app/api/interaction/route";
import { POST as planningPost } from "../app/api/planning-lifecycle/route";
import { InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

type Handler = (request: Request) => Promise<Response>;
async function invoke(handler: Handler, action: string, input: unknown, actor?: string) {
  const response = await handler(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", ...(actor ? { "x-organy-local-user-id": actor } : {}) }, body: JSON.stringify({ action, input }) }));
  return { status: response.status, body: await response.json() as Record<string, any> };
}
async function npmRun(name: string, url: string) {
  const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  await new Promise<void>((resolve, reject) => { const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); });
}
async function fingerprint(url: string) { const pool = new Pool({ connectionString: url }); try { const result = await pool.query("select datname from pg_database where datname=current_database()"); return JSON.stringify(result.rows); } finally { await pool.end(); } }

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.4 verification.");
  const guardUrl = process.env.DATABASE_URL; const guard = parseGuardDatabaseUrl(guardUrl); const before = await fingerprint(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) }); const name = generateE1DatabaseName();
  await control.query(createDatabaseSql(name)); const isolatedUrl = deriveDatabaseUrl(guard, name);
  const priorRuntime = process.env.ORGANY_RUNTIME;
  try {
    await withCleanup(async () => {
      await npmRun("db:migrate", isolatedUrl);
      const pool = new Pool({ connectionString: isolatedUrl }); try { await seedDemoInteractionKnowledge(pool); } finally { await pool.end(); }
      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";

      const actors = await invoke(interactionPost, "listLocalActors", {});
      assert.equal(actors.status, 200); assert.deepEqual(actors.body.value.map((u: any) => u.id).sort(), ["demo-admin-user", "demo-member-user", "demo-organist-user", "demo-priest-user"]);
      assert.equal((await invoke(interactionPost, "setMelodyWindow", { actor: { userId: "demo-admin-user", role: "admin" }, months: 1 })).status, 403);
      assert.equal((await invoke(interactionPost, "setMelodyWindow", { months: 1 }, "unknown-user")).status, 403);

      const deniedCatalog = await invoke(catalogPost, "setSongActive", { role: "admin", songId: "demo-cz-101", active: false }, "demo-priest-user");
      assert.equal(deniedCatalog.body.error?.code, "permissionDenied");
      const allowedCatalog = await invoke(catalogPost, "setSongActive", { role: "priest", songId: "demo-cz-101", active: false }, "demo-admin-user");
      assert.equal(allowedCatalog.body.success, true);
      await invoke(catalogPost, "setSongActive", { songId: "demo-cz-101", active: true }, "demo-admin-user");

      const preference = await invoke(interactionPost, "saveOwnPreference", { actor: { userId: "demo-priest-user", role: "admin", displayName: "forged", personId: "demo-organist" }, songId: "demo-pl-101", score: 1 }, "demo-member-user");
      assert.equal(preference.body.success, true);
      const db = new Pool({ connectionString: isolatedUrl });
      try {
        const stored = await db.query("select profile_id from song_preferences where song_id='demo-pl-101'");
        assert.deepEqual(stored.rows.map((row) => row.profile_id), ["pref-member"]);
      } finally { await db.end(); }

      const repertoireDenied = await invoke(interactionPost, "setRepertoire", { actor: { role: "admin", personId: "demo-priest" }, organistPersonId: "demo-priest", songId: "demo-pl-101", active: true }, "demo-organist-user");
      assert.equal(repertoireDenied.body.error?.code, "permissionDenied");
      const repertoireOwn = await invoke(interactionPost, "setRepertoire", { organistPersonId: "demo-organist", songId: "demo-pl-101", active: true }, "demo-organist-user");
      assert.equal(repertoireOwn.body.success, true);

      const fakeAdminPlanning = await invoke(planningPost, "saveWorkingSet", { role: "admin" }, "demo-member-user");
      assert.equal(fakeAdminPlanning.body.error?.code, "permissionDenied");
      const storedAdminPlanning = await invoke(planningPost, "saveWorkingSet", { role: "congregationMember" }, "demo-admin-user");
      assert.equal(storedAdminPlanning.body.error?.code, "invalidInput");

      const memory = new InMemoryInteractionRepository();
      assert.equal(memory.resolveActor("demo-organist-user")?.personId, "demo-organist");
      assert.equal(memory.setRepertoire(memory.resolveActor("demo-organist-user")!, "demo-organist", "demo-pl-101", true), true);
    }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    process.env.DATABASE_URL = guardUrl;
    assert.equal(await fingerprint(guardUrl), before);
    assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    console.log("Phase 31.4 evidence: handlers, stored actors/roles/person links, permissions, ownership, explicit errors, memory regression, cleanup and guard checks passed.");
    console.log("Phase 31.4 authoritative local actor: PASS");
  } finally { process.env.DATABASE_URL = guardUrl; if (priorRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = priorRuntime; await control.end(); }
}
void main().catch((error) => { console.error("Phase 31.4 authoritative local actor: FAIL"); console.error(error); process.exitCode = 1; });
