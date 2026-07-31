import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { createNpmInvocation, resolveDockerExecutable } from "./engineering-e1-core";

const DATABASE_URL = "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const EXPECTED_PASS = "Phase 31.10A authoritative antiphon recommendation backend: PASS";
const LOG_PATH = resolve(process.cwd(), "phase-31-10a.log");

function capture(command: string, args: string[], env = process.env): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("error", (error) => resolve({ code: 1, output: `${error.message}\n` }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function postgresIsReady(): Promise<boolean> {
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 1_000, max: 1 });
  try { await pool.query("select 1"); return true; } catch { return false; } finally { await pool.end().catch(() => undefined); }
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await postgresIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Repository PostgreSQL service did not become ready within 60 seconds.");
}

async function main(): Promise<void> {
  const docker = resolveDockerExecutable();
  const repositoryPostgresWasRunning = await postgresIsReady();
  let startedPostgres = false;
  try {
    if (!repositoryPostgresWasRunning) {
      const start = await capture(docker, ["compose", "up", "-d", "postgres"]);
      if (start.code !== 0) { await writeFile(LOG_PATH, start.output, "utf8"); throw new Error("Docker Compose could not start repository PostgreSQL."); }
      startedPostgres = true;
      await waitForPostgres();
    }
    const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "verify:phase-31-10a"]);
    const verification = await capture(invocation.command, invocation.args, { ...process.env, DATABASE_URL });
    await writeFile(LOG_PATH, verification.output.replace(/\r\n/g, "\n"), "utf8");
    if (verification.code !== 0 || !verification.output.includes(EXPECTED_PASS)) throw new Error("Phase 31.10a verification failed.");
    console.log(EXPECTED_PASS);
    console.log(`LOG_PATH=${LOG_PATH}`);
    console.log("EXIT_CODE=0");
  } finally {
    // Never bring down a project that was already running; stop only the service this wrapper started.
    if (startedPostgres) await capture(docker, ["compose", "stop", "postgres"]);
  }
}
void main().catch(async (error) => {
  process.exitCode = 1;
  let log = ""; try { log = await import("node:fs/promises").then(({ readFile }) => readFile(LOG_PATH, "utf8")); } catch { /* no log was created */ }
  console.error(error instanceof Error ? error.message : error);
  if (log) console.error(log.trimEnd().split("\n").slice(-12).join("\n"));
  console.error(`LOG_PATH=${LOG_PATH}`);
});
