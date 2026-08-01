import { spawn, type ChildProcess } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import net from "node:net";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Pool } from "pg";
import {
  createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl,
  dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, resolveDockerExecutable,
} from "./engineering-e1-core";

const GUARD_URL = process.env.DATABASE_URL ?? "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const LOG_PATH = resolve(process.cwd(), "phase-31-10b-human.log");
const PASS = "Phase 31.10B authoritative antiphon recommendation UI: HUMAN PASS";
const FAIL = "Phase 31.10B authoritative antiphon recommendation UI: HUMAN FAIL";
const REQUIRED_CHECKPOINT_ACTORS = [
  { userId: "demo-admin-user", role: "admin" },
  { userId: "demo-priest-user", role: "priest" },
] as const;

async function log(line: string) { await appendFile(LOG_PATH, `${line}\n`, "utf8"); }
function capture(command: string, args: string[], env = process.env): Promise<{ code: number; text: string }> {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    child.stdout.on("data", (chunk) => { text += String(chunk); });
    child.stderr.on("data", (chunk) => { text += String(chunk); });
    child.on("error", (error) => resolveResult({ code: 1, text: `${text}${error.message}\n` }));
    child.on("close", (code) => resolveResult({ code: code ?? 1, text }));
  });
}
async function runNpm(name: string, databaseUrl: string) {
  const call = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  const result = await capture(call.command, call.args, { ...process.env, DATABASE_URL: databaseUrl });
  await log(`$ npm run ${name}\n${result.text.trimEnd()}`);
  if (result.code !== 0) throw new Error(`npm run ${name} exited with ${result.code}`);
}
async function postgresReady(url: string) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 1_000, max: 1 });
  try { await pool.query("select 1"); return true; } catch { return false; } finally { await pool.end().catch(() => undefined); }
}
async function waitForPostgres() {
  for (let i = 0; i < 30; i++) { if (await postgresReady(GUARD_URL)) return; await new Promise((resolveWait) => setTimeout(resolveWait, 2_000)); }
  throw new Error("Repository PostgreSQL did not become ready within 60 seconds.");
}
function quoteIdentifier(value: string) { return `"${value.replaceAll('"', '""')}"`; }
async function guardFingerprint(url: string) {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const tables = await pool.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name");
    const columns = await pool.query("select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position");
    const counts: Array<[string, string]> = [];
    for (const row of tables.rows) {
      const name = String(row.table_name);
      const result = await pool.query(`select count(*)::text count from public.${quoteIdentifier(name)}`);
      counts.push([name, String(result.rows[0].count)]);
    }
    return JSON.stringify({ tables: tables.rows.map((row) => row.table_name), columns: columns.rows, counts });
  } finally { await pool.end(); }
}
async function verifyCheckpointActors(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query(
      `select u.id as user_id, r.role
       from app_users u
       join app_user_roles r on r.user_id = u.id
       where u.active = true
         and ((u.id = $1 and r.role = $2) or (u.id = $3 and r.role = $4))
       order by u.id, r.role`,
      [
        REQUIRED_CHECKPOINT_ACTORS[0].userId,
        REQUIRED_CHECKPOINT_ACTORS[0].role,
        REQUIRED_CHECKPOINT_ACTORS[1].userId,
        REQUIRED_CHECKPOINT_ACTORS[1].role,
      ],
    );
    const available = new Set(result.rows.map((row) => `${String(row.user_id)}:${String(row.role)}`));
    for (const actor of REQUIRED_CHECKPOINT_ACTORS) {
      const identity = `${actor.userId}:${actor.role}`;
      if (!available.has(identity)) throw new Error(`Checkpoint database is missing required active actor ${identity}.`);
    }
    await log(`Verified checkpoint actors: ${REQUIRED_CHECKPOINT_ACTORS.map((actor) => `${actor.userId}:${actor.role}`).join(", ")}`);
  } finally { await pool.end(); }
}
function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}
async function waitForHttp(url: string) {
  for (let i = 0; i < 90; i++) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* wait */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  throw new Error("Application did not become ready within 90 seconds.");
}
async function stopApp(child: ChildProcess | null) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const result = await capture("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
    if (result.code !== 0) throw new Error(`taskkill exited with ${result.code}: ${result.text.trim()}`);
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
}
async function askResult() {
  const rl = createInterface({ input, output });
  try { return (await rl.question("Konečný výsledek (PASS/FAIL): ")).trim().toUpperCase(); }
  finally { rl.close(); }
}

async function main() {
  await writeFile(LOG_PATH, "Phase 31.10B local browser checkpoint\n", "utf8");
  const docker = resolveDockerExecutable();
  const guard = parseGuardDatabaseUrl(GUARD_URL);
  const originalFingerprint = await guardFingerprint(GUARD_URL).catch(() => "");
  let startedPostgres = false;
  let control: Pool | null = null;
  let databaseName: string | null = null;
  let app: ChildProcess | null = null;
  let success = false;
  try {
    if (!(await postgresReady(GUARD_URL))) {
      const start = await capture(docker, ["compose", "up", "-d", "postgres"]);
      await log(`$ docker compose up -d postgres\n${start.text.trimEnd()}`);
      if (start.code !== 0) throw new Error("Docker Compose could not start repository PostgreSQL.");
      startedPostgres = true;
      await waitForPostgres();
    }
    const fingerprint = originalFingerprint || await guardFingerprint(GUARD_URL);
    control = new Pool({ connectionString: deriveControlUrl(guard), max: 1 });
    databaseName = generateE1DatabaseName();
    await control.query(createDatabaseSql(databaseName));
    const databaseUrl = deriveDatabaseUrl(guard, databaseName);
    await log(`Created ${databaseName}`);
    for (const command of ["db:migrate", "db:sync:reference-catalog", "db:sync:reference-antiphons", "db:seed:catalog"] as const) await runNpm(command, databaseUrl);
    await verifyCheckpointActors(databaseUrl);
    const port = await freePort();
    const call = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)]);
    app = spawn(call.command, call.args, { env: { ...process.env, DATABASE_URL: databaseUrl, ORGANY_RUNTIME: "db" }, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    app.stdout?.on("data", (chunk) => void log(String(chunk).trimEnd()));
    app.stderr?.on("data", (chunk) => void log(String(chunk).trimEnd()));
    const url = `http://127.0.0.1:${port}`;
    await waitForHttp(url);
    console.log(`CHECKPOINT_URL=${url}`);
    console.log("Kontrolní prostředí je připraveno. Postupujte podle kroků v chatu. PASS zadejte až po výslovném potvrzení v chatu; jinak zadejte FAIL.");
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    const answer = await askResult();
    if (answer !== "PASS") throw new Error("Human browser checkpoint was not confirmed.");
    await stopApp(app); app = null;
    if (databaseName) {
      const [terminate, drop] = dropDatabaseSql(databaseName);
      await control.query(terminate, [databaseName]); await control.query(drop); databaseName = null;
    }
    if (await guardFingerprint(GUARD_URL) !== fingerprint) throw new Error("Guard database fingerprint changed.");
    success = true;
  } catch (error) {
    success = false;
    await log(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  } finally {
    try { await stopApp(app); } catch (error) { success = false; await log(`CLEANUP FAIL: ${error instanceof Error ? error.message : String(error)}`); }
    if (control && databaseName) {
      try {
        const [terminate, drop] = dropDatabaseSql(databaseName);
        await control.query(terminate, [databaseName]); await control.query(drop); databaseName = null;
      } catch (error) { success = false; await log(`DATABASE CLEANUP FAIL: ${error instanceof Error ? error.message : String(error)}`); }
    }
    try { await control?.end(); } catch (error) { success = false; await log(`CONTROL CLEANUP FAIL: ${error instanceof Error ? error.message : String(error)}`); }
    if (startedPostgres) {
      const stop = await capture(docker, ["compose", "stop", "postgres"]);
      await log(`$ docker compose stop postgres\n${stop.text.trimEnd()}`);
      if (stop.code !== 0) success = false;
    }
  }
  console.log(success ? PASS : FAIL);
  console.log(`LOG_PATH=${LOG_PATH}`);
  console.log(`EXIT_CODE=${success ? 0 : 1}`);
  if (!success) process.exitCode = 1;
}
void main();
