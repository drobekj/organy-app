import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", env: process.env });

run("npm", ["install", "--save-exact", "better-auth@1.6.25", "@better-auth/drizzle-adapter@1.6.25"]);

mkdirSync("scripts", { recursive: true });
writeFileSync("scripts/phase-31-28-auth-config.ts", `import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/organy_app" });
const db = drizzle(pool);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  user: { modelName: "auth_user" },
  session: { modelName: "auth_session" },
  account: { modelName: "auth_account" },
  verification: { modelName: "auth_verification" },
  emailAndPassword: { enabled: true, disableSignUp: true },
  disabledPaths: ["/sign-up/email", "/is-username-available"],
  plugins: [username()],
});
`);

run("npx", ["auth@1.6.25", "generate", "--config", "./scripts/phase-31-28-auth-config.ts", "--output", "./src/db/schema/auth-generated.ts", "--yes"]);

rmSync("scripts/phase-31-28-auth-config.ts", { force: true });
rmSync("scripts/phase-31-28-auth-bootstrap.mjs", { force: true });
rmSync(".github/workflows/phase-31-28-auth-bootstrap.yml", { force: true });
