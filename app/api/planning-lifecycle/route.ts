import { NextResponse } from "next/server";
import {
  createDbBackedPlanningLifecycleService,
  DrizzleCompletedServiceRecordRepository,
  DrizzleFinalSetCompletionRepository,
  DrizzlePlanningSetRepository,
  isPastPragueDate,
  type CompletedServiceRecord,
  type PersistedPlanningSet,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../../../src/application/planning-lifecycle";
import type { PlanningSet, ServiceContext } from "../../../src/planning-lifecycle";
import * as schema from "../../../src/db/schema";
import { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";
import { PostgresReferenceAntiphonProvider } from "../../../src/application/postgres-reference-antiphon";
import { PostgresReferenceCatalogProvider } from "../../../src/application/postgres-reference-catalog";
import { PostgresReferenceThematicSectionProvider } from "../../../src/application/postgres-reference-thematic-section";
import { PostgresReferenceMelodyClassProvider } from "../../../src/application/reference-melody-class-provider";
import { PostgresNonRepetitionPeriodService } from "../../../src/application/postgres-non-repetition-period";
import { enrichCompletedConflictStates, enrichPlanningConflictStates, enrichRevisionRowIndexes, findCompletedPlanConflicts, previewCompletedPlanInvalidation } from "../../../src/application/completed-plan-conflict-preview";
import { auditEventValues, humanAuditActor, systemAuditActor } from "../../../src/application/audit-history";
import { DrizzleCatalogRepository, getEligiblePersonDefaultById } from "../../../src/application/catalog";
import { getDraftPeopleDefaults } from "../../../src/planning-lifecycle/ui-session";
import { getAppDbPool } from "../../../src/db/app-pool";

type PlanningLifecycleAction =
  | "getWorkspaceSnapshot"
  | "listPlanningSets"
  | "listCompletedRecords"
  | "loadPlanningSet"
  | "loadCompletedRecord"
  | "previewCompletedRecordInvalidation"
  | "previewPlanningSetConflict"
  | "saveWorkingSet"
  | "finalizeWorkingSet"
  | "reopenFinalSet"
  | "completeFinalSet"
  | "deletePlanningSet"
  | "updateCompletedRecord"
  | "deleteCompletedRecord";

type PlanningLifecycleRequest = {
  action?: PlanningLifecycleAction;
  input?: unknown;
  actor?: unknown;
};

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") {
    return invalidInput("Planning Lifecycle DB runtime is not enabled. Set ORGANY_RUNTIME=db to opt in.");
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required when ORGANY_RUNTIME=db." } }, { status: 500 });
  }

  let body: PlanningLifecycleRequest;
  try { body = (await request.json()) as PlanningLifecycleRequest; } catch { return invalidInput("Malformed JSON body."); }

  const action = body.action;
  if (!action || !isPlanningLifecycleAction(action)) {
    return invalidInput("Unsupported Planning Lifecycle action.");
  }

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = getAppDbPool();

  try {
    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    const db = drizzle(pool, { schema });
    const adapterDependencies: PlanningLifecycleDrizzleAdapterDependencies = {
      db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
      schema,
    };
    const melodyClasses = new PostgresReferenceMelodyClassProvider(pool);

    if (action === "getWorkspaceSnapshot") {
      const snapshot = await db.transaction(async (tx) => {
        const txDependencies: PlanningLifecycleDrizzleAdapterDependencies = { db: tx as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"], schema };
        const planningSets = new DrizzlePlanningSetRepository(txDependencies);
        const completedRepository = new DrizzleCompletedServiceRecordRepository(txDependencies);
        const finalSetCompletion = new DrizzleFinalSetCompletionRepository(txDependencies);
        const completedAt = new Date();
        const overdue = (await planningSets.list())
          .filter((set) => set.status === "final" && isPastPragueDate(set.serviceContext.serviceDate, completedAt))
          .sort((left, right) => left.serviceContext.serviceDate.localeCompare(right.serviceContext.serviceDate) || left.id.localeCompare(right.id));

        for (const finalSet of overdue) {
          const outcome = await finalSetCompletion.completeFinalSet(finalSet.id, completedAt);
          if (outcome.status !== "completed") continue;
          await tx.insert(schema.auditEvents).values(auditEventValues({
            actor: systemAuditActor(),
            action: "planning.final.autoComplete",
            objectKind: "completedService",
            objectRef: outcome.record.id,
            beforeState: { sourceFinalSetId: finalSet.id },
            afterState: outcome.record,
          }));
        }

        return {
          activeSets: await planningSets.list(),
          completedRecords: await completedRepository.list(),
        };
      });
      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const conflictState = await enrichPlanningConflictStates({
        plans: snapshot.activeSets,
        completedRecords: snapshot.completedRecords,
        melodyClasses,
        months: melodyWindow.success ? melodyWindow.value.months : 2,
      });
      const rawDefaults = getDraftPeopleDefaults(snapshot.completedRecords);
      const catalog = new DrizzleCatalogRepository(db);
      const [priest, organist] = await Promise.all([
        getEligiblePersonDefaultById(catalog, rawDefaults.priest.id, "priest"),
        getEligiblePersonDefaultById(catalog, rawDefaults.organist.id, "organist"),
      ]);
      return NextResponse.json({
        success: true,
        value: {
          activeSets: conflictState.plans,
          completedRecords: conflictState.completedRecords,
          draftPeopleDefaults: {
            priest: priest ?? { displayName: "Anonymous" },
            organist: organist ?? { displayName: "Anonymous" },
          },
        },
      });
    }

    // List reads are the normal reconciliation boundary. Each actual automatic
    // Final → Completed conversion is audited from the same transaction and from
    // the completion outcome that still knows the immutable source Final id.
    if (action === "listPlanningSets" || action === "listCompletedRecords") {
      const result = await db.transaction(async (tx) => {
        const txDependencies: PlanningLifecycleDrizzleAdapterDependencies = { db: tx as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"], schema };
        const planningSets = new DrizzlePlanningSetRepository(txDependencies);
        const finalSetCompletion = new DrizzleFinalSetCompletionRepository(txDependencies);
        const completedAt = new Date();
        const overdue = (await planningSets.list())
          .filter((set) => set.status === "final" && isPastPragueDate(set.serviceContext.serviceDate, completedAt))
          .sort((left, right) => left.serviceContext.serviceDate.localeCompare(right.serviceContext.serviceDate) || left.id.localeCompare(right.id));

        for (const finalSet of overdue) {
          const outcome = await finalSetCompletion.completeFinalSet(finalSet.id, completedAt);
          if (outcome.status !== "completed") continue;
          await tx.insert(schema.auditEvents).values(auditEventValues({
            actor: systemAuditActor(),
            action: "planning.final.autoComplete",
            objectKind: "completedService",
            objectRef: outcome.record.id,
            beforeState: { sourceFinalSetId: finalSet.id },
            afterState: outcome.record,
          }));
        }

        const readService = createDbBackedPlanningLifecycleService(txDependencies);
        return action === "listPlanningSets" ? await readService.listPlanningSets() : await readService.listCompletedRecords();
      });
      if (result.success) {
        const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
        const months = melodyWindow.success ? melodyWindow.value.months : 2;
        if (action === "listPlanningSets") {
          const completedRecords = await new DrizzleCompletedServiceRecordRepository(adapterDependencies).list();
          const value = await enrichRevisionRowIndexes({
            plans: result.value as PersistedPlanningSet[],
            completedRecords,
            melodyClasses,
            months,
          });
          return NextResponse.json({ ...result, value });
        }
        const plans = await new DrizzlePlanningSetRepository(adapterDependencies).list();
        const value = await enrichCompletedConflictStates({
          plans,
          completedRecords: result.value as CompletedServiceRecord[],
          melodyClasses,
          months,
        });
        return NextResponse.json({ ...result, value });
      }
      return NextResponse.json(result);
    }

    const readService = createDbBackedPlanningLifecycleService(adapterDependencies);
    if (action === "loadCompletedRecord") {
      const recordId = isObjectWithRecordId(body.input) ? body.input.recordId : undefined;
      if (!recordId) return invalidInput("recordId is required.");
      const record = await new DrizzleCompletedServiceRecordRepository(adapterDependencies).findById(recordId);
      if (!record) return NextResponse.json({ success: false, error: { code: "notFound", message: "Completed record was not found." } });
      const plans = await new DrizzlePlanningSetRepository(adapterDependencies).list();
      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const [value] = await enrichCompletedConflictStates({
        plans,
        completedRecords: [record],
        melodyClasses,
        months: melodyWindow.success ? melodyWindow.value.months : 2,
      });
      return NextResponse.json({ success: true, value });
    }
    if (action === "loadPlanningSet") {
      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;
      if (!setId) return invalidInput("setId is required.");
      const result = await readService.loadPlanningSet(setId);
      if (!result.success) return NextResponse.json(result);
      const completedRecords = await new DrizzleCompletedServiceRecordRepository(adapterDependencies).list();
      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const [value] = await enrichRevisionRowIndexes({
        plans: [result.value],
        completedRecords,
        melodyClasses,
        months: melodyWindow.success ? melodyWindow.value.months : 2,
      });
      return NextResponse.json({ ...result, value });
    }
    if (action === "previewPlanningSetConflict") {
      if (!isPlanningSetConflictPreviewInput(body.input)) return invalidInput("Planning conflict preview requires setId, serviceDate and rows.");
      const planningRepository = new DrizzlePlanningSetRepository(adapterDependencies);
      const currentSet = await planningRepository.findById(body.input.setId);
      if (!currentSet) return NextResponse.json({ success: false, error: { code: "notFound", message: "Planning set was not found." } });
      if (currentSet.status !== "working") return NextResponse.json({ success: false, error: { code: "invalidStatus", message: "Only a Working planning set can be previewed as an editable draft." } });
      const completedRecords = await new DrizzleCompletedServiceRecordRepository(adapterDependencies).list();
      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const proposedPlan: PersistedPlanningSet = {
        ...currentSet,
        serviceContext: { ...currentSet.serviceContext, serviceDate: body.input.serviceDate },
        rows: body.input.rows,
      };
      const impacts = await findCompletedPlanConflicts(
        [proposedPlan],
        completedRecords,
        melodyClasses,
        melodyWindow.success ? melodyWindow.value.months : 2,
      );
      const conflictingRowIndexes = [...new Set(impacts.flatMap((impact) => impact.conflictingRowIndexes))].sort((left, right) => left - right);
      return NextResponse.json({ success: true, value: { conflictingRowIndexes } });
    }

    if (action === "previewCompletedRecordInvalidation") {
      if (actor.role !== "admin") return NextResponse.json({ success: false, error: { code: "permissionDenied", message: "Only the active admin role can preview completed-plan invalidation." } });
      if (!isCompletedPreviewInput(body.input)) return invalidInput("Completed invalidation preview requires recordId, serviceContext and final set rows.");
      const completedRepository = new DrizzleCompletedServiceRecordRepository(adapterDependencies);
      const currentRecord = await completedRepository.findById(body.input.recordId);
      if (!currentRecord) return NextResponse.json({ success: false, error: { code: "notFound", message: "Completed record was not found." } });
      const plans = await new DrizzlePlanningSetRepository(adapterDependencies).list();
      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const proposedRecord = {
        ...currentRecord,
        serviceContext: body.input.serviceContext as ServiceContext,
        set: body.input.set as PlanningSet & { status: "final" },
      };
      const value = await previewCompletedPlanInvalidation({
        plans,
        currentRecord,
        proposedRecord,
        melodyClasses,
        months: melodyWindow.success ? melodyWindow.value.months : 2,
      });
      return NextResponse.json({ success: true, value });
    }

    if (!isRecord(body.input)) return invalidInput("Planning mutation input object is required.");
    if (action === "saveWorkingSet" && (!isRecord(body.input.serviceContext) || !isRecord(body.input.set))) return invalidInput("saveWorkingSet requires serviceContext and set objects.");
    const input = { ...body.input, role: actor.role };
    const result = await db.transaction(async (tx) => {
      const txDependencies: PlanningLifecycleDrizzleAdapterDependencies = { db: tx as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"], schema };
      const before = await planningBeforeState(action, body.input as Record<string, unknown>, txDependencies);
      const service = createDbBackedPlanningLifecycleService({
        ...txDependencies,
        referenceAntiphons: new PostgresReferenceAntiphonProvider(pool),
        referenceTopics: new PostgresReferenceThematicSectionProvider(pool),
        referenceSongs: new PostgresReferenceCatalogProvider(pool),
        referenceMelodyClasses: melodyClasses,
      });
      const mutation = await service[action](input as never);
      if (mutation.success) {
        await tx.insert(schema.auditEvents).values(auditEventValues({
          actor: humanAuditActor(actor),
          action: planningAuditAction(action),
          objectKind: planningObjectKind(action),
          objectRef: planningObjectRef(action, body.input as Record<string, unknown>, mutation.value),
          beforeState: before ?? null,
          afterState: mutation.value ?? { request: body.input },
        }));
      }
      return mutation;
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProtectedActorError) return protectedActorFailure(error);
    const message = formatDbRuntimeError(error);
    return NextResponse.json(
      { error: { code: "internalError", message } },
      { status: 500 },
    );
  }
}

async function planningBeforeState(action: PlanningLifecycleAction, input: Record<string, unknown>, dependencies: PlanningLifecycleDrizzleAdapterDependencies): Promise<unknown> {
  const plans = new DrizzlePlanningSetRepository(dependencies);
  const completed = new DrizzleCompletedServiceRecordRepository(dependencies);
  if (action === "saveWorkingSet" && typeof input.existingSetId === "string") return plans.findById(input.existingSetId);
  if (action === "finalizeWorkingSet" && typeof input.workingSetId === "string") return plans.findById(input.workingSetId);
  if (action === "reopenFinalSet" && typeof input.finalSetId === "string") return plans.findById(input.finalSetId);
  if (action === "completeFinalSet" && typeof input.finalSetId === "string") return plans.findById(input.finalSetId);
  if (action === "deletePlanningSet" && typeof input.setId === "string") return plans.findById(input.setId);
  if ((action === "updateCompletedRecord" || action === "deleteCompletedRecord") && typeof input.recordId === "string") return completed.findById(input.recordId);
  return null;
}

function planningAuditAction(action: PlanningLifecycleAction): string {
  const labels: Partial<Record<PlanningLifecycleAction, string>> = {
    saveWorkingSet: "planning.working.save",
    finalizeWorkingSet: "planning.final.create",
    reopenFinalSet: "planning.final.reopen",
    completeFinalSet: "planning.final.complete",
    deletePlanningSet: "planning.plan.delete",
    updateCompletedRecord: "planning.completed.update",
    deleteCompletedRecord: "planning.completed.delete",
  };
  return labels[action] ?? `planning.${action}`;
}

function planningObjectKind(action: PlanningLifecycleAction): string {
  return action === "updateCompletedRecord" || action === "deleteCompletedRecord" || action === "completeFinalSet" ? "completedService" : "planningSet";
}

function planningObjectRef(action: PlanningLifecycleAction, input: Record<string, unknown>, value: unknown): string {
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  for (const key of action === "updateCompletedRecord" || action === "deleteCompletedRecord" ? ["recordId"] : ["existingSetId", "workingSetId", "finalSetId", "setId"]) {
    if (typeof input[key] === "string" && input[key]) return String(input[key]);
  }
  return "new";
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function invalidInput(message: string) { return NextResponse.json({ error: { code: "invalidInput", message } }, { status: 400 }); }

function isPlanningLifecycleAction(action: string): action is PlanningLifecycleAction {
  return ["getWorkspaceSnapshot", "listPlanningSets", "listCompletedRecords", "loadPlanningSet", "loadCompletedRecord", "previewCompletedRecordInvalidation", "previewPlanningSetConflict", "saveWorkingSet", "finalizeWorkingSet", "reopenFinalSet", "completeFinalSet", "deletePlanningSet", "updateCompletedRecord", "deleteCompletedRecord"].includes(action);
}

function isPlanningSetConflictPreviewInput(input: unknown): input is { setId: string; serviceDate: string; rows: PlanningSet["rows"] } {
  return isRecord(input)
    && typeof input.setId === "string"
    && typeof input.serviceDate === "string"
    && Array.isArray(input.rows)
    && input.rows.every(isRecord);
}

function isObjectWithRecordId(input: unknown): input is { recordId: string } {
  return typeof input === "object" && input !== null && "recordId" in input && typeof (input as { recordId?: unknown }).recordId === "string";
}

function isObjectWithSetId(input: unknown): input is { setId: string } {
  return typeof input === "object" && input !== null && "setId" in input && typeof (input as { setId?: unknown }).setId === "string";
}

function isCompletedPreviewInput(input: unknown): input is { recordId: string; serviceContext: ServiceContext; set: PlanningSet & { status: "final" } } {
  if (!isRecord(input) || typeof input.recordId !== "string" || !input.recordId.trim()) return false;
  if (!isRecord(input.serviceContext) || typeof input.serviceContext.serviceDate !== "string" || typeof input.serviceContext.serviceTime !== "string") return false;
  if (!isRecord(input.set) || input.set.status !== "final" || !Array.isArray(input.set.rows)) return false;
  return true;
}

function protectedActorFailure(error: ProtectedActorError) {
  const status = error.code === "unauthenticated" ? 401 : error.code === "invalidInput" ? 400 : 403;
  return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
}

function formatDbRuntimeError(error: unknown): string {
  if (!(error instanceof Error)) return "Planning Lifecycle DB runtime failed.";
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect/i.test(error.message)) return `Planning Lifecycle DB runtime could not reach PostgreSQL. Start the local database with npm run db:start and verify DATABASE_URL. Details: ${error.message}`;
  if (/relation .* does not exist|type .* does not exist/i.test(error.message)) return `Planning Lifecycle DB runtime database schema is not migrated. Run npm run db:migrate with DATABASE_URL before using ORGANY_RUNTIME=db. Details: ${error.message}`;
  if (/database .* does not exist/i.test(error.message)) return `Planning Lifecycle DB runtime database does not exist. Start the provided local PostgreSQL setup with npm run db:start or fix DATABASE_URL. Details: ${error.message}`;
  return error.message;
}
