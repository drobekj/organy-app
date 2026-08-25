from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one literal match, found {count}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one regex match, found {count}: {pattern}")
    write(path, updated)


write("src/application/planning-lifecycle/ports.ts", '''import type { PlanningSet, ServiceContext } from "../../planning-lifecycle";

export type PlanningSetId = string;
export type CompletedServiceRecordId = string;

export type PlanningSetRevisionState = { reason: string; conflictingCompletedRecordIds: string[]; conflictingRowIndexes?: number[] };
export type CompletedServiceConflictState = { conflictingPlanIds: PlanningSetId[]; conflictingRowIndexes: number[] };

export type PersistedPlanningSet = PlanningSet & {
  id: PlanningSetId;
  serviceContext: ServiceContext;
  completedAt?: Date;
  needsRevision?: PlanningSetRevisionState;
};

export type CompletedServiceRecord = {
  id: CompletedServiceRecordId;
  sourceFinalSetId: PlanningSetId;
  set: PlanningSet & { status: "final" };
  serviceContext: ServiceContext;
  completedAt: Date;
  conflictState?: CompletedServiceConflictState;
};

export interface PlanningSetRepository {
  list(): Promise<PersistedPlanningSet[]>;
  findById(id: PlanningSetId): Promise<PersistedPlanningSet | undefined>;
  saveWorkingSet(set: PlanningSet & { status: "working" }, serviceContext: ServiceContext, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;
  saveFinalSet(set: PlanningSet & { status: "final" }, serviceContext: ServiceContext, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;
  demoteFinalToWorking(id: PlanningSetId): Promise<void>;
  deleteById(id: PlanningSetId): Promise<void>;
}

export interface CompletedServiceRecordRepository {
  createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;
  list(): Promise<CompletedServiceRecord[]>;
  findById(id: CompletedServiceRecordId): Promise<CompletedServiceRecord | undefined>;
  update(id: CompletedServiceRecordId, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }, invalidatedPlanIds?: PlanningSetId[]): Promise<CompletedServiceRecord>;
  deleteById(id: CompletedServiceRecordId): Promise<void>;
  deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void>;
}

export type FinalSetCompletionPersistenceResult =
  | { status: "completed"; record: CompletedServiceRecord }
  | { status: "notFound" }
  | { status: "notFinal" };

/** Optional runtime-specific atomic boundary used by automatic and manual Final → Completed conversion. */
export interface FinalSetCompletionRepository {
  completeFinalSet(finalSetId: PlanningSetId, completedAt: Date): Promise<FinalSetCompletionPersistenceResult>;
}
''')

replace_once(
    "src/application/planning-lifecycle/index.ts",
    "  CompletedServiceRecord,\n",
    "  CompletedServiceConflictState,\n  CompletedServiceRecord,\n",
)

write("src/application/completed-plan-conflict-preview.ts", '''import type { CompletedServiceRecord, PersistedPlanningSet, PlanningSetId } from "./planning-lifecycle/ports";
import type { ReferenceMelodyClassProvider } from "./reference-melody-class-provider";

export type CompletedPlanConflictPair = {
  planRowIndex: number;
  completedRowIndex: number;
  reason: string;
};

export type CompletedPlanConflictImpact = {
  planId: PlanningSetId;
  planStatus: "working" | "final";
  completedRecordId: string;
  conflictPairs: CompletedPlanConflictPair[];
  conflictingRowIndexes: number[];
  conflictingCompletedRowIndexes: number[];
  reason: string;
};

export type CompletedPlanInvalidationPreview = {
  impactedPlans: CompletedPlanConflictImpact[];
  newlyImpactedPlans: CompletedPlanConflictImpact[];
};

export async function previewCompletedPlanInvalidation(input: {
  plans: PersistedPlanningSet[];
  currentRecord: CompletedServiceRecord;
  proposedRecord: CompletedServiceRecord;
  melodyClasses: ReferenceMelodyClassProvider;
  months: number;
}): Promise<CompletedPlanInvalidationPreview> {
  const [currentImpacts, proposedImpacts] = await Promise.all([
    findCompletedPlanConflicts(input.plans, [input.currentRecord], input.melodyClasses, input.months),
    findCompletedPlanConflicts(input.plans, [input.proposedRecord], input.melodyClasses, input.months),
  ]);
  const currentPairKeys = new Set(currentImpacts.flatMap((impact) => impact.conflictPairs.map((pair) => conflictPairKey(impact, pair))));
  const newlyImpactedPlans = proposedImpacts.flatMap((impact) => {
    const addedPairs = impact.conflictPairs.filter((pair) => !currentPairKeys.has(conflictPairKey(impact, pair)));
    if (addedPairs.length === 0) return [];
    return [impactFromPairs(impact, addedPairs)];
  });
  return { impactedPlans: proposedImpacts, newlyImpactedPlans };
}

export async function enrichPlanningConflictStates(input: {
  plans: PersistedPlanningSet[];
  completedRecords: CompletedServiceRecord[];
  melodyClasses: ReferenceMelodyClassProvider;
  months: number;
}): Promise<{ plans: PersistedPlanningSet[]; completedRecords: CompletedServiceRecord[] }> {
  const impacts = await findCompletedPlanConflicts(input.plans, input.completedRecords, input.melodyClasses, input.months);
  return {
    plans: applyPlanConflictImpacts(input.plans, impacts),
    completedRecords: applyCompletedConflictImpacts(input.completedRecords, impacts),
  };
}

export async function enrichRevisionRowIndexes(input: {
  plans: PersistedPlanningSet[];
  completedRecords: CompletedServiceRecord[];
  melodyClasses: ReferenceMelodyClassProvider;
  months: number;
}): Promise<PersistedPlanningSet[]> {
  if (input.plans.length === 0) return input.plans;
  const impacts = await findCompletedPlanConflicts(input.plans, input.completedRecords, input.melodyClasses, input.months);
  return applyPlanConflictImpacts(input.plans, impacts);
}

export async function enrichCompletedConflictStates(input: {
  plans: PersistedPlanningSet[];
  completedRecords: CompletedServiceRecord[];
  melodyClasses: ReferenceMelodyClassProvider;
  months: number;
}): Promise<CompletedServiceRecord[]> {
  if (input.completedRecords.length === 0) return input.completedRecords;
  const impacts = await findCompletedPlanConflicts(input.plans, input.completedRecords, input.melodyClasses, input.months);
  return applyCompletedConflictImpacts(input.completedRecords, impacts);
}

export async function findCompletedPlanConflicts(
  plans: PersistedPlanningSet[],
  completedRecords: CompletedServiceRecord[],
  melodyClasses: ReferenceMelodyClassProvider,
  monthsInput: number,
): Promise<CompletedPlanConflictImpact[]> {
  if (plans.length === 0 || completedRecords.length === 0) return [];
  const months = Math.max(0, Math.floor(monthsInput));
  const songIds = [...new Set([
    ...plans.flatMap((plan) => plan.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : [])),
    ...completedRecords.flatMap((record) => record.set.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : [])),
  ])];
  const memberships = await melodyClasses.getClassMemberships(songIds);
  const classBySong = new Map(memberships.map((membership) => [membership.songId, membership.melodyClassId]));
  const melodyClassOf = (songId: string) => classBySong.get(songId) ?? `reference-singleton:${songId}`;
  const impacts: CompletedPlanConflictImpact[] = [];

  for (const plan of plans) {
    for (const record of completedRecords) {
      if (!isWithinCalendarMonths(plan.serviceContext.serviceDate, record.serviceContext.serviceDate, months)) continue;
      const conflictPairs: CompletedPlanConflictPair[] = [];
      for (const [planRowIndex, planRow] of plan.rows.entries()) {
        if (!planRow.song?.songId) continue;
        for (const [completedRowIndex, historicalRow] of record.set.rows.entries()) {
          if (!historicalRow.song?.songId || melodyClassOf(planRow.song.songId) !== melodyClassOf(historicalRow.song.songId)) continue;
          conflictPairs.push({
            planRowIndex,
            completedRowIndex,
            reason: `${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}: song ${planRow.song.number} conflicts with Completed ${record.serviceContext.serviceDate} ${record.serviceContext.serviceTime}, song ${historicalRow.song.number}, within the ${months}-month melody non-repetition period.`,
          });
        }
      }
      if (conflictPairs.length === 0) continue;
      impacts.push(impactFromPairs({
        planId: plan.id,
        planStatus: plan.status,
        completedRecordId: record.id,
        conflictPairs,
        conflictingRowIndexes: [],
        conflictingCompletedRowIndexes: [],
        reason: conflictPairs[0].reason,
      }, conflictPairs));
    }
  }

  return impacts;
}

function applyPlanConflictImpacts(plans: PersistedPlanningSet[], impacts: CompletedPlanConflictImpact[]): PersistedPlanningSet[] {
  const impactsByPlan = new Map<PlanningSetId, CompletedPlanConflictImpact[]>();
  for (const impact of impacts) {
    const planImpacts = impactsByPlan.get(impact.planId) ?? [];
    planImpacts.push(impact);
    impactsByPlan.set(impact.planId, planImpacts);
  }
  return plans.map((plan) => {
    const planImpacts = impactsByPlan.get(plan.id) ?? [];
    if (planImpacts.length === 0) return { ...plan, needsRevision: undefined };
    return {
      ...plan,
      needsRevision: {
        reason: `Needs revision: ${planImpacts.map((impact) => impact.reason).join(" ")}`,
        conflictingCompletedRecordIds: uniqueStrings(planImpacts.map((impact) => impact.completedRecordId)),
        conflictingRowIndexes: uniqueNumbers(planImpacts.flatMap((impact) => impact.conflictingRowIndexes)),
      },
    };
  });
}

function applyCompletedConflictImpacts(completedRecords: CompletedServiceRecord[], impacts: CompletedPlanConflictImpact[]): CompletedServiceRecord[] {
  const impactsByRecord = new Map<string, CompletedPlanConflictImpact[]>();
  for (const impact of impacts) {
    const recordImpacts = impactsByRecord.get(impact.completedRecordId) ?? [];
    recordImpacts.push(impact);
    impactsByRecord.set(impact.completedRecordId, recordImpacts);
  }
  return completedRecords.map((record) => {
    const recordImpacts = impactsByRecord.get(record.id) ?? [];
    if (recordImpacts.length === 0) return { ...record, conflictState: undefined };
    return {
      ...record,
      conflictState: {
        conflictingPlanIds: uniqueStrings(recordImpacts.map((impact) => impact.planId)),
        conflictingRowIndexes: uniqueNumbers(recordImpacts.flatMap((impact) => impact.conflictingCompletedRowIndexes)),
      },
    };
  });
}

function impactFromPairs(impact: CompletedPlanConflictImpact, conflictPairs: CompletedPlanConflictPair[]): CompletedPlanConflictImpact {
  return {
    ...impact,
    conflictPairs,
    conflictingRowIndexes: uniqueNumbers(conflictPairs.map((pair) => pair.planRowIndex)),
    conflictingCompletedRowIndexes: uniqueNumbers(conflictPairs.map((pair) => pair.completedRowIndex)),
    reason: conflictPairs[0]?.reason ?? impact.reason,
  };
}

function conflictPairKey(impact: CompletedPlanConflictImpact, pair: CompletedPlanConflictPair): string {
  return `${impact.planId}\u0000${impact.completedRecordId}\u0000${pair.planRowIndex}\u0000${pair.completedRowIndex}`;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isWithinCalendarMonths(leftDate: string, rightDate: string, months: number): boolean {
  const left = Date.parse(`${leftDate}T00:00:00Z`);
  const right = Date.parse(`${rightDate}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return right >= addMonthsUtc(left, -months) && right <= addMonthsUtc(left, months);
}

function addMonthsUtc(value: number, months: number): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}
''')

replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''    const currentIds = new Set(currentImpact.map((impact) => impact.planId));
    const newlyImpacted = proposedImpact.filter((impact) => !currentIds.has(impact.planId));''',
    '''    const currentConflictKeys = new Set(currentImpact.map(historyConflictKey));
    const newlyImpacted = proposedImpact.filter((impact) => !currentConflictKeys.has(historyConflictKey(impact)));''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''      return success(await this.completedServiceRecords.update(input.recordId, normalized.serviceContext, proposed.set, newlyImpacted.map((impact) => impact.planId)));''',
    '''      return success(await this.completedServiceRecords.update(input.recordId, normalized.serviceContext, proposed.set, [...new Set(newlyImpacted.map((impact) => impact.planId))]));''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''          conflictingCompletedRecordIds: [...new Set(conflicts.map((conflict) => conflict.completedRecordId))],
        },''',
    '''          conflictingCompletedRecordIds: [...new Set(conflicts.map((conflict) => conflict.completedRecordId))],
          conflictingRowIndexes: [...new Set(conflicts.map((conflict) => conflict.planRowIndex))].sort((left, right) => left - right),
        },''',
)
regex_once(
    "src/application/planning-lifecycle/service.ts",
    r'''  private async findHistoryConflictsForPlan\(plan: PersistedPlanningSet, completedOverride\?: CompletedServiceRecord\[\]\): Promise<HistoryConflict\[\]> \{.*?\n  \}\n\n  private async validateFinalPeople''',
    '''  private async findHistoryConflictsForPlan(plan: PersistedPlanningSet, completedOverride?: CompletedServiceRecord[]): Promise<HistoryConflict[]> {
    if (!this.referenceMelodyClasses) return [];
    const completed = completedOverride ?? await this.completedServiceRecords.list();
    if (completed.length === 0) return [];
    const months = Math.max(0, Math.floor(await this.melodyNonRepetitionMonths()));
    const planSongIds = plan.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : []);
    const completedSongIds = completed.flatMap((record) => record.set.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : []));
    const allIds = [...new Set([...planSongIds, ...completedSongIds])];
    const memberships = await this.referenceMelodyClasses.getClassMemberships(allIds);
    const classBySong = new Map(memberships.map((membership) => [membership.songId, membership.melodyClassId]));
    const classOf = (songId: string) => classBySong.get(songId) ?? `reference-singleton:${songId}`;
    const conflicts: HistoryConflict[] = [];
    for (const record of completed) {
      if (!isWithinCalendarMonths(plan.serviceContext.serviceDate, record.serviceContext.serviceDate, months)) continue;
      for (const [planRowIndex, planRow] of plan.rows.entries()) {
        if (!planRow.song?.songId) continue;
        for (const [completedRowIndex, historicalRow] of record.set.rows.entries()) {
          if (!historicalRow.song?.songId || classOf(planRow.song.songId) !== classOf(historicalRow.song.songId)) continue;
          conflicts.push({
            planId: plan.id,
            planStatus: plan.status,
            completedRecordId: record.id,
            planRowIndex,
            completedRowIndex,
            reason: `${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}: song ${planRow.song.number} conflicts with Completed ${record.serviceContext.serviceDate} ${record.serviceContext.serviceTime}, song ${historicalRow.song.number}, within the ${months}-month melody non-repetition period.`,
          });
        }
      }
    }
    return conflicts;
  }

  private async validateFinalPeople''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''type HistoryConflict = { planId: PlanningSetId; planStatus: "working" | "final"; completedRecordId: string; reason: string };''',
    '''type HistoryConflict = { planId: PlanningSetId; planStatus: "working" | "final"; completedRecordId: string; planRowIndex: number; completedRowIndex: number; reason: string };

function historyConflictKey(conflict: HistoryConflict): string {
  return `${conflict.planId}\u0000${conflict.completedRecordId}\u0000${conflict.planRowIndex}\u0000${conflict.completedRowIndex}`;
}''',
)

replace_once(
    "app/api/planning-lifecycle/route.ts",
    '''  type PersistedPlanningSet,
''',
    '''  type CompletedServiceRecord,
  type PersistedPlanningSet,
''',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '''import { enrichRevisionRowIndexes, previewCompletedPlanInvalidation } from "../../../src/application/completed-plan-conflict-preview";''',
    '''import { enrichCompletedConflictStates, enrichPlanningConflictStates, enrichRevisionRowIndexes, previewCompletedPlanInvalidation } from "../../../src/application/completed-plan-conflict-preview";''',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '''      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const activeSets = await enrichRevisionRowIndexes({
        plans: snapshot.activeSets,
        completedRecords: snapshot.completedRecords,
        melodyClasses,
        months: melodyWindow.success ? melodyWindow.value.months : 2,
      });
      const rawDefaults = getDraftPeopleDefaults(snapshot.completedRecords);''',
    '''      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const conflictState = await enrichPlanningConflictStates({
        plans: snapshot.activeSets,
        completedRecords: snapshot.completedRecords,
        melodyClasses,
        months: melodyWindow.success ? melodyWindow.value.months : 2,
      });
      const rawDefaults = getDraftPeopleDefaults(snapshot.completedRecords);''',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '''          activeSets,
          completedRecords: snapshot.completedRecords,''',
    '''          activeSets: conflictState.plans,
          completedRecords: conflictState.completedRecords,''',
)
regex_once(
    "app/api/planning-lifecycle/route.ts",
    r'''      if \(action === "listPlanningSets" && result\.success\) \{.*?\n      \}\n      return NextResponse\.json\(result\);''',
    '''      if (result.success) {
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
      return NextResponse.json(result);''',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '''    if (action === "loadCompletedRecord") {
      const recordId = isObjectWithRecordId(body.input) ? body.input.recordId : undefined;
      if (!recordId) return invalidInput("recordId is required.");
      const record = await new DrizzleCompletedServiceRecordRepository(adapterDependencies).findById(recordId);
      return NextResponse.json(record ? { success: true, value: record } : { success: false, error: { code: "notFound", message: "Completed record was not found." } });
    }''',
    '''    if (action === "loadCompletedRecord") {
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
    }''',
)

replace_once(
    "app/planning-lifecycle-client.tsx",
    '''  const conflictingRevisionRowIndexes = useMemo(() => new Set(persistedSet?.needsRevision?.conflictingRowIndexes ?? []), [persistedSet?.id, persistedSet?.needsRevision]);
  const completedRecordsNewestFirst = useMemo(() => [...completedRecords].sort((left, right) => {''',
    '''  const conflictingRevisionRowIndexes = useMemo(() => new Set(persistedSet?.needsRevision?.conflictingRowIndexes ?? []), [persistedSet?.id, persistedSet?.needsRevision]);
  const completedConflictImpacts = completedInvalidationPreview?.impactedPlans ?? [];
  const completedConflictPlanCount = completedInvalidationPreview
    ? new Set(completedConflictImpacts.map((impact) => impact.planId)).size
    : new Set(completedRecord?.conflictState?.conflictingPlanIds ?? []).size;
  const completedConflictRowIndexes = useMemo(() => new Set(
    completedInvalidationPreview
      ? completedConflictImpacts.flatMap((impact) => impact.conflictingCompletedRowIndexes)
      : completedRecord?.conflictState?.conflictingRowIndexes ?? [],
  ), [completedInvalidationPreview, completedRecord?.id, completedRecord?.conflictState]);
  const historyConflictCount = completedRecords.filter((record) => record.conflictState).length;
  const completedRecordsNewestFirst = useMemo(() => [...completedRecords].sort((left, right) => {''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''              const revisionConflict = Boolean(persistedSet?.needsRevision && conflictingRevisionRowIndexes.has(index));''',
    '''              const revisionConflict = Boolean((persistedSet?.needsRevision && conflictingRevisionRowIndexes.has(index)) || (completedRecord && completedConflictRowIndexes.has(index)));''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''            <h2>Completed history</h2>
            {completedRecordsNewestFirst.length === 0 ?''',
    '''            <h2>Completed history</h2>
            {historyConflictCount > 0 && <p className="error-summary" role="alert">{historyConflictCount} completed service{historyConflictCount === 1 ? "" : "s"} conflict{historyConflictCount === 1 ? "s" : ""} with active plans.</p>}
            {completedRecordsNewestFirst.length === 0 ?''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''<button type="button" onClick={() => loadCompletedRecord(record.id)}>{formatCompletedRecordSummary(record)}</button>''',
    '''<button type="button" className={record.conflictState ? "needs-revision-record" : undefined} onClick={() => loadCompletedRecord(record.id)}>{formatCompletedRecordSummary(record)}</button>''',
)
regex_once(
    "app/planning-lifecycle-client.tsx",
    r'''          \{isCompletedRecordOpen && completedInvalidationPreview && completedInvalidationPreview\.newlyImpactedPlans\.length > 0 && \(\n            <p className="error-summary completed-invalidation-warning" role="alert">\n              Historical correction conflicts with \{completedInvalidationPreview\.newlyImpactedPlans\.length\} active plan\{completedInvalidationPreview\.newlyImpactedPlans\.length === 1 \? "" : "s"\}: \{completedInvalidationPreview\.newlyImpactedPlans\.map\(\(impact\) => formatConflictPreviewPlanLabel\(impact, savedDbSets\)\)\.join\(", "\)\}\.\n            </p>\n          \)\}''',
    '''          {isCompletedRecordOpen && completedConflictPlanCount > 0 && (
            <p className="error-summary completed-invalidation-warning" role="alert">
              Historical correction conflicts with {completedConflictPlanCount} active plan{completedConflictPlanCount === 1 ? "" : "s"}{completedConflictImpacts.length > 0 ? `: ${completedConflictImpacts.map((impact) => formatConflictPreviewPlanLabel(impact, savedDbSets)).join(", ")}` : ""}.{completedInvalidationPreview && completedInvalidationPreview.newlyImpactedPlans.length > 0 ? " New conflict added." : ""}
            </p>
          )}''',
)

replace_once(
    "app/globals.css",
    '''.saved-set-list button.needs-revision-record {
  border-color: var(--danger);
}''',
    '''.saved-set-list button.needs-revision-record {
  background: #fef3f2;
  border-color: var(--danger);
  outline: 3px solid var(--danger);
  outline-offset: -3px;
}''',
)
replace_once(
    "app/globals.css",
    '''.needs-revision-row {
  border: 2px solid var(--danger);
}''',
    '''.needs-revision-row {
  background: #fef3f2;
  border-color: var(--danger);
  outline: 3px solid var(--danger);
  outline-offset: -3px;
}''',
)

# Keep the older Issue #224 gate aligned with the intentionally unified 3px alarm geometry.
replace_once(
    "scripts/issue-224-tests.ts",
    '''assert.match(cssSource, /\\.needs-revision-row\\s*\\{[\\s\\S]*?border:\\s*2px solid var\\(--danger\\)/);''',
    '''assert.match(cssSource, /\\.needs-revision-row\\s*\\{[\\s\\S]*?outline:\\s*3px solid var\\(--danger\\)/);''',
)

print("Issue 230 guarded patch applied.")
