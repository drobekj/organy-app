import { eq } from "drizzle-orm";
import { createDbBackedPlanningLifecycleService } from "../src/application/planning-lifecycle/drizzle-repository-adapters";
import * as schema from "../src/db/schema";
import type { PlanningSet } from "../src/planning-lifecycle";

type PgModule = typeof import("pg");
type DrizzleNodePostgresModule = typeof import("drizzle-orm/node-postgres");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the DB lifecycle smoke verification.");
  process.exit(1);
}

const workingSet = {
  status: "working",
  language: "mixed",
  rows: [
    { song: { language: "czech", number: "101" }, note: "lifecycle smoke entrance" },
    { song: { language: "polish", number: "202" }, note: "lifecycle smoke offertory" },
  ],
} satisfies PlanningSet & { status: "working" };

async function main() {
  const [{ Pool }, { drizzle }] = await Promise.all([importPg(), importDrizzleNodePostgres()]);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool, { schema });
    const service = createDbBackedPlanningLifecycleService({
      db: db as Parameters<typeof createDbBackedPlanningLifecycleService>[0]["db"],
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    const saved = await service.saveWorkingSet({
      role: "admin",
      serviceContext: { serviceDate: "2026-07-09", priest: "Smoke Priest", organist: "Smoke Organist" },
      set: workingSet,
    });
    assert(saved.success, "save working set succeeds");
    assert(saved.value.status === "working", "saved set remains working");

    const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
    assert(finalized.success, "finalize working set succeeds");
    assert(finalized.value.status === "final", "finalized set has final status");

    const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.value.id });
    assert(completed.success, "complete final set succeeds");
    assert(completed.value.sourceFinalSetId === finalized.value.id, "completed record keeps source final set id");
    assert(completed.value.set.rows.length === workingSet.rows.length, "completed record keeps row count");

    const deletedAgain = await service.deletePlanningSet({ role: "admin", setId: finalized.value.id });
    assert(deletedAgain.success === false && deletedAgain.error.code === "notFound", "completed final set is removed from planning sets");

    await db.delete(schema.completedServices).where(eq(schema.completedServices.id, Number(completed.value.id)));

    console.log(
      `DB lifecycle smoke verification passed for planning set ${finalized.value.id} and completed service ${completed.value.id}.`,
    );
  } catch (error) {
    console.error("DB lifecycle smoke verification failed.");
    if (error instanceof Error) {
      console.error(error.message);
      if (isLikelyMissingSchemaError(error)) {
        console.error("Ensure PostgreSQL is reachable and the committed drizzle/ migrations have been applied.");
      }
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
      "The Drizzle node-postgres adapter could not be loaded. Ensure dependencies are installed before running db:lifecycle-smoke.",
      { cause: error },
    );
  }
}

async function importPg(): Promise<PgModule> {
  try {
    return await import("pg");
  } catch (error) {
    throw new Error("The 'pg' package is required for db:lifecycle-smoke. Run npm install first.", { cause: error });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function isLikelyMissingSchemaError(error: Error): boolean {
  return /relation .* does not exist|type .* does not exist|database .* does not exist|ECONNREFUSED/i.test(error.message);
}

void main().catch((error: unknown) => {
  console.error("DB lifecycle smoke verification failed.");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
