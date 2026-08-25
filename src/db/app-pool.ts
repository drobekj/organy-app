import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

type AppDbGlobal = typeof globalThis & { __organyAppDbPools?: Map<string, Pool> };
type ErrorAwarePool = Pool & { on(event: "error", listener: (error: Error) => void): void };

const appDbGlobal = globalThis as AppDbGlobal;
const appDbPools = appDbGlobal.__organyAppDbPools ?? new Map<string, Pool>();
appDbGlobal.__organyAppDbPools = appDbPools;

export function getAppDbPool(databaseUrl: string | undefined = process.env.DATABASE_URL): Pool {
  const key = databaseUrl?.trim();
  if (!key) throw new Error("DATABASE_URL is required for DB runtime.");
  const existing = appDbPools.get(key);
  if (existing) return existing;

  const pool = new Pool({
    connectionString: key,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  (pool as ErrorAwarePool).on("error", (error: Error) => {
    console.error("PostgreSQL idle client error.", {
      name: error.name,
      message: error.message,
    });
  });
  // @vercel/functions documents node-postgres Pool as supported, while the
  // current DbPool union declaration does not structurally accept pg.Pool.
  attachDatabasePool(pool as unknown as Parameters<typeof attachDatabasePool>[0]);
  appDbPools.set(key, pool);
  return pool;
}
