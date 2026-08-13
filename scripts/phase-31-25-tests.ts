import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { POST as planningLifecyclePost } from "../app/api/planning-lifecycle/route";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import {
  DrizzleFinalSetCompletionRepository,
  DrizzlePlanningSetRepository,
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
  createDbBackedPlanningLifecycleService,
  isPastPragueDate,
  pragueCalendarDate,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../src/application/planning-lifecycle";
import type { PlanningSet, ServiceContext } from "../src/planning-lifecycle";
import { useProtectedActorForAcceptance } from "../src/application/protected-actor";

const fixedNow = new Date("2026-08-10T10:00:00.000Z");
const finalRows: PlanningSet & { status: "final" } = {
  status: "final",
  language: "czech",
  rows: [{ note: "first preserved row" }, { note: "second preserved row" }],
};
const workingRows: PlanningSet & { status: "working" } = {
  status: "working",
  language: "czech",
  rows: [{ note: "working stays active" }],
};

function context(serviceDate: string, serviceTime: string, marker = "Phase 31.25"): ServiceContext {
  return {
    serviceDate,
    serviceTime,
    language: "czech",
    priest: { displayName: `${marker} Priest` },
    organist: { displayName: `${marker} Organist` },
    note: `${marker} context`,
  };
}

function errorChainContains(error: unknown, needle: string): boolean {
  if (typeof error === "string") return error.includes(needle);
  if (!(error instanceof Error)) return false;
  if (error.message.includes(needle)) return true;
  return errorChainContains((error as Error & { cause?: unknown }).cause, needle);
}

async function memoryAcceptance() {
  assert.equal(pragueCalendarDate(new Date("2026-08-09T21:59:59.999Z")), "2026-08-09");
  assert.equal(pragueCalendarDate(new Date("2026-08-09T22:00:00.000Z")), "2026-08-10", "Prague DST midnight boundary is authoritative");
  assert.equal(isPastPragueDate("2026-08-09", fixedNow), true);
  assert.equal(isPastPragueDate("2026-08-10", fixedNow), false);
  assert.equal(isPastPragueDate("2026-08-11", fixedNow), false);

  const planningSets = new InMemoryPlanningSetRepository();
  const completed = new InMemoryCompletedServiceRecordRepository();
  const service = new PlanningLifecycleService({
    planningSets,
    completedServiceRecords: completed,
    catalog: new InMemoryCatalogRepository(),
    enforceCatalogSelections: false,
    now: () => new Date(fixedNow),
  });

  const yesterdayLate = await planningSets.saveFinalSet(finalRows, context("2026-08-09", "23:59", "memory-yesterday"));
  const yesterdayEarly = await planningSets.saveFinalSet(finalRows, context("2026-08-09", "00:01", "memory-yesterday-2"));
  const today = await planningSets.saveFinalSet(finalRows, context("2026-08-10", "00:00", "memory-today"));
  const future = await planningSets.saveFinalSet(finalRows, context("2026-08-11", "00:00", "memory-future"));
  const working = await planningSets.saveWorkingSet(workingRows, context("2026-08-01", "10:00", "memory-working"));

  const activeResult = await service.listPlanningSets();
  assert.equal(activeResult.success, true);
  if (!activeResult.success) throw new Error("Unexpected Planning Lifecycle failure.");
  const activeIds = new Set(activeResult.value.map((set) => set.id));
  assert.equal(activeIds.has(yesterdayLate.id), false, "late service time cannot keep yesterday Final active");
  assert.equal(activeIds.has(yesterdayEarly.id), false, "early service time is equally overdue");
  assert.equal(activeIds.has(today.id), true, "today Final remains active all Prague calendar day");
  assert.equal(activeIds.has(future.id), true, "future Final remains active");
  assert.equal(activeIds.has(working.id), true, "Working sets never auto-complete");

  const historyResult = await service.listCompletedRecords();
  assert.equal(historyResult.success, true);
  if (!historyResult.success) throw new Error("Unexpected Planning Lifecycle failure.");
  const autoHistory = historyResult.value.filter((record) => record.serviceContext.priest.displayName.startsWith("memory-yesterday"));
  assert.equal(autoHistory.length, 2);
  assert.deepEqual(autoHistory[0].set.rows, finalRows.rows, "automatic completion preserves ordered rows");
  assert.equal(autoHistory[0].serviceContext.note?.endsWith("context"), true, "automatic completion preserves Service Context");

  const repeat = await service.listCompletedRecords();
  assert.equal(repeat.success, true);
  if (!repeat.success) throw new Error("Unexpected Planning Lifecycle failure.");
  assert.equal(repeat.value.filter((record) => record.serviceContext.priest.displayName.startsWith("memory-yesterday")).length, 2, "reconciliation is idempotent");

  const organistDenied = await service.completeFinalSet({ role: "organist", finalSetId: today.id });
  assert.equal(organistDenied.success, false);
  if (!organistDenied.success) assert.equal(organistDenied.error.code, "permissionDenied");

  const futureDenied = await service.completeFinalSet({ role: "admin", finalSetId: future.id });
  assert.equal(futureDenied.success, false);
  if (!futureDenied.success) assert.equal(futureDenied.error.code, "invalidInput");

  const todayManual = await service.completeFinalSet({ role: "priest", finalSetId: today.id });
  assert.equal(todayManual.success, true, "manual today completion remains allowed to priest/admin");
  const afterManual = await service.listPlanningSets();
  assert.equal(afterManual.success, true);
  if (afterManual.success) assert.equal(afterManual.value.some((set) => set.id === today.id), false);
}

async function dbAcceptance() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Phase 31.25 DB acceptance.");
  const pool = new Pool({ connectionString: databaseUrl });
  const restoreActor = useProtectedActorForAcceptance(async () => ({ userId: "phase31.25-acceptance", displayName: "Phase 31.25 acceptance", role: "admin" }));
  const db = drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;
  const marker = `Phase 31.25 ${process.pid}-${Date.now()}`;
  const deps: PlanningLifecycleDrizzleAdapterDependencies & { now: () => Date } = { db, now: () => new Date(fixedNow) };
  const planningSets = new DrizzlePlanningSetRepository(deps);
  let rollbackFunctionName: string | undefined;
  let rollbackTriggerName: string | undefined;

  try {
    const pastA = await planningSets.saveFinalSet(finalRows, context("2026-08-09", "23:59", `${marker} past-a`));
    const pastB = await planningSets.saveFinalSet(finalRows, context("2026-08-08", "00:01", `${marker} past-b`));
    const today = await planningSets.saveFinalSet(finalRows, context("2026-08-10", "00:00", `${marker} today`));
    const future = await planningSets.saveFinalSet(finalRows, context("2026-08-11", "00:00", `${marker} future`));
    const working = await planningSets.saveWorkingSet(workingRows, context("2026-08-01", "10:00", `${marker} working`));

    const serviceA = createDbBackedPlanningLifecycleService(deps);
    const serviceB = createDbBackedPlanningLifecycleService(deps);
    const [concurrentActive, concurrentHistory] = await Promise.all([serviceA.listPlanningSets(), serviceB.listCompletedRecords()]);
    assert.equal(concurrentActive.success, true);
    assert.equal(concurrentHistory.success, true);

    const active = await planningSets.list();
    assert.equal(active.some((set) => set.id === pastA.id || set.id === pastB.id), false, "overdue DB Finals disappear from Plans");
    assert.equal(active.some((set) => set.id === today.id), true, "today DB Final remains");
    assert.equal(active.some((set) => set.id === future.id), true, "future DB Final remains");
    assert.equal(active.some((set) => set.id === working.id), true, "DB Working set remains");

    const history = await serviceA.listCompletedRecords();
    assert.equal(history.success, true);
    if (!history.success) throw new Error("Unexpected Planning Lifecycle failure.");
    const markerHistory = history.value.filter((record) => record.serviceContext.priest.displayName.startsWith(marker));
    const autoHistory = markerHistory.filter((record) => record.serviceContext.priest.displayName.includes("past-"));
    assert.equal(autoHistory.length, 2, "concurrent reconciliation creates exactly one Completed record per overdue Final");
    assert.deepEqual(autoHistory[0].set.rows, finalRows.rows);

    const repeat = await serviceB.listCompletedRecords();
    assert.equal(repeat.success, true);
    if (repeat.success) assert.equal(repeat.value.filter((record) => record.serviceContext.priest.displayName.includes(marker) && record.serviceContext.priest.displayName.includes("past-")).length, 2);

    // Prove the actual DB API list route is a reconciliation boundary, not a raw repository read.
    const routePast = await planningSets.saveFinalSet(finalRows, context("2000-01-01", "23:59", `${marker} route-past`));
    const routeActiveResponse = await planningLifecyclePost(new Request("http://localhost/api/planning-lifecycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "listPlanningSets", input: {} }),
    }));
    assert.equal(routeActiveResponse.status, 200);
    const routeActive = await routeActiveResponse.json() as { success: boolean; value?: { id: string }[] };
    assert.equal(routeActive.success, true);
    assert.equal(routeActive.value?.some((set) => set.id === routePast.id), false, "DB list route reconciles overdue Final before returning Plans");
    const routeHistoryResponse = await planningLifecyclePost(new Request("http://localhost/api/planning-lifecycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "listCompletedRecords", input: {} }),
    }));
    assert.equal(routeHistoryResponse.status, 200);
    const routeHistory = await routeHistoryResponse.json() as { success: boolean; value?: { serviceContext: ServiceContext }[] };
    assert.equal(routeHistory.success, true);
    assert.equal(routeHistory.value?.some((record) => record.serviceContext.priest.displayName === `${marker} route-past Priest`), true, "DB History route observes automatic completion");

    // Atomic rollback: inject a marker-scoped DELETE failure after Completed insert would have happened.
    const failureFinal = await planningSets.saveFinalSet(finalRows, context("2026-08-07", "12:00", `${marker} rollback`));
    rollbackFunctionName = `p3125_fail_${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
    rollbackTriggerName = `${rollbackFunctionName}_trigger`;
    const numericFailureId = Number(failureFinal.id);
    await pool.query(`create function ${rollbackFunctionName}() returns trigger language plpgsql as $$ begin if OLD.id = ${numericFailureId} then raise exception 'phase-31-25-injected-delete-failure'; end if; return OLD; end $$`);
    await pool.query(`create trigger ${rollbackTriggerName} before delete on service_sets for each row execute function ${rollbackFunctionName}()`);
    const beforeRollbackCount = await pool.query("select count(*)::int as count from completed_services cs join service_contexts sc on sc.id = cs.service_context_id where sc.priest_display_name = $1", [`${marker} rollback Priest`]);
    let failed = false;
    try {
      await new DrizzleFinalSetCompletionRepository(deps).completeFinalSet(failureFinal.id, fixedNow);
    } catch (error) {
      failed = errorChainContains(error, "phase-31-25-injected-delete-failure");
    }
    assert.equal(failed, true, "injected delete failure reaches atomic completion transaction");
    assert.ok(await planningSets.findById(failureFinal.id), "failed conversion keeps Final set");
    const afterRollbackCount = await pool.query("select count(*)::int as count from completed_services cs join service_contexts sc on sc.id = cs.service_context_id where sc.priest_display_name = $1", [`${marker} rollback Priest`]);
    assert.equal(afterRollbackCount.rows[0].count, beforeRollbackCount.rows[0].count, "failed conversion rolls back Completed insert");
    await pool.query(`drop trigger ${rollbackTriggerName} on service_sets`);
    await pool.query(`drop function ${rollbackFunctionName}()`);
    rollbackTriggerName = undefined;
    rollbackFunctionName = undefined;

    const retry = await new DrizzleFinalSetCompletionRepository(deps).completeFinalSet(failureFinal.id, fixedNow);
    assert.equal(retry.status, "completed", "retry after rollback succeeds");
    const idempotentRetry = await new DrizzleFinalSetCompletionRepository(deps).completeFinalSet(failureFinal.id, fixedNow);
    assert.equal(idempotentRetry.status, "notFound", "completed Final cannot be duplicated");
  } finally {
    restoreActor();
    if (rollbackTriggerName) await pool.query(`drop trigger if exists ${rollbackTriggerName} on service_sets`).catch(() => undefined);
    if (rollbackFunctionName) await pool.query(`drop function if exists ${rollbackFunctionName}()`).catch(() => undefined);
    await pool.query("delete from service_contexts where priest_display_name like $1", [`${marker}%`]).catch(() => undefined);
    await pool.end();
  }
}

async function main() {
  await memoryAcceptance();
  await dbAcceptance();
  console.log("Phase 31.25 automatic past-Final completion: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
