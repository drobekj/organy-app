import { spawn } from "node:child_process";
import { Pool } from "pg";
import { createNpmInvocation, resolveDockerExecutable } from "./engineering-e1-core";
const URL = "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const run = (command: string, args: string[], env = process.env) => new Promise<number>((resolve, reject) => { const child = spawn(command, args, { env, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => resolve(code ?? 1)); });
async function main() {
  if (await run(resolveDockerExecutable(), ["compose", "up", "-d", "postgres"]) !== 0) throw new Error("Docker Compose could not start PostgreSQL.");
  let ready = false; for (let i = 0; i < 30; i++) { const pool = new Pool({ connectionString: URL, connectionTimeoutMillis: 1000 }); try { await pool.query("select 1"); ready = true; break; } catch { await new Promise((r) => setTimeout(r, 2000)); } finally { await pool.end().catch(() => undefined); } }
  if (!ready) throw new Error("PostgreSQL did not become ready within 60 seconds.");
  const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "verify:phase-31-4"]);
  process.exitCode = await run(invocation.command, invocation.args, { ...process.env, DATABASE_URL: URL });
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
