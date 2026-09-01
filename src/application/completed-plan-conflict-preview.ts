import type { CompletedServiceRecord, PersistedPlanningSet, PlanningSetId } from "./planning-lifecycle/ports";
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
  const fallbackMonths = Math.max(0, Math.floor(monthsInput));
  const songIds = [...new Set([
    ...plans.flatMap((plan) => plan.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : [])),
    ...completedRecords.flatMap((record) => record.set.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : [])),
  ])];
  const memberships = await melodyClasses.getClassMemberships(songIds);
  const classBySong = new Map(memberships.map((membership) => [membership.songId, membership.melodyClassId]));
  const melodyClassOf = (songId: string) => classBySong.get(songId) ?? `reference-singleton:${songId}`;
  const impacts: CompletedPlanConflictImpact[] = [];

  for (const plan of plans) {
    const months = Math.max(0, Math.floor(plan.serviceContext.melodyProtectionMonths ?? fallbackMonths));
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
  return `${impact.planId} ${impact.completedRecordId} ${pair.planRowIndex} ${pair.completedRowIndex}`;
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
