import { DrizzlePlanningSetRepository } from "../src/application/planning-lifecycle/drizzle-repository-adapters";
import type { PlanningLifecycleDrizzleAdapterDependencies } from "../src/application/planning-lifecycle/drizzle-repository-adapters";
import * as schema from "../src/db/schema";
import type { PlanningSet } from "../src/planning-lifecycle";

type PgModule = typeof import("pg");
type DrizzleNodePostgresModule = typeof import("drizzle-orm/node-postgres");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the DB smoke verification.");
  process.exit(1);
}

const initialWorkingSet = {
  status: "working",
  language: "czech",
  rows: [
    { song: { language: "czech", number: "101" }, note: "db smoke initial row" },
    { note: "db smoke note-only row" },
  ],
} satisfies PlanningSet & { status: "working" };

const updatedWorkingSet = {
  status: "working",
  language: "mixed",
  rows: [
    { song: { language: "polish", number: "202" }, note: "db smoke updated row" },
  ],
} satisfies PlanningSet & { status: "working" };

async function main() {
  const [{ Pool }, { drizzle }] = await Promise.all([importPg(), importDrizzleNodePostgres()]);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool, { schema });
    const repository = new DrizzlePlanningSetRepository({
      db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
    });

    const saved = await repository.saveWorkingSet(initialWorkingSet, { serviceDate: "2026-07-09", language: "czech", priest: { displayName: "Smoke Priest" }, organist: { displayName: "Smoke Organist" } });
    assert(saved.id, "save working set returned an id");

    const found = await repository.findById(saved.id);
    assert(found !== undefined, "find by id returned the saved set");
    assert(found.rows.length === initialWorkingSet.rows.length, "saved set row count matches initial input");

    const updated = await repository.saveWorkingSet(updatedWorkingSet, { ...{ serviceDate: "2026-07-09", language: "czech", priest: { displayName: "Smoke Priest" }, organist: { displayName: "Smoke Organist" } }, language: "mixed" }, saved.id);
    assert(updated.id === saved.id, "update preserved the existing planning set id");
    assert(updated.language === updatedWorkingSet.language, "update persisted the new service language");
    assert(updated.rows.length === updatedWorkingSet.rows.length, "update replaced rows");

    await repository.deleteById(saved.id);
    const afterDelete = await repository.findById(saved.id);
    assert(afterDelete === undefined, "find by id returns undefined after delete");

    console.log(`DB smoke verification passed for planning set ${saved.id}.`);
  } catch (error) {
    console.error("DB smoke verification failed.");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function importDrizzleNodePostgres(): Promise<DrizzleNodePostgresModule> {
  try {
    return await import("drizzle-orm/node-postgres");
  } catch (error) {
    throw new Error(
      "The Drizzle node-postgres adapter could not be loaded. Ensure the 'pg' package is installed with npm install before running db:smoke.",
      { cause: error },
    );
  }
}

async function importPg(): Promise<PgModule> {
  try {
    return await import("pg");
  } catch (error) {
    throw new Error(
      "The 'pg' package is required for db:smoke. Run npm install before running the smoke verification.",
      { cause: error },
    );
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

void main().catch((error: unknown) => {
  console.error("DB smoke verification failed.");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
