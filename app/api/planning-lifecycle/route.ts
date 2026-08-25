import { NextResponse } from "next/server";
import {
  createDbBackedPlanningLifecycleService,
  DrizzleCompletedServiceRecordRepository,
  DrizzleFinalSetCompletionRepository,
  DrizzlePlanningSetRepository,
  isPastPragueDate,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../../../src/application/planning-lifecycle";
import * as schema from "../../../src/db/schema";
import { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";
import { PostgresReferenceAntiphonProvider } from "../../../src/application/postgres-reference-antiphon";
import { PostgresReferenceCatalogProvider } from "../../../src/application/postgres-reference-catalog";
import { PostgresReferenceThematicSectionProvider } from "../../../src/application/postgres-reference-thematic-section";
import { PostgresReferenceMelodyClassProvider } from "../../../src/application/reference-melody-class-provider";
import { auditEventValues, humanAuditActor, systemAuditActor } from "../../../src/application/audit-history";

type PlanningLifecycleAction =
  | "listPlanningSets"
  | "listCompletedRecords"
  | "loadPlanningSet"
  | "loadCompletedRecord"
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

  const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    const db = drizzle(pool, { schema });
    const adapterDependencies: PlanningLifecycleDrizzleAdapterDependencies = {
      db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
      schema,
    };

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
      return NextResponse.json(result);
    }

    const readService = createDbBackedPlanningLifecycleService(adapterDependencies);
    if (action === "loadCompletedRecord") {
      const recordId = isObjectWithRecordId(body.input) ? body.input.recordId : undefined;
      if (!recordId) return invalidInput("recordId is required.");
      const record = await new DrizzleCompletedServiceRecordRepository(adapterDependencies).findById(recordId);
      return NextResponse.json(record ? { success: true, value: record } : { success: false, error: { code: "notFound", message: "Completed record was not found." } });
    }
    if (action === "loadPlanningSet") {
      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;
      if (!setId) return invalidInput("setId is required.");
      return NextResponse.json(await readService.loadPlanningSet(setId));
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
        referenceMelodyClasses: new PostgresReferenceMelodyClassProvider(pool),
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
  } finally {
    await pool.end();
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
  return ["listPlanningSets", "listCompletedRecords", "loadPlanningSet", "loadCompletedRecord", "saveWorkingSet", "finalizeWorkingSet", "reopenFinalSet", "completeFinalSet", "deletePlanningSet", "updateCompletedRecord", "deleteCompletedRecord"].includes(action);
}

function isObjectWithRecordId(input: unknown): input is { recordId: string } {
  return typeof input === "object" && input !== null && "recordId" in input && typeof (input as { recordId?: unknown }).recordId === "string";
}

function isObjectWithSetId(input: unknown): input is { setId: string } {
  return typeof input === "object" && input !== null && "setId" in input && typeof (input as { setId?: unknown }).setId === "string";
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
