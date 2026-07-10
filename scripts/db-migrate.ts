import * as schema from "../src/db/schema";

type PgModule = typeof import("pg");
type DrizzleNodePostgresModule = typeof import("drizzle-orm/node-postgres");
type DrizzleMigratorModule = typeof import("drizzle-orm/node-postgres/migrator");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply Drizzle migrations.");
  console.error("Example: DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app npm run db:migrate");
  process.exit(1);
}

async function main() {
  const [{ Pool }, { drizzle }, { migrate }] = await Promise.all([
    importPg(),
    importDrizzleNodePostgres(),
    importDrizzleMigrator(),
  ]);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("Drizzle migrations applied successfully.");
  } catch (error) {
    console.error("Drizzle migration failed.");
    if (error instanceof Error) {
      console.error(error.message);
      if (isLikelyConnectionError(error)) {
        console.error("Ensure the local PostgreSQL container is running with `npm run db:start` and DATABASE_URL points to it.");
      }
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function importPg(): Promise<PgModule> {
  try {
    return await import("pg");
  } catch (error) {
    throw new Error("The 'pg' package is required for db:migrate. Run npm install first.", { cause: error });
  }
}

async function importDrizzleNodePostgres(): Promise<DrizzleNodePostgresModule> {
  try {
    return await import("drizzle-orm/node-postgres");
  } catch (error) {
    throw new Error("The Drizzle node-postgres adapter could not be loaded. Run npm install first.", { cause: error });
  }
}

async function importDrizzleMigrator(): Promise<DrizzleMigratorModule> {
  try {
    return await import("drizzle-orm/node-postgres/migrator");
  } catch (error) {
    throw new Error("The Drizzle migrator could not be loaded. Run npm install first.", { cause: error });
  }
}

function isLikelyConnectionError(error: Error): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|database .* does not exist|password authentication failed|connect/i.test(error.message);
}

void main().catch((error: unknown) => {
  console.error("Drizzle migration failed.");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
