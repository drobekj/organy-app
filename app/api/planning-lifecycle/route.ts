import { NextResponse } from "next/server";
import {
  createDbBackedPlanningLifecycleService,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../../../src/application/planning-lifecycle";
import * as schema from "../../../src/db/schema";
import { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";
import { PostgresReferenceAntiphonProvider } from "../../../src/application/postgres-reference-antiphon";
import { PostgresReferenceCatalogProvider } from "../../../src/application/postgres-reference-catalog";
import { PostgresReferenceThematicSectionProvider } from "../../../src/application/postgres-reference-thematic-section";
import { PostgresReferenceMelodyClassProvider } from "../../../src/application/reference-melody-class-provider";

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

  if (!body.action || !isPlanningLifecycleAction(body.action)) {
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

    // List reads are the normal reconciliation boundary for Phase 31.25.
    // They still pass through authenticated DB runtime in Phase 31.28.
    const readService = createDbBackedPlanningLifecycleService(adapterDependencies);
    if (body.action === "listPlanningSets") {
      return NextResponse.json(await readService.listPlanningSets());
    }
    if (body.action === "listCompletedRecords") {
      return NextResponse.json(await readService.listCompletedRecords());
    }

    const planningSets = new (await import("../../../src/application/planning-lifecycle")).DrizzlePlanningSetRepository(adapterDependencies);
    if (body.action === "loadCompletedRecord") {
      const recordId = isObjectWithRecordId(body.input) ? body.input.recordId : undefined;
      if (!recordId) return invalidInput("recordId is required.");
      const records = new (await import("../../../src/application/planning-lifecycle")).DrizzleCompletedServiceRecordRepository(adapterDependencies);
      const record = await records.findById(recordId);
      return NextResponse.json(record ? { success: true, value: record } : { success: false, error: { code: "notFound", message: "Completed record was not found." } });
    }
    if (body.action === "loadPlanningSet") {
      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;
      if (!setId) return invalidInput("setId is required.");
      const set = await planningSets.findById(setId);
      return NextResponse.json(set ? { success: true, value: set } : { success: false, error: { code: "notFound", message: "Planning set was not found." } });
    }

    const service = createDbBackedPlanningLifecycleService({
      ...adapterDependencies,
      referenceAntiphons: new PostgresReferenceAntiphonProvider(pool),
      referenceTopics: new PostgresReferenceThematicSectionProvider(pool),
      referenceSongs: new PostgresReferenceCatalogProvider(pool),
      referenceMelodyClasses: new PostgresReferenceMelodyClassProvider(pool),
    });
    if (!isRecord(body.input)) return invalidInput("Planning mutation input object is required.");
    if (body.action === "saveWorkingSet" && (!isRecord(body.input.serviceContext) || !isRecord(body.input.set))) return invalidInput("saveWorkingSet requires serviceContext and set objects.");
    const input = { ...body.input, role: actor.role };
    const result = await service[body.action](input as never);

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
