import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/interaction/route";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

const run = (name: string, url: string) => new Promise<void>((resolve, reject) => { const command = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]); const child = spawn(command.command, command.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`))); });
async function invoke(action: string, input: unknown, actor: unknown) { const response = await POST(new Request("http://localhost/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }) })); return { status: response.status, body: await response.json() as any }; }

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.8 verification.");
  const guard = parseGuardDatabaseUrl(process.env.DATABASE_URL); const control = new Pool({ connectionString: deriveControlUrl(guard) }); const name = generateE1DatabaseName(); await control.query(createDatabaseSql(name)); const url = deriveDatabaseUrl(guard, name); const oldRuntime = process.env.ORGANY_RUNTIME;
  try { await withCleanup(async () => {
    await run("db:migrate", url); await run("db:sync:reference-catalog", url); process.env.DATABASE_URL = url; process.env.ORGANY_RUNTIME = "db";
    const db = new Pool({ connectionString: url });
    try {
      assert.deepEqual((await db.query("select (select count(*)::int from reference_catalog_songs) songs,(select count(*)::int from reference_song_melody_memberships) memberships,(select count(*)::int from reference_melody_classes) classes")).rows[0], { songs: 1798, memberships: 1798, classes: 1798 });
      const constraints = await db.query("select constraint_type from information_schema.table_constraints where table_name='reference_song_melody_memberships'"); assert.ok(constraints.rows.some((r) => r.constraint_type === "PRIMARY KEY")); assert.equal(constraints.rows.filter((r) => r.constraint_type === "FOREIGN KEY").length, 2);
      await db.query("insert into catalog_persons(id,display_name,active) values ('m-person','M',true); insert into app_users(id,display_name,person_id,active) values ('m-admin','Admin','m-person',true),('m-priest','Priest','m-person',true); insert into app_user_roles(user_id,role) values ('m-admin','admin'),('m-priest','priest')");
    } finally { await db.end(); }
    const admin = { userId: "m-admin", role: "admin" }; const priest = { userId: "m-priest", role: "priest" };
    const singleton = await invoke("getReferenceMelodyClass", { referenceSongId: "czech:1" }, priest); assert.equal(singleton.status, 200); assert.deepEqual(Object.keys(singleton.body.value).sort(), ["classId", "members", "referenceSongId"]); assert.equal(singleton.body.value.members.length, 1); assert.deepEqual(Object.keys(singleton.body.value.members[0]).sort(), ["canonicalNumber", "displayNumber", "language", "referenceSongId", "title"]);
    assert.equal((await invoke("mergeReferenceMelodyClasses", { referenceSongId: "czech:1", mergeWithReferenceSongId: "czech:2" }, priest)).body.error.code, "permissionDenied");
    const merged = await invoke("mergeReferenceMelodyClasses", { referenceSongId: "czech:1", mergeWithReferenceSongId: "czech:2" }, admin); assert.equal(merged.body.value.members.length, 2); assert.equal(merged.body.value.classId, "reference-melody:czech:1");
    const same = await invoke("mergeReferenceMelodyClasses", { referenceSongId: "czech:1", mergeWithReferenceSongId: "czech:2" }, admin); assert.deepEqual(same.body.value, merged.body.value);
    await run("db:sync:reference-catalog", url); assert.equal((await invoke("getReferenceMelodyClass", { referenceSongId: "czech:2" }, admin)).body.value.members.length, 2);
  }, async () => { const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop); });
    console.log("Phase 31.8 authoritative reference melody equivalence: PASS");
  } finally { if (oldRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = oldRuntime; await control.end(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
