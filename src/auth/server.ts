import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { username } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import { assertProductionRuntimeConfig } from "../config/production-runtime";

type AuthGlobal = typeof globalThis & { __organyAuthPool?: Pool };
const authGlobal = globalThis as AuthGlobal;

// Build/test module construction may use this inert local fallback. Protected runtime access
// always passes through assertProtectedAuthConfigured() before Better Auth session work.
const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/organy_app";
export const authPool = authGlobal.__organyAuthPool ?? new Pool({ connectionString: databaseUrl });
if (process.env.NODE_ENV !== "production") authGlobal.__organyAuthPool = authPool;

const authDb = drizzle(authPool, { schema });

export function assertProtectedAuthConfigured(): void {
  if (process.env.NODE_ENV === "production") {
    assertProductionRuntimeConfig(process.env);
    return;
  }
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for protected DB authentication.");
  if (!process.env.BETTER_AUTH_SECRET?.trim()) throw new Error("BETTER_AUTH_SECRET is required for protected DB authentication.");
}

export function createOrganyAuth(options: { allowSignUp?: boolean } = {}) {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET ?? "organy-build-placeholder-secret-not-for-runtime",
    disabledPaths: ["/sign-in/email"],
    database: drizzleAdapter(authDb, {
      provider: "pg",
      schema: {
        user: schema.authUsers,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
      },
    }),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            // Server-side provisioning intentionally creates an unlinked Better Auth user first,
            // then removes the signup-created session and links the user atomically in the app domain.
            if (options.allowSignUp === true) return { data: session };
            const eligible = await authPool.query(`
              select 1
              from protected_account_actor_links l
              join app_users u on u.id = l.app_user_id and u.active = true
              join app_user_roles r on r.user_id = u.id and r.role in ('admin','priest','organist')
              where l.auth_user_id = $1
              limit 1
            `, [session.userId]);
            if (!eligible.rows[0]) {
              throw new APIError("FORBIDDEN", { message: "Protected Account is inactive or has no protected role." });
            }
            return { data: session };
          },
        },
      },
    },
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
