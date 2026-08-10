from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, found {count}\nANCHOR:\n{old[:500]}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8", newline="\n")


# --- Product contract / source-of-truth documentation ---
write("docs/phase-31-25-contract.md", r'''# Phase 31.25 — automatic past-Final completion

Baseline: `main` `2a0d4082350b7bf908cfc3120069e04628a23907` after merged Phase 31.24.

Authority: REQ-004, WF-006, backlog PL-006, Roadmap Phase 8, Contract Gate #161, user approval on 2026-08-10.

## Resolved rule

- A saved Final set is automatically eligible only when its `serviceDate` is strictly earlier than the current calendar date in `Europe/Prague`.
- Service time is informational and never changes automatic-completion eligibility.
- A Final dated today remains Final for the whole Prague calendar day unless priest/admin completes it manually.
- Future Finals remain Final.
- The next normal Planning/Plans/History list reconciliation converts every eligible Final into exactly one Completed-service record and removes the active Final.
- The automatic transition is system behavior, independent of the currently selected user role.
- Manual completion keeps its existing rule: priest/admin may complete today/past; future dates are blocked.
- Automatic and manual completion preserve the same Service Context snapshot and ordered rows.
- Completion is idempotent. PostgreSQL completion is one atomic transaction and concurrent reconciliation cannot duplicate or half-complete a Final.
- Memory runtime follows the same product semantics.
- Completed records become backward-history input and cease to be non-completed-plan conflict/forward-protection input.

## Reconciliation boundary

This phase intentionally uses normal application list refresh as the reconciliation opportunity. It does not introduce cron, a worker, a queue, a webhook, or deployment scheduling. A later operations phase may add proactive scheduling without changing the product date rule.

## Explicit exclusions

- no service-time trigger;
- no grace period or configurable delay;
- no cron/worker/queue/webhook/deployment work;
- no notification behavior;
- no audit/change-history feature beyond the existing Completed record;
- no direct Final editing;
- no Working-set auto-transition;
- no candidate, repertoire, preference, Antiphon/Topic, melody-equivalence, non-repetition-period, auth or account change.

## HUMAN checkpoint

- create/finalize one yesterday-dated service and one today-dated service;
- after normal refresh/navigation, yesterday Final is in History and absent from Final plans;
- today Final remains under Final plans;
- today Final can still be completed manually by priest/admin.

Keep the PR Draft until HUMAN PASS. Never merge without exact `MERGOVAT`.
''')

replace_once(
    "docs/requirements.md",
    '''  - Priest and admin may convert a final set to a completed-service record.\n  - The system may also convert a final set to a completed-service record automatically after a default time.\n  - Automatic conversion is an allowed product direction, but the exact default time and automatic conversion behavior remain open product/workflow questions.\n  - Deleting a saved working set or final set returns the service to `no set exists`.''',
    '''  - Priest and admin may convert a final set to a completed-service record manually when the service date is today or in the past; a future service date cannot be completed manually.\n  - The system automatically converts a saved final set when its service date is strictly earlier than the current calendar date in `Europe/Prague`, at the next normal application reconciliation opportunity.\n  - Service time is informational only and does not affect automatic-completion timing. A final set dated today remains final for the whole Prague calendar day unless it is completed manually.\n  - Automatic conversion is idempotent and preserves the same Service Context snapshot and ordered rows as manual completion.\n  - Deleting a saved working set or final set returns the service to `no set exists`.''',
)

replace_once(
    "docs/workflows.md",
    '''  1. After the service, a priest or admin may convert the final set to a completed-service record.\n  2. The system may also convert the final set to a completed-service record automatically after a default time.\n  3. The completed-service record preserves the concrete songs and ordered service rows that represent what was finalized for the service.\n  4. The record becomes historical input for backward melody non-repetition checks.\n- **Exceptions:**\n  - Automatic conversion is an allowed product direction but is not fully specified yet.\n  - The exact default time and automatic conversion behavior remain open workflow/product questions.\n  - Completed-service records are not non-completed plans.''',
    '''  1. After the service date is reached, a priest or admin may convert the final set to a completed-service record manually; future-dated services cannot be completed manually.\n  2. When the final set's service date becomes strictly earlier than the current calendar date in `Europe/Prague`, the system converts it automatically at the next normal application reconciliation opportunity.\n  3. Service time does not affect automatic-completion timing; a final set dated today remains final for the whole Prague calendar day unless completed manually.\n  4. The completed-service record preserves the concrete songs and ordered service rows that represent what was finalized for the service.\n  5. The record becomes historical input for backward melody non-repetition checks.\n- **Exceptions:**\n  - Automatic reconciliation is idempotent and does not depend on the current user's role.\n  - Completed-service records are not non-completed plans.''',
)

replace_once(
    "docs/workflows.md",
    '''## Open Workflow Questions\n\n- What exact default time should trigger automatic conversion of a final set to a completed-service record?\n- What exact automatic conversion behavior should apply around that default time?''',
    '''## Open Workflow Questions\n\nNo open workflow question remains for automatic Final → Completed timing after Phase 31.25.''',
)

replace_once(
    "docs/backlog.md",
    '''### PL-006 — Clarify automatic final-set completion\n\n- **Type:** Open question\n- **Goal:** Decide whether, when, and how a final set should automatically become a completed-service record.\n- **Source / traceability:** REQ-004; WF-006; Roadmap Phase 8 open outcome; Architecture Open Architecture Questions; History module.\n- **Acceptance direction:** Product/workflow decision clarifies automatic completion timing and behavior before any implementation details are decomposed.\n- **Status:** Open''',
    '''### PL-006 — Automatically complete past Final sets\n\n- **Type:** Product backlog item\n- **Goal:** Convert stale Final plans into historical Completed-service records without using informational service time as a trigger.\n- **Source / traceability:** REQ-004; WF-006; Roadmap Phase 8; History module; Phase 31.25 Contract Gate #161.\n- **Acceptance direction:** A Final set whose service date is strictly before the current `Europe/Prague` calendar date is converted idempotently at the next normal application reconciliation opportunity; today/future Finals remain active unless an authorized user completes today manually.\n- **Status:** Accepted''',
)

replace_once(
    "docs/roadmap.md",
    '''- Automatic conversion from final set to completed-service record remains open until timing and behavior are specified.''',
    '''- Automatic conversion is resolved: a Final set whose service date is strictly before the current `Europe/Prague` calendar date becomes Completed at the next normal application reconciliation opportunity; service time does not affect this transition.''',
)
replace_once("docs/roadmap.md", "- Automatic final-set completion behavior.\n", "")
replace_once(
    "docs/roadmap.md",
    '''- When should a final set automatically become a completed-service record, if automatic conversion is implemented?\n- What exact automatic final-set completion behavior should occur around that timing?\n''',
    "",
)

# --- Persistence contract ---
replace_once(
    "src/application/planning-lifecycle/ports.ts",
    '''export interface CompletedServiceRecordRepository {\n  createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;\n  list(): Promise<CompletedServiceRecord[]>;\n  findById(id: CompletedServiceRecordId): Promise<CompletedServiceRecord | undefined>;\n  update(id: CompletedServiceRecordId, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }): Promise<CompletedServiceRecord>;\n  deleteById(id: CompletedServiceRecordId): Promise<void>;\n  deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void>;\n}\n''',
    '''export interface CompletedServiceRecordRepository {\n  createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;\n  list(): Promise<CompletedServiceRecord[]>;\n  findById(id: CompletedServiceRecordId): Promise<CompletedServiceRecord | undefined>;\n  update(id: CompletedServiceRecordId, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }): Promise<CompletedServiceRecord>;\n  deleteById(id: CompletedServiceRecordId): Promise<void>;\n  deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void>;\n}\n\nexport type FinalSetCompletionPersistenceResult =\n  | { status: "completed"; record: CompletedServiceRecord }\n  | { status: "notFound" }\n  | { status: "notFinal" };\n\n/** Optional runtime-specific atomic boundary used by automatic and manual Final → Completed conversion. */\nexport interface FinalSetCompletionRepository {\n  completeFinalSet(finalSetId: PlanningSetId, completedAt: Date): Promise<FinalSetCompletionPersistenceResult>;\n}\n''',
)

# --- Application service: reconciliation + shared completion path ---
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''  CompletedServiceRecordRepository,\n  PersistedPlanningSet,\n  PlanningSetId,\n  PlanningSetRepository,\n} from "./ports";''',
    '''  CompletedServiceRecordRepository,\n  FinalSetCompletionPersistenceResult,\n  FinalSetCompletionRepository,\n  PersistedPlanningSet,\n  PlanningSetId,\n  PlanningSetRepository,\n} from "./ports";''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''  completedServiceRecords: CompletedServiceRecordRepository;\n  catalog: CatalogRepository;''',
    '''  completedServiceRecords: CompletedServiceRecordRepository;\n  finalSetCompletion?: FinalSetCompletionRepository;\n  catalog: CatalogRepository;''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''  private readonly planningSets: PlanningSetRepository;\n  private readonly completedServiceRecords: CompletedServiceRecordRepository;\n  private readonly catalog: CatalogRepository;''',
    '''  private readonly planningSets: PlanningSetRepository;\n  private readonly completedServiceRecords: CompletedServiceRecordRepository;\n  private readonly finalSetCompletion?: FinalSetCompletionRepository;\n  private fallbackCompletionTail: Promise<void> = Promise.resolve();\n  private readonly catalog: CatalogRepository;''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''    this.planningSets = dependencies.planningSets;\n    this.completedServiceRecords = dependencies.completedServiceRecords;\n    this.catalog = dependencies.catalog;''',
    '''    this.planningSets = dependencies.planningSets;\n    this.completedServiceRecords = dependencies.completedServiceRecords;\n    this.finalSetCompletion = dependencies.finalSetCompletion;\n    this.catalog = dependencies.catalog;''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''  async listPlanningSets(): Promise<PlanningServiceResult<PersistedPlanningSet[]>> {\n    return success(await this.planningSets.list());\n  }\n\n  async listCompletedRecords(): Promise<PlanningServiceResult<CompletedServiceRecord[]>> {\n    return success(await this.completedServiceRecords.list());\n  }''',
    '''  async listPlanningSets(): Promise<PlanningServiceResult<PersistedPlanningSet[]>> {\n    await this.reconcilePastFinalSets();\n    return success(await this.planningSets.list());\n  }\n\n  async listCompletedRecords(): Promise<PlanningServiceResult<CompletedServiceRecord[]>> {\n    await this.reconcilePastFinalSets();\n    return success(await this.completedServiceRecords.list());\n  }''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''    const completedAt = this.now();\n    const completedRecord = await this.completedServiceRecords.createFromFinalSet({\n      sourceFinalSetId: input.finalSetId,\n      set: { status: "final", language: finalSet.language, rows: finalSet.rows },\n      serviceContext: finalSet.serviceContext,\n      completedAt,\n    });\n\n    await this.planningSets.deleteById(input.finalSetId);\n    return success(completedRecord);\n  }\n\n  private async getAuthoritativeMelodyCollisions''',
    '''    const outcome = await this.persistFinalSetCompletion(finalSet, this.now());\n    if (outcome.status === "notFound") {\n      return failure({ code: "notFound", message: "Final planning set was not found." });\n    }\n    if (outcome.status === "notFinal") {\n      return failure({ code: "invalidStatus", message: "Only final planning sets can be completed." });\n    }\n    return success(outcome.record);\n  }\n\n  private async reconcilePastFinalSets(): Promise<void> {\n    const now = this.now();\n    const overdue = (await this.planningSets.list())\n      .filter((set) => set.status === "final" && isPastPragueDate(set.serviceContext.serviceDate, now))\n      .sort((left, right) => left.serviceContext.serviceDate.localeCompare(right.serviceContext.serviceDate) || left.id.localeCompare(right.id));\n\n    for (const finalSet of overdue) {\n      // A concurrent reconciliation/manual completion may win after the list snapshot.\n      // notFound/notFinal are therefore benign here; a completed outcome is already persisted.\n      await this.persistFinalSetCompletion(finalSet, now);\n    }\n  }\n\n  private async persistFinalSetCompletion(\n    finalSet: PersistedPlanningSet & { status: "final" },\n    completedAt: Date,\n  ): Promise<FinalSetCompletionPersistenceResult> {\n    if (this.finalSetCompletion) {\n      return this.finalSetCompletion.completeFinalSet(finalSet.id, completedAt);\n    }\n\n    // Memory/custom runtimes use one serialized fallback completion boundary.\n    // PostgreSQL supplies the runtime-specific atomic repository below.\n    return this.withFallbackCompletionLock(async () => {\n      const current = await this.planningSets.findById(finalSet.id);\n      if (!current) return { status: "notFound" };\n      if (current.status !== "final") return { status: "notFinal" };\n      const record = await this.completedServiceRecords.createFromFinalSet({\n        sourceFinalSetId: current.id,\n        set: { status: "final", language: current.language, rows: current.rows },\n        serviceContext: current.serviceContext,\n        completedAt,\n      });\n      await this.planningSets.deleteById(current.id);\n      return { status: "completed", record };\n    });\n  }\n\n  private async withFallbackCompletionLock<T>(operation: () => Promise<T>): Promise<T> {\n    const previous = this.fallbackCompletionTail;\n    let release!: () => void;\n    this.fallbackCompletionTail = new Promise<void>((resolve) => { release = resolve; });\n    await previous;\n    try {\n      return await operation();\n    } finally {\n      release();\n    }\n  }\n\n  private async getAuthoritativeMelodyCollisions''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''function isFuturePragueDate(serviceDate: string, now: Date): boolean {\n  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);\n  return serviceDate > today;\n}''',
    '''export function pragueCalendarDate(now: Date): string {\n  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);\n}\n\nexport function isPastPragueDate(serviceDate: string, now: Date): boolean {\n  return serviceDate < pragueCalendarDate(now);\n}\n\nfunction isFuturePragueDate(serviceDate: string, now: Date): boolean {\n  return serviceDate > pragueCalendarDate(now);\n}''',
)

# --- PostgreSQL atomic completion repository ---
replace_once(
    "src/application/planning-lifecycle/drizzle-repository-adapters.ts",
    '''import { asc, eq } from "drizzle-orm";''',
    '''import { asc, eq, sql } from "drizzle-orm";''',
)
replace_once(
    "src/application/planning-lifecycle/drizzle-repository-adapters.ts",
    '''  CompletedServiceRecord,\n  CompletedServiceRecordRepository,\n  PersistedPlanningSet,''',
    '''  CompletedServiceRecord,\n  CompletedServiceRecordRepository,\n  FinalSetCompletionPersistenceResult,\n  FinalSetCompletionRepository,\n  PersistedPlanningSet,''',
)
insert_anchor = '''export class DrizzleCompletedServiceRecordRepository implements CompletedServiceRecordRepository {'''
atomic_class = r'''export class DrizzleFinalSetCompletionRepository implements FinalSetCompletionRepository {
  constructor(private readonly dependencies: PlanningLifecycleDrizzleAdapterDependencies) {}

  async completeFinalSet(finalSetId: PlanningSetId, completedAt: Date): Promise<FinalSetCompletionPersistenceResult> {
    const numericId = parsePlanningSetId(finalSetId);
    if (numericId === undefined) return { status: "notFound" };

    return this.dependencies.db.transaction(async (tx) => {
      // Serialize concurrent automatic/manual completion attempts for the same Final row.
      await tx.execute(sql`select ${serviceSets.id} from ${serviceSets} where ${serviceSets.id} = ${numericId} for update`);

      const [sourceFinalSet] = (await selectAll(tx)
        .from(serviceSets)
        .where(eq(serviceSets.id, numericId))
        .limit(1)) as ServiceSetRecord[];
      if (!sourceFinalSet) return { status: "notFound" };
      if (sourceFinalSet.status !== "final") return { status: "notFinal" };

      const [context] = (await selectAll(tx)
        .from(serviceContexts)
        .where(eq(serviceContexts.id, sourceFinalSet.serviceContextId))
        .limit(1)) as ServiceContextRecord[];
      if (!context) throw new Error(`Service context for final set '${finalSetId}' was not found.`);

      const rows = (await selectAll(tx)
        .from(serviceSetRows)
        .where(eq(serviceSetRows.serviceSetId, numericId))
        .orderBy(asc(serviceSetRows.position))) as ServiceSetRowRecord[];
      const planningRows = rows.map(mapRowRecordToPlanningRow);
      const now = new Date();

      const [completedService] = (await insertInto(tx, completedServices)
        .values({
          serviceContextId: sourceFinalSet.serviceContextId,
          serviceSetId: numericId,
          completedAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: completedServices.id,
          serviceSetId: completedServices.serviceSetId,
          serviceContextId: completedServices.serviceContextId,
          completedAt: completedServices.completedAt,
        })) as CompletedServiceRecordRecord[];

      if (planningRows.length > 0) {
        await insertInto(tx, completedServiceRows).values(
          planningRows.map((row, index) => ({
            completedServiceId: completedService.id,
            position: index + 1,
            songId: row.song?.songId,
            songLanguage: row.song?.language,
            songNumber: row.song?.number,
            songTitle: row.song?.title,
            note: row.note,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      // Same transaction: FK changes completed_services.service_set_id to null,
      // service_set_rows cascade away, while service_context survives via Completed.
      await deleteFrom(tx, serviceSets).where(eq(serviceSets.id, numericId));

      return {
        status: "completed",
        record: {
          id: formatCompletedServiceRecordId(completedService.id),
          sourceFinalSetId: finalSetId,
          set: { status: "final", language: context.serviceLanguage, rows: planningRows },
          serviceContext: mapContextRecordToServiceContext(context),
          completedAt: new Date(completedService.completedAt),
        },
      };
    });
  }
}

'''
replace_once(
    "src/application/planning-lifecycle/drizzle-repository-adapters.ts",
    insert_anchor,
    atomic_class + insert_anchor,
)
replace_once(
    "src/application/planning-lifecycle/drizzle-repository-adapters.ts",
    '''    completedServiceRecords: new DrizzleCompletedServiceRecordRepository(dependencies),\n    catalog: new DrizzleCatalogRepository(dependencies.db),''',
    '''    completedServiceRecords: new DrizzleCompletedServiceRecordRepository(dependencies),\n    finalSetCompletion: new DrizzleFinalSetCompletionRepository(dependencies),\n    catalog: new DrizzleCatalogRepository(dependencies.db),''',
)

# --- Public exports ---
replace_once(
    "src/application/planning-lifecycle/index.ts",
    '''  CompletedServiceRecordRepository,\n  PersistedPlanningSet,''',
    '''  CompletedServiceRecordRepository,\n  FinalSetCompletionPersistenceResult,\n  FinalSetCompletionRepository,\n  PersistedPlanningSet,''',
)
replace_once(
    "src/application/planning-lifecycle/index.ts",
    '''  DrizzleCompletedServiceRecordRepository,\n  DrizzlePlanningSetRepository,''',
    '''  DrizzleCompletedServiceRecordRepository,\n  DrizzleFinalSetCompletionRepository,\n  DrizzlePlanningSetRepository,''',
)
replace_once(
    "src/application/planning-lifecycle/index.ts",
    '''  PlanningLifecycleService,\n  type CompleteFinalSetInput,''',
    '''  PlanningLifecycleService,\n  isPastPragueDate,\n  pragueCalendarDate,\n  type CompleteFinalSetInput,''',
)

# --- Focused acceptance ---
write("scripts/phase-31-25-tests.ts", r'''import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
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
  if (!activeResult.success) throw new Error(activeResult.error.message);
  const activeIds = new Set(activeResult.value.map((set) => set.id));
  assert.equal(activeIds.has(yesterdayLate.id), false, "late service time cannot keep yesterday Final active");
  assert.equal(activeIds.has(yesterdayEarly.id), false, "early service time is equally overdue");
  assert.equal(activeIds.has(today.id), true, "today Final remains active all Prague calendar day");
  assert.equal(activeIds.has(future.id), true, "future Final remains active");
  assert.equal(activeIds.has(working.id), true, "Working sets never auto-complete");

  const historyResult = await service.listCompletedRecords();
  assert.equal(historyResult.success, true);
  if (!historyResult.success) throw new Error(historyResult.error.message);
  const autoHistory = historyResult.value.filter((record) => record.serviceContext.priest.displayName.startsWith("memory-yesterday"));
  assert.equal(autoHistory.length, 2);
  assert.deepEqual(autoHistory[0].set.rows, finalRows.rows, "automatic completion preserves ordered rows");
  assert.equal(autoHistory[0].serviceContext.note?.endsWith("context"), true, "automatic completion preserves Service Context");

  const repeat = await service.listCompletedRecords();
  assert.equal(repeat.success, true);
  if (!repeat.success) throw new Error(repeat.error.message);
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
  const db = drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;
  const marker = `Phase 31.25 ${process.pid}-${Date.now()}`;
  const deps: PlanningLifecycleDrizzleAdapterDependencies & { now: () => Date } = { db, now: () => new Date(fixedNow) };
  const planningSets = new DrizzlePlanningSetRepository(deps);

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
    if (!history.success) throw new Error(history.error.message);
    const markerHistory = history.value.filter((record) => record.serviceContext.priest.displayName.startsWith(marker));
    const autoHistory = markerHistory.filter((record) => record.serviceContext.priest.displayName.includes("past-"));
    assert.equal(autoHistory.length, 2, "concurrent reconciliation creates exactly one Completed record per overdue Final");
    assert.deepEqual(autoHistory[0].set.rows, finalRows.rows);

    const repeat = await serviceB.listCompletedRecords();
    assert.equal(repeat.success, true);
    if (repeat.success) assert.equal(repeat.value.filter((record) => record.serviceContext.priest.displayName.includes(marker) && record.serviceContext.priest.displayName.includes("past-")).length, 2);

    // Atomic rollback: inject a marker-scoped DELETE failure after Completed insert would have happened.
    const failureFinal = await planningSets.saveFinalSet(finalRows, context("2026-08-07", "12:00", `${marker} rollback`));
    const functionName = `p3125_fail_${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
    const triggerName = `${functionName}_trigger`;
    const numericFailureId = Number(failureFinal.id);
    await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin if OLD.id = ${numericFailureId} then raise exception 'phase-31-25-injected-delete-failure'; end if; return OLD; end $$`);
    await pool.query(`create trigger ${triggerName} before delete on service_sets for each row execute function ${functionName}()`);
    const beforeRollbackCount = await pool.query("select count(*)::int as count from completed_services cs join service_contexts sc on sc.id = cs.service_context_id where sc.priest_display_name = $1", [`${marker} rollback Priest`]);
    let failed = false;
    try {
      await new DrizzleFinalSetCompletionRepository(deps).completeFinalSet(failureFinal.id, fixedNow);
    } catch (error) {
      failed = String(error).includes("phase-31-25-injected-delete-failure");
    }
    assert.equal(failed, true, "injected delete failure reaches atomic completion transaction");
    assert.ok(await planningSets.findById(failureFinal.id), "failed conversion keeps Final set");
    const afterRollbackCount = await pool.query("select count(*)::int as count from completed_services cs join service_contexts sc on sc.id = cs.service_context_id where sc.priest_display_name = $1", [`${marker} rollback Priest`]);
    assert.equal(afterRollbackCount.rows[0].count, beforeRollbackCount.rows[0].count, "failed conversion rolls back Completed insert");
    await pool.query(`drop trigger ${triggerName} on service_sets`);
    await pool.query(`drop function ${functionName}()`);

    const retry = await new DrizzleFinalSetCompletionRepository(deps).completeFinalSet(failureFinal.id, fixedNow);
    assert.equal(retry.status, "completed", "retry after rollback succeeds");
    const idempotentRetry = await new DrizzleFinalSetCompletionRepository(deps).completeFinalSet(failureFinal.id, fixedNow);
    assert.equal(idempotentRetry.status, "notFound", "completed Final cannot be duplicated");
  } finally {
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
''')

write(".github/workflows/phase-31-25.yml", r'''name: Phase 31.25 Automatic Final completion acceptance

on:
  pull_request:
    branches:
      - main
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: organy
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d organy"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/organy
      ORGANY_RUNTIME: db
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci --no-audit --no-fund --loglevel=error
      - name: Database migration
        run: npm run db:migrate
      - name: Phase 31.25 automatic completion acceptance
        run: npx tsx scripts/phase-31-25-tests.ts
      - name: Phase 31.24 non-repetition regression
        run: npx tsx scripts/phase-31-24-tests.ts
      - name: Phase 31.24 Knowledge UI regression
        run: node scripts/phase-31-24-ui-tests.mjs
      - name: Phase 31.20 behavior regression
        run: npm run test:phase-31-20
      - name: Typecheck
        run: npm run typecheck
      - name: Complete tests
        run: npm test
      - name: Production build
        run: npm run build
''')

print("Phase 31.25 deterministic transform prepared")
