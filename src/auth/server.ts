import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { username } from "better-auth/plugins";
import * as authSchema from "../db/schema/auth-generated";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/organy_app";
const authSecret = process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex");
const pool = new Pool({ connectionString: databaseUrl, max: 6 });
const db = drizzle(pool, { schema: authSchema });

function createStaffAuth(disableSignUp: boolean) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    secret: authSecret,
    ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
    user: { modelName: "auth_user" },
    session: { modelName: "auth_session" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: true, disableSignUp, ...(disableSignUp ? {} : { autoSignIn: false }) },
    disabledPaths: disableSignUp
      ? ["/sign-up/email", "/sign-in/email", "/is-username-available"]
      : ["/sign-in/email", "/is-username-available"],
    plugins: [username()],
  });
}

export const auth = createStaffAuth(true);
export const provisioningAuth = createStaffAuth(false);

export function authRuntimeConfigurationError(): string | undefined {
  if (process.env.ORGANY_RUNTIME !== "db") return "Protected authentication is only enabled in DB runtime.";
  if (!process.env.DATABASE_URL) return "DATABASE_URL is required for protected authentication.";
  if (!process.env.BETTER_AUTH_SECRET) return "BETTER_AUTH_SECRET is required for protected authentication.";
  if (!process.env.BETTER_AUTH_URL) return "BETTER_AUTH_URL is required for protected authentication.";
  return undefined;
}
