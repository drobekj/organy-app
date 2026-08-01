import { spawn } from "node:child_process";
import { createNpmInvocation } from "./engineering-e1-core";

const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "test:phase-31-10b"]);
const child = spawn(invocation.command, invocation.args, { env: process.env, stdio: "inherit" });
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("close", (code) => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  console.log("Phase 31.10B authoritative antiphon recommendation UI: PASS");
});
