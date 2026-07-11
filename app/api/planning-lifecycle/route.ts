import { NextResponse } from "next/server";
import {
  createDbBackedPlanningLifecycleService,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../../../src/application/planning-lifecycle";
import * as schema from "../../../src/db/schema";

type PlanningLifecycleAction =
  | "listPlanningSets"
  | "listCompletedRecords"
  | "loadPlanningSet"
  | "loadCompletedRecord"
  | "saveWorkingSet"
  | "finalizeWorkingSet"
  | "completeFinalSet"
  | "deletePlanningSet"
  | "updateCompletedRecord"
  | "deleteCompletedRecord";

type PlanningLifecycleRequest = {
  action?: PlanningLifecycleAction;
  input?: unknown;
};

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") {
    return NextResponse.json(
      { error: "Planning Lifecycle DB runtime is not enabled. Set ORGANY_RUNTIME=db to opt in." },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL is required when ORGANY_RUNTIME=db." }, { status: 500 });
  }

  const body = (await request.json()) as PlanningLifecycleRequest;

  if (!body.action || !isPlanningLifecycleAction(body.action)) {
    return NextResponse.json({ error: "Unsupported Planning Lifecycle action." }, { status: 400 });
  }

  const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const db = drizzle(pool, { schema });
    const adapterDependencies: PlanningLifecycleDrizzleAdapterDependencies = {
      db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
      schema,
    };
    const planningSets = new (await import("../../../src/application/planning-lifecycle")).DrizzlePlanningSetRepository(adapterDependencies);
    if (body.action === "listPlanningSets") {
      return NextResponse.json({ success: true, value: await planningSets.list() });
    }
    if (body.action === "listCompletedRecords") {
      const records = new (await import("../../../src/application/planning-lifecycle")).DrizzleCompletedServiceRecordRepository(adapterDependencies);
      return NextResponse.json({ success: true, value: await records.list() });
    }
    if (body.action === "loadCompletedRecord") {
      const recordId = isObjectWithRecordId(body.input) ? body.input.recordId : undefined;
      if (!recordId) return NextResponse.json({ error: "recordId is required." }, { status: 400 });
      const records = new (await import("../../../src/application/planning-lifecycle")).DrizzleCompletedServiceRecordRepository(adapterDependencies);
      const record = await records.findById(recordId);
      return NextResponse.json(record ? { success: true, value: record } : { success: false, error: { code: "notFound", message: "Completed record was not found." } });
    }
    if (body.action === "loadPlanningSet") {
      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;
      if (!setId) {
        return NextResponse.json({ error: "setId is required." }, { status: 400 });
      }
      const set = await planningSets.findById(setId);
      return NextResponse.json(set ? { success: true, value: set } : { success: false, error: { code: "notFound", message: "Planning set was not found." } });
    }

    const service = createDbBackedPlanningLifecycleService(adapterDependencies);
    const result = await service[body.action](body.input as never);

    return NextResponse.json(result);
  } catch (error) {
    const message = formatDbRuntimeError(error);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  } finally {
    await pool.end();
  }
}

function isPlanningLifecycleAction(action: string): action is PlanningLifecycleAction {
  return ["listPlanningSets", "listCompletedRecords", "loadPlanningSet", "loadCompletedRecord", "saveWorkingSet", "finalizeWorkingSet", "completeFinalSet", "deletePlanningSet", "updateCompletedRecord", "deleteCompletedRecord"].includes(action);
}

function isObjectWithRecordId(input: unknown): input is { recordId: string } {
  return typeof input === "object" && input !== null && "recordId" in input && typeof (input as { recordId?: unknown }).recordId === "string";
}

function isObjectWithSetId(input: unknown): input is { setId: string } {
  return typeof input === "object" && input !== null && "setId" in input && typeof (input as { setId?: unknown }).setId === "string";
}

function formatDbRuntimeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Planning Lifecycle DB runtime failed.";
  }

  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect/i.test(error.message)) {
    return `Planning Lifecycle DB runtime could not reach PostgreSQL. Start the local database with npm run db:start and verify DATABASE_URL. Details: ${error.message}`;
  }

  if (/relation .* does not exist|type .* does not exist/i.test(error.message)) {
    return `Planning Lifecycle DB runtime database schema is not migrated. Run npm run db:migrate with DATABASE_URL before using ORGANY_RUNTIME=db. Details: ${error.message}`;
  }

  if (/database .* does not exist/i.test(error.message)) {
    return `Planning Lifecycle DB runtime database does not exist. Start the provided local PostgreSQL setup with npm run db:start or fix DATABASE_URL. Details: ${error.message}`;
  }

  return error.message;
}
