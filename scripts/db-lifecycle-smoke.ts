import { and, eq, like, or, sql } from "drizzle-orm";
import {
  createDbBackedPlanningLifecycleService,
  DrizzlePlanningSetRepository,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../src/application/planning-lifecycle/drizzle-repository-adapters";
import * as schema from "../src/db/schema";
import type { PlanningServiceResult } from "../src/application/planning-lifecycle/results";
import type { PlanningSet, ServiceContext } from "../src/planning-lifecycle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type PgModule = typeof import("pg");
type DrizzleNodePostgresModule = typeof import("drizzle-orm/node-postgres");
type SmokeDb = NodePgDatabase<typeof schema>;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the DB lifecycle smoke verification.");
  process.exit(1);
}

const smokeRunId = `Lifecycle Smoke ${Date.now()}-${process.pid}`;

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

    await cleanupLegacySmokeData(db);
    assert((await countLegacySmokeContexts(db)) === 0, "legacy smoke cleanup removes exact old service contexts");
    await cleanupSmokeData(db);

    const identities = await findUnusedServiceIdentities(db, 3);
    const firstIdentity = requireSmokeIdentity(identities, 0);
    const secondIdentity = requireSmokeIdentity(identities, 1);
    const updatedIdentity = requireSmokeIdentity(identities, 2);
    const firstContext = buildSmokeContext(firstIdentity, "mixed", "One");
    const secondContext = buildSmokeContext(secondIdentity, "czech", "Two");

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
    assertServiceSuccess(savedFirst, "save first working set succeeds");
    const savedSecond = await service.saveWorkingSet({ role: "admin", serviceContext: secondContext, set: secondWorkingSet });
    assertServiceSuccess(savedSecond, "save second working set succeeds");
    assert(savedFirst.value.id !== savedSecond.value.id, "two working sets have distinct ids");

    const listAfterSave = await planningSets.list();
    assert(listAfterSave.some((set) => set.id === savedFirst.value.id), "list includes first saved set");
    assert(listAfterSave.some((set) => set.id === savedSecond.value.id), "list includes second saved set");

    const loadedFirst = await planningSets.findById(savedFirst.value.id);
    assert(loadedFirst !== undefined, "load specific set succeeds");
    assert(loadedFirst.serviceContext.serviceDate === firstContext.serviceDate, "loaded set includes service date");
    assert(loadedFirst.serviceContext.serviceTime === firstIdentity.serviceTime, "loaded set normalizes service time to HH:mm");
    assert(loadedFirst.serviceContext.priest.displayName === firstContext.priest.displayName, "loaded set includes priest display name");

    const updatedFirst = await service.saveWorkingSet({
      role: "admin",
      existingSetId: savedFirst.value.id,
      serviceContext: { ...firstContext, language: "polish" },
      set: updatedFirstWorkingSet,
    });
    assertServiceSuccess(updatedFirst, "loaded DB set can be edited and saved again");
    assert(updatedFirst.value.rows.length === 1, "updated set rows are replaced");
    assert(updatedFirst.value.language === "polish", "updated set language is persisted");

    const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: updatedFirst.value.id });
    assertServiceSuccess(finalized, "finalize updated working set succeeds");
    assert(finalized.value.status === "final", "finalized set has final status");

    const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.value.id });
    assertServiceSuccess(completed, "complete final set succeeds");
    assert(completed.value.sourceFinalSetId === finalized.value.id, "completed record keeps source final set id");

    const secondStillExists = await planningSets.findById(savedSecond.value.id);
    assert(secondStillExists !== undefined, "second saved set remains after first is completed");
    assert(secondStillExists.rows.length === secondWorkingSet.rows.length, "second saved set rows are preserved");

    const completedBeforeFinalDelete = await service.listCompletedRecords();
    assertServiceSuccess(completedBeforeFinalDelete, "completed records list succeeds");
    assert(completedBeforeFinalDelete.value.some((record) => record.id === completed.value.id && record.serviceContext.serviceTime === firstIdentity.serviceTime), "completed context survives source final-set removal");

    const originalCompletedAt = completed.value.completedAt;
    const updatedCompletedContext = buildSmokeContext(updatedIdentity, "mixed", "Updated");
    const updatedCompletedSet = { status: "final", language: "mixed", rows: [{ note: "DB smoke admin completed update" }, { song: { language: "czech", number: "815" } }] } satisfies PlanningSet & { status: "final" };
    const adminUpdated = await service.updateCompletedRecord({ role: "admin", recordId: completed.value.id, serviceContext: updatedCompletedContext, set: updatedCompletedSet });
    assertServiceSuccess(adminUpdated, "admin update completed record succeeds");
    assert(adminUpdated.value.completedAt.getTime() === originalCompletedAt.getTime(), "admin update preserves completedAt");

    const reloadedUpdated = await service.loadCompletedRecord(completed.value.id);
    assertServiceSuccess(reloadedUpdated, "updated completed record reloads from DB");
    assert(reloadedUpdated.value.serviceContext.serviceDate === updatedIdentity.serviceDate, "updated completed service date reloads");
    assert(reloadedUpdated.value.serviceContext.serviceTime === updatedIdentity.serviceTime, "updated completed service time reloads");
    assert(reloadedUpdated.value.set.rows.length === 2 && reloadedUpdated.value.set.rows[0]?.note === "DB smoke admin completed update", "updated completed rows reload");

    const [completedRow] = await db
      .select({
        serviceContextId: schema.completedServices.serviceContextId,
      })
      .from(schema.completedServices)
      .where(eq(schema.completedServices.id, Number(completed.value.id)))
      .limit(1);

    const completedContextId = completedRow?.serviceContextId;
    assert(completedContextId !== undefined, "completed service context id can be inspected before delete");
    const adminDeleted = await service.deleteCompletedRecord({ role: "admin", recordId: completed.value.id });
    assertServiceSuccess(adminDeleted, "admin delete completed record succeeds");
    const completedRowsAfterDelete = await db.select().from(schema.completedServiceRows).where(eq(schema.completedServiceRows.completedServiceId, Number(completed.value.id)));
    assert(completedRowsAfterDelete.length === 0, "admin delete removes completed rows");
    if (completedContextId !== undefined) {
      const orphanContext = await db.select().from(schema.serviceContexts).where(eq(schema.serviceContexts.id, completedContextId));
      assert(orphanContext.length === 0, "admin delete removes orphan service context");
    }

    await planningSets.deleteById(savedSecond.value.id);

    const recreateAfterDelete = await service.saveWorkingSet({ role: "admin", serviceContext: updatedCompletedContext, set: { status: "working", language: "mixed", rows: [{ note: "reuse completed date/time after delete" }] } });
    assertServiceSuccess(recreateAfterDelete, "completed delete frees service date/time identity for a new save");
    await planningSets.deleteById(recreateAfterDelete.value.id);

    await cleanupSmokeData(db);
    assert((await countCurrentSmokeData(db)) === 0, "successful smoke run leaves no records with its marker");

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
    const db = drizzle(pool, { schema });
    try {
      await cleanupLegacySmokeData(db);
      await cleanupSmokeData(db);
    } finally {
      await pool.end();
    }
  }
}

type SmokeIdentity = {
  serviceDate: string;
  serviceTime: string;
};

type LegacySmokeIdentity = SmokeIdentity & {
  priestDisplayName: string;
  organistDisplayName: string;
};

const legacySmokeIdentities = [
  {
    serviceDate: "2026-07-09",
    serviceTime: "09:00",
    priestDisplayName: "Smoke Priest One",
    organistDisplayName: "Smoke Organist One",
  },
  {
    serviceDate: "2026-07-10",
    serviceTime: "10:00",
    priestDisplayName: "Smoke Priest Two",
    organistDisplayName: "Smoke Organist Two",
  },
  {
    serviceDate: "2026-07-08",
    serviceTime: "08:15",
    priestDisplayName: "Smoke Priest Updated",
    organistDisplayName: "Smoke Organist Updated",
  },
] satisfies LegacySmokeIdentity[];

function buildSmokeContext(
  identity: SmokeIdentity,
  language: ServiceContext["language"],
  label: string,
): ServiceContext {
  return {
    serviceDate: identity.serviceDate,
    serviceTime: identity.serviceTime,
    language,
    priest: { id: `${smokeRunId} priest ${label}`, displayName: `${smokeRunId} Priest ${label}` },
    organist: { id: `${smokeRunId} organist ${label}`, displayName: `${smokeRunId} Organist ${label}` },
  };
}

function requireSmokeIdentity(identities: SmokeIdentity[], index: number): SmokeIdentity {
  const identity = identities[index];
  assert(identity !== undefined, `smoke identity ${index + 1} is available`);
  return identity;
}

async function findUnusedServiceIdentities(
  db: Pick<SmokeDb, "select">,
  requiredCount: number,
): Promise<SmokeIdentity[]> {
  const identities: SmokeIdentity[] = [];
  const start = new Date(Date.UTC(1900, 0, 1, 0, 0, 0, 0));

  for (let offsetMinutes = 0; identities.length < requiredCount && offsetMinutes < 525_600; offsetMinutes += 1) {
    const candidate = new Date(start.getTime() + offsetMinutes * 60_000);
    const serviceDate = candidate.toISOString().slice(0, 10);
    const serviceTime = candidate.toISOString().slice(11, 16);
    const existing = await db
      .select({ id: schema.serviceContexts.id })
      .from(schema.serviceContexts)
      .where(and(eq(schema.serviceContexts.serviceDate, serviceDate), eq(schema.serviceContexts.serviceTime, serviceTime)))
      .limit(1);

    if (existing.length === 0) {
      identities.push({ serviceDate, serviceTime });
    }
  }

  assert(identities.length === requiredCount, `found ${requiredCount} unused smoke service date/time identities`);
  return identities;
}

async function cleanupSmokeData(db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }) {
  const markerPattern = `${smokeRunId}%`;
  await db.execute(sql`
    delete from completed_service_rows
    using completed_services, service_contexts
    where completed_service_rows.completed_service_id = completed_services.id
      and completed_services.service_context_id = service_contexts.id
      and (
        service_contexts.priest_display_name like ${markerPattern}
        or service_contexts.organist_display_name like ${markerPattern}
      )
  `);
  await db.execute(sql`
    delete from completed_services
    using service_contexts
    where completed_services.service_context_id = service_contexts.id
      and (
        service_contexts.priest_display_name like ${markerPattern}
        or service_contexts.organist_display_name like ${markerPattern}
      )
  `);
  await db.execute(sql`
    delete from service_set_rows
    using service_sets, service_contexts
    where service_set_rows.service_set_id = service_sets.id
      and service_sets.service_context_id = service_contexts.id
      and (
        service_contexts.priest_display_name like ${markerPattern}
        or service_contexts.organist_display_name like ${markerPattern}
      )
  `);
  await db.execute(sql`
    delete from service_sets
    using service_contexts
    where service_sets.service_context_id = service_contexts.id
      and (
        service_contexts.priest_display_name like ${markerPattern}
        or service_contexts.organist_display_name like ${markerPattern}
      )
  `);
  await db.execute(sql`
    delete from service_contexts
    where (
      priest_display_name like ${markerPattern}
      or organist_display_name like ${markerPattern}
    )
  `);
}

async function cleanupLegacySmokeData(db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }) {
  await db.execute(sql`
    delete from completed_service_rows
    using completed_services, service_contexts
    where completed_service_rows.completed_service_id = completed_services.id
      and completed_services.service_context_id = service_contexts.id
      and ${legacySmokeContextSqlCondition()}
  `);
  await db.execute(sql`
    delete from completed_services
    using service_contexts
    where completed_services.service_context_id = service_contexts.id
      and ${legacySmokeContextSqlCondition()}
  `);
  await db.execute(sql`
    delete from service_set_rows
    using service_sets, service_contexts
    where service_set_rows.service_set_id = service_sets.id
      and service_sets.service_context_id = service_contexts.id
      and ${legacySmokeContextSqlCondition()}
  `);
  await db.execute(sql`
    delete from service_sets
    using service_contexts
    where service_sets.service_context_id = service_contexts.id
      and ${legacySmokeContextSqlCondition()}
  `);
  await db.execute(sql`
    delete from service_contexts
    where ${legacySmokeContextSqlCondition()}
      and not exists (
        select 1
        from completed_services
        where completed_services.service_context_id = service_contexts.id
      )
      and not exists (
        select 1
        from service_sets
        where service_sets.service_context_id = service_contexts.id
      )
  `);
}

async function countLegacySmokeContexts(db: Pick<SmokeDb, "select">): Promise<number> {
  const contexts = await db
    .select({ id: schema.serviceContexts.id })
    .from(schema.serviceContexts)
    .where(legacySmokeContextDrizzleCondition());

  return contexts.length;
}

function legacySmokeContextDrizzleCondition() {
  return or(
    ...legacySmokeIdentities.map((identity) =>
      and(
        eq(schema.serviceContexts.serviceDate, identity.serviceDate),
        eq(schema.serviceContexts.serviceTime, identity.serviceTime),
        eq(schema.serviceContexts.priestDisplayName, identity.priestDisplayName),
        eq(schema.serviceContexts.organistDisplayName, identity.organistDisplayName),
      ),
    ),
  );
}

function legacySmokeContextSqlCondition() {
  return sql`
    (
      (
        service_contexts.service_date = ${legacySmokeIdentities[0].serviceDate}
        and service_contexts.service_time = ${legacySmokeIdentities[0].serviceTime}
        and service_contexts.priest_display_name = ${legacySmokeIdentities[0].priestDisplayName}
        and service_contexts.organist_display_name = ${legacySmokeIdentities[0].organistDisplayName}
      )
      or (
        service_contexts.service_date = ${legacySmokeIdentities[1].serviceDate}
        and service_contexts.service_time = ${legacySmokeIdentities[1].serviceTime}
        and service_contexts.priest_display_name = ${legacySmokeIdentities[1].priestDisplayName}
        and service_contexts.organist_display_name = ${legacySmokeIdentities[1].organistDisplayName}
      )
      or (
        service_contexts.service_date = ${legacySmokeIdentities[2].serviceDate}
        and service_contexts.service_time = ${legacySmokeIdentities[2].serviceTime}
        and service_contexts.priest_display_name = ${legacySmokeIdentities[2].priestDisplayName}
        and service_contexts.organist_display_name = ${legacySmokeIdentities[2].organistDisplayName}
      )
    )
  `;
}

async function countCurrentSmokeData(db: Pick<SmokeDb, "select">): Promise<number> {
  const contexts = await db
    .select({ id: schema.serviceContexts.id })
    .from(schema.serviceContexts)
    .where(
      or(
        like(schema.serviceContexts.priestDisplayName, `${smokeRunId}%`),
        like(schema.serviceContexts.organistDisplayName, `${smokeRunId}%`),
      ),
    );

  return contexts.length;
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

function assertServiceSuccess<T>(
  result: PlanningServiceResult<T>,
  message: string,
): asserts result is { success: true; value: T } {
  if (!result.success) {
    throw new Error(`${message}: [${result.error.code}] ${result.error.message}`);
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
