import { spawn } from "node:child_process";
import { Pool } from "pg";
import { resolveE1Executable } from "./engineering-e1-core";

const LOCAL_URL = "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const run = (command: "docker" | "npm", args: string[], env = process.env) => new Promise<number>((resolve, reject) => {
  const child = spawn(resolveE1Executable(command, process.platform), args, { env, stdio: "inherit" });
  child.on("error", reject); child.on("close", (code) => resolve(code ?? 1));
});

async function main(): Promise<void> {
  const composeCode = await run("docker", ["compose", "up", "-d", "postgres"]);
  if (composeCode !== 0) throw new Error("Docker Compose could not start the repository PostgreSQL service.");
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const pool = new Pool({ connectionString: LOCAL_URL, connectionTimeoutMillis: 1_000, max: 1 });
    try { await pool.query("SELECT 1"); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 2_000)); } finally { await pool.end().catch(() => undefined); }
  }
  if (!ready) throw new Error("Repository PostgreSQL service did not become ready within 60 seconds.");
  process.exitCode = await run("npm", ["run", "verify:engineering-e1"], { ...process.env, DATABASE_URL: LOCAL_URL });
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
