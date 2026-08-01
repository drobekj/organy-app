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
const checklist = [
  "1. As admin select czech:800.",
  "2. Verify No recommended song.",
  "3. Set czech:1.",
  "4. Refresh and verify persistence.",
  "5. Replace with polish:1.",
  "6. Switch to priest and verify read-only.",
  "7. Switch back to admin and remove.",
  "8. Refresh and verify No recommended song.",
];

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
    const counts: Array<[string, string]> = [];
    for (const row of tables.rows) {
      const name = String(row.table_name);
      const result = await pool.query(`select count(*)::text count from public.${quoteIdentifier(name)}`);
      counts.push([name, String(result.rows[0].count)]);
    }
    return JSON.stringify({ tables: tables.rows.map((row) => row.table_name), counts });
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
  if (!child?.pid) return;
  if (process.platform === "win32") await capture("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  else { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } }
}
async function askResult() {
  const rl = createInterface({ input, output });
  try { return (await rl.question("Type PASS after all eight checks, otherwise type FAIL: ")).trim().toUpperCase(); }
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
    for (const command of ["db:migrate", "db:sync:reference-catalog", "db:sync:reference-antiphons"] as const) await runNpm(command, databaseUrl);
    const port = await freePort();
    const call = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)]);
    app = spawn(call.command, call.args, { env: { ...process.env, DATABASE_URL: databaseUrl, ORGANY_RUNTIME: "db" }, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    app.stdout?.on("data", (chunk) => void log(String(chunk).trimEnd()));
    app.stderr?.on("data", (chunk) => void log(String(chunk).trimEnd()));
    const url = `http://127.0.0.1:${port}`;
    await waitForHttp(url);
    console.log(url);
    for (const item of checklist) console.log(item);
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    const answer = await askResult();
    if (answer !== "PASS") throw new Error("Human browser checklist was not confirmed.");
    success = true;
    await stopApp(app); app = null;
    if (databaseName) {
      const [terminate, drop] = dropDatabaseSql(databaseName);
      await control.query(terminate, [databaseName]); await control.query(drop); databaseName = null;
    }
    if (await guardFingerprint(GUARD_URL) !== fingerprint) throw new Error("Guard database fingerprint changed.");
  } catch (error) {
    await log(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  } finally {
    await stopApp(app).catch(() => undefined);
    if (control && databaseName) {
      const [terminate, drop] = dropDatabaseSql(databaseName);
      await control.query(terminate, [databaseName]).catch(() => undefined); await control.query(drop).catch(() => undefined);
    }
    await control?.end().catch(() => undefined);
    if (startedPostgres) await capture(docker, ["compose", "stop", "postgres"]);
  }
  console.log(success ? PASS : FAIL);
  console.log(`LOG_PATH=${LOG_PATH}`);
  console.log(`EXIT_CODE=${success ? 0 : 1}`);
  if (!success) process.exitCode = 1;
}
void main();
