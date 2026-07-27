import { spawn } from "node:child_process";
import { Pool } from "pg";
import { createNpmInvocation, resolveDockerExecutable, type E1ChildProcessInvocation } from "./engineering-e1-core";

const LOCAL_URL = "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const run = ({ command, args }: E1ChildProcessInvocation, env = process.env) => new Promise<number>((resolve, reject) => { const child = spawn(command, args, { env, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => resolve(code ?? 1)); });
async function main(): Promise<void> {
  if (await run({ command: resolveDockerExecutable(), args: ["compose", "up", "-d", "postgres"] }) !== 0) throw new Error("Docker Compose could not start PostgreSQL.");
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) { const pool = new Pool({ connectionString: LOCAL_URL, connectionTimeoutMillis: 1000, max: 1 }); try { await pool.query("SELECT 1"); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 2000)); } finally { await pool.end().catch(() => undefined); } }
  if (!ready) throw new Error("PostgreSQL did not become ready within 60 seconds.");
  for (const command of ["db:migrate", "db:sync:reference-catalog", "verify:phase-31-3"]) {
    const code = await run(createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", command]), { ...process.env, DATABASE_URL: LOCAL_URL });
    if (code !== 0) { process.exitCode = code; return; }
  }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
