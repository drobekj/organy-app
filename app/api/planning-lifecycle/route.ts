import { NextResponse } from "next/server";
import {
  createDbBackedPlanningLifecycleService,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../../../src/application/planning-lifecycle";
import * as schema from "../../../src/db/schema";

type PlanningLifecycleAction =
  | "listPlanningSets"
  | "loadPlanningSet"
  | "saveWorkingSet"
  | "finalizeWorkingSet"
  | "completeFinalSet"
  | "deletePlanningSet";

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Planning Lifecycle DB runtime failed." },
      { status: 500 },
    );
  } finally {
    await pool.end();
  }
}

function isPlanningLifecycleAction(action: string): action is PlanningLifecycleAction {
  return ["listPlanningSets", "loadPlanningSet", "saveWorkingSet", "finalizeWorkingSet", "completeFinalSet", "deletePlanningSet"].includes(action);
}

function isObjectWithSetId(input: unknown): input is { setId: string } {
  return typeof input === "object" && input !== null && "setId" in input && typeof (input as { setId?: unknown }).setId === "string";
}
