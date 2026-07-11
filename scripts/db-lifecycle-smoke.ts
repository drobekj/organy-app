import { eq, sql } from "drizzle-orm";
import {
  createDbBackedPlanningLifecycleService,
  DrizzlePlanningSetRepository,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../src/application/planning-lifecycle/drizzle-repository-adapters";
import * as schema from "../src/db/schema";
import type { PlanningSet, ServiceContext } from "../src/planning-lifecycle";

type PgModule = typeof import("pg");
type DrizzleNodePostgresModule = typeof import("drizzle-orm/node-postgres");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the DB lifecycle smoke verification.");
  process.exit(1);
}

const firstContext = {
  serviceDate: "2026-07-09",
  serviceTime: "09:00",
  language: "mixed",
  priest: { displayName: "Smoke Priest One" },
  organist: { displayName: "Smoke Organist One" },
} satisfies ServiceContext;

const secondContext = {
  serviceDate: "2026-07-10",
  serviceTime: "10:00",
  language: "czech",
  priest: { displayName: "Smoke Priest Two" },
  organist: { displayName: "Smoke Organist Two" },
} satisfies ServiceContext;

const firstWorkingSet = {
  status: "working",
  language: "mixed",
  rows: [
    { song: { language: "czech", number: "101" }, note: "lifecycle smoke entrance" },
    { song: { language: "polish", number: "202" }, note: "lifecycle smoke offertory" },
  ],
} satisfies PlanningSet & { status: "working" };

const secondWorkingSet = {
  status: "working",
  language: "czech",
  rows: [{ note: "second lifecycle smoke set remains after first is completed" }],
} satisfies PlanningSet & { status: "working" };

const updatedFirstWorkingSet = {
  status: "working",
  language: "polish",
  rows: [{ song: { language: "polish", number: "303" }, note: "updated lifecycle smoke row" }],
} satisfies PlanningSet & { status: "working" };

async function main() {
  const [{ Pool }, { drizzle }] = await Promise.all([importPg(), importDrizzleNodePostgres()]);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool, { schema });
    const adapterDependencies = {
      db: db as PlanningLifecycleDrizzleAdapterDependencies["db"],
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    };
    const service = createDbBackedPlanningLifecycleService(adapterDependencies);
    const planningSets = new DrizzlePlanningSetRepository(adapterDependencies);

    await cleanupSmokeData(db);

    const mismatchedLanguage = await service.saveWorkingSet({
      role: "admin",
      serviceContext: { ...firstContext, language: "czech" },
      set: firstWorkingSet,
    });
    assert(
      !mismatchedLanguage.success && mismatchedLanguage.error.code === "invalidInput",
      "save rejects mismatched set and service-context languages",
    );

    const savedFirst = await service.saveWorkingSet({ role: "admin", serviceContext: firstContext, set: firstWorkingSet });
    assert(savedFirst.success, "save first working set succeeds");
    const savedSecond = await service.saveWorkingSet({ role: "admin", serviceContext: secondContext, set: secondWorkingSet });
    assert(savedSecond.success, "save second working set succeeds");
    assert(savedFirst.value.id !== savedSecond.value.id, "two working sets have distinct ids");

    const listAfterSave = await planningSets.list();
    assert(listAfterSave.some((set) => set.id === savedFirst.value.id), "list includes first saved set");
    assert(listAfterSave.some((set) => set.id === savedSecond.value.id), "list includes second saved set");

    const loadedFirst = await planningSets.findById(savedFirst.value.id);
    assert(loadedFirst !== undefined, "load specific set succeeds");
    assert(loadedFirst.serviceContext.serviceDate === firstContext.serviceDate, "loaded set includes service date");
    assert(loadedFirst.serviceContext.serviceTime === "09:00", "loaded set normalizes service time to HH:mm");
    assert(loadedFirst.serviceContext.priest.displayName === firstContext.priest.displayName, "loaded set includes priest display name");

    const updatedFirst = await service.saveWorkingSet({
      role: "admin",
      existingSetId: savedFirst.value.id,
      serviceContext: { ...firstContext, language: "polish" },
      set: updatedFirstWorkingSet,
    });
    assert(updatedFirst.success, "loaded DB set can be edited and saved again");
    assert(updatedFirst.value.rows.length === 1, "updated set rows are replaced");
    assert(updatedFirst.value.language === "polish", "updated set language is persisted");

    const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: updatedFirst.value.id });
    assert(finalized.success, "finalize updated working set succeeds");
    assert(finalized.value.status === "final", "finalized set has final status");

    const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.value.id });
    assert(completed.success, "complete final set succeeds");
    assert(completed.value.sourceFinalSetId === finalized.value.id, "completed record keeps source final set id");

    const secondStillExists = await planningSets.findById(savedSecond.value.id);
    assert(secondStillExists !== undefined, "second saved set remains after first is completed");
    assert(secondStillExists.rows.length === secondWorkingSet.rows.length, "second saved set rows are preserved");

    const completedBeforeFinalDelete = await service.listCompletedRecords();
    assert(completedBeforeFinalDelete.success && completedBeforeFinalDelete.value.some((record) => record.id === completed.value.id && record.serviceContext.serviceTime === "09:00"), "completed context survives source final-set removal");

    await db.delete(schema.completedServices).where(eq(schema.completedServices.id, Number(completed.value.id)));
    await planningSets.deleteById(savedSecond.value.id);

    const recreateAfterDelete = await service.saveWorkingSet({ role: "admin", serviceContext: secondContext, set: secondWorkingSet });
    assert(recreateAfterDelete.success, "delete frees service date/time identity for a new save");
    if (recreateAfterDelete.success) await planningSets.deleteById(recreateAfterDelete.value.id);

    console.log(
      `DB lifecycle smoke verification passed for completed service ${completed.value.id}; second set ${savedSecond.value.id} remained available until cleanup.`,
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

async function cleanupSmokeData(db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }) {
  await db.execute(sql`delete from completed_service_rows using completed_services, service_contexts where completed_service_rows.completed_service_id = completed_services.id and completed_services.service_context_id = service_contexts.id and service_contexts.priest_display_name like 'Smoke Priest%'`);
  await db.execute(sql`delete from completed_services using service_contexts where completed_services.service_context_id = service_contexts.id and service_contexts.priest_display_name like 'Smoke Priest%'`);
  await db.execute(sql`delete from service_set_rows using service_sets, service_contexts where service_set_rows.service_set_id = service_sets.id and service_sets.service_context_id = service_contexts.id and service_contexts.priest_display_name like 'Smoke Priest%'`);
  await db.execute(sql`delete from service_sets using service_contexts where service_sets.service_context_id = service_contexts.id and service_contexts.priest_display_name like 'Smoke Priest%'`);
  await db.execute(sql`delete from service_contexts where priest_display_name like 'Smoke Priest%'`);
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
