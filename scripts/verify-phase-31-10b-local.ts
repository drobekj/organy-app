import { spawn } from "node:child_process";
import { Pool } from "pg";
import { createNpmInvocation, resolveDockerExecutable } from "./engineering-e1-core";

const url = "postgres://organy_app:organy_app@127.0.0.1:5432/organy_app";
const checks = ["verify:phase-31-10a", "verify:phase-31-10b", "db:migrate", "db:smoke", "db:phase-30-1-smoke", "typecheck", "test", "build"] as const;
const run = (command: string, args: string[], env = process.env) => new Promise<void>((resolve, reject) => { const child = spawn(command, args, { env, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? 1}`))); });
async function npm(name: string) { const call = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]); await run(call.command, call.args, { ...process.env, DATABASE_URL: url }); }
async function ready() { for (let i = 0; i < 30; i++) { const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 1_000 }); try { await pool.query("select 1"); return; } catch { if (i === 29) throw new Error("PostgreSQL readiness timeout"); await new Promise((resolve) => setTimeout(resolve, 2_000)); } finally { await pool.end().catch(() => undefined); } } }
async function main() { const docker = resolveDockerExecutable(); let started = false; try { await run(docker, ["compose", "up", "-d", "postgres"]); started = true; await ready(); for (const check of checks) await npm(check); console.log("Phase 31.10B browser checkpoint: HUMAN PENDING"); } finally { if (started) await run(docker, ["compose", "down"]); } }
void main().catch((error) => { console.error(error); process.exitCode = 1; });
