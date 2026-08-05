import { spawn } from "node:child_process";
import { Pool } from "pg";
import { createNpmInvocation, resolveDockerExecutable } from "./engineering-e1-core";

const DATABASE_URL = "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const LOG_PATH = "phase-31-13-human.log";

function run(command: string, args: string[], env = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code ?? 1}.`)));
  });
}

async function ready(): Promise<boolean> {
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 1_000, max: 1 });
  try { await pool.query("select 1"); return true; }
  catch { return false; }
  finally { await pool.end().catch(() => undefined); }
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("PostgreSQL did not become ready within 60 seconds.");
}

async function main(): Promise<void> {
  const docker = resolveDockerExecutable();
  const wasReady = await ready();
  let started = false;
  try {
    if (!wasReady) {
      await run(docker, ["compose", "up", "-d", "postgres"]);
      started = true;
      await waitForPostgres();
    }
    const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "verify:phase-31-13"]);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, {
        env: { ...process.env, DATABASE_URL },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: string[] = [];
      child.stdout.on("data", (chunk) => { process.stdout.write(chunk); chunks.push(String(chunk)); });
      child.stderr.on("data", (chunk) => { process.stderr.write(chunk); chunks.push(String(chunk)); });
      child.on("error", reject);
      child.on("close", async (code) => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(LOG_PATH, chunks.join(""), "utf8");
        code === 0 ? resolve() : reject(new Error(`verify:phase-31-13 exited with code ${code ?? 1}.`));
      });
    });
    console.log("Phase 31.13 bilingual thematic-section knowledge: HUMAN PASS");
    console.log(`LOG_PATH=${process.cwd()}\\${LOG_PATH}`);
    console.log("EXIT_CODE=0");
  } finally {
    if (started) await run(docker, ["compose", "stop", "postgres"]);
  }
}

void main().catch((error: unknown) => {
  console.error("Phase 31.13 bilingual thematic-section knowledge: HUMAN FAIL");
  console.error(error);
  console.error(`LOG_PATH=${process.cwd()}\\${LOG_PATH}`);
  console.error("EXIT_CODE=1");
  process.exitCode = 1;
});
