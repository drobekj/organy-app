import { spawnSync } from "node:child_process";

const localUrl = "postgres://organy_app:organy_app@localhost:5432/organy_app";
process.env.DATABASE_URL = localUrl;
process.env.ORGANY_RUNTIME = "db";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32", env: process.env, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Destructive local-only Phase 31A reset: removing Docker Compose PostgreSQL volume for organy_app.");
run("docker", ["compose", "down", "-v"]);
run("docker", ["compose", "up", "-d", "postgres"]);
for (let attempt = 1; attempt <= 60; attempt += 1) {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "organy_app", "-d", "organy_app"], { stdio: attempt === 60 ? "inherit" : "ignore", env: process.env });
  if (result.status === 0) break;
  if (attempt === 60) process.exit(1);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
run("npm", ["run", "db:migrate"]);
run("npm", ["run", "db:import:real-catalog"]);
run("npm", ["run", "db:verify:real-catalog"]);
console.log("Phase 31A local real catalog reset complete: Czech 808, Polish 990, Total 1,798; contamination checks passed.");
