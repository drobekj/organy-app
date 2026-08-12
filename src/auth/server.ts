import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { username } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

type AuthGlobal = typeof globalThis & { __organyAuthPool?: Pool };
const authGlobal = globalThis as AuthGlobal;

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/organy_app";
export const authPool = authGlobal.__organyAuthPool ?? new Pool({ connectionString: databaseUrl });
if (process.env.NODE_ENV !== "production") authGlobal.__organyAuthPool = authPool;

const authDb = drizzle(authPool, { schema });

export function assertProtectedAuthConfigured(): void {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for protected DB authentication.");
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required for protected DB authentication.");
}

export function createOrganyAuth(options: { allowSignUp?: boolean } = {}) {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET ?? "organy-build-placeholder-secret-not-for-runtime",
    database: drizzleAdapter(authDb, {
      provider: "pg",
      schema: {
        user: schema.authUsers,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.allowSignUp !== true,
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 64,
      }),
    ],
  });
}

export const auth = createOrganyAuth();
