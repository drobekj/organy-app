import { spawn } from "node:child_process";
import { Pool } from "pg";
import { createNpmInvocation, resolveDockerExecutable } from "./engineering-e1-core";

const DATABASE_URL = "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const REQUIRED_COMMANDS = [
  "db:migrate",
  "db:sync:reference-antiphons",
  "verify:phase-31-9",
  "db:smoke",
  "db:phase-30-1-smoke",
  "verify:engineering-e1",
  "verify:phase-31-2",
  "verify:phase-31-3",
  "verify:phase-31-4",
  "verify:phase-31-5",
  "verify:phase-31-6",
  "verify:phase-31-7",
  "verify:phase-31-8",
  "typecheck",
  "test",
  "build",
] as const;

function run(command: string, args: string[], env = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code ?? 1}.`)));
  });
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 1_000 });
    try {
      await pool.query("select 1");
      return;
    } catch {
      if (attempt === 29) throw new Error("PostgreSQL did not become ready within 60 seconds.");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
}

async function runNpmScript(name: string): Promise<void> {
  const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  await run(invocation.command, invocation.args, { ...process.env, DATABASE_URL });
}

async function main(): Promise<void> {
  const docker = resolveDockerExecutable();
  let started = false;
  try {
    await run(docker, ["compose", "up", "-d", "postgres"]);
    started = true;
    await waitForPostgres();
    for (const command of REQUIRED_COMMANDS) await runNpmScript(command);
  } finally {
    if (started) await run(docker, ["compose", "down"]);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
