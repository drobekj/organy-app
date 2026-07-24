import { spawnSync } from "node:child_process";
process.env.DATABASE_URL = "postgres://organy_app:organy_app@localhost:5432/organy_app";
process.env.ORGANY_RUNTIME = "db";
const result = spawnSync("npm", ["run", "dev"], { stdio: "inherit", shell: process.platform === "win32", env: process.env });
process.exit(result.status ?? 1);
