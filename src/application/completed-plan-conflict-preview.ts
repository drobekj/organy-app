import type { CompletedServiceRecord, PersistedPlanningSet, PlanningSetId } from "./planning-lifecycle";
import type { ReferenceMelodyClassProvider } from "./reference-melody-class-provider";

export type CompletedPlanConflictImpact = {
  planId: PlanningSetId;
  planStatus: "working" | "final";
  completedRecordId: string;
  conflictingRowIndexes: number[];
  reason: string;
};

export type CompletedPlanInvalidationPreview = {
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
  const currentlyImpactedPlanIds = new Set(currentImpacts.map((impact) => impact.planId));
  return {
    newlyImpactedPlans: proposedImpacts.filter((impact) => !currentlyImpactedPlanIds.has(impact.planId)),
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
  const impactsByPlan = new Map<PlanningSetId, CompletedPlanConflictImpact[]>();
  for (const impact of impacts) {
    const planImpacts = impactsByPlan.get(impact.planId) ?? [];
    planImpacts.push(impact);
    impactsByPlan.set(impact.planId, planImpacts);
  }

  return input.plans.map((plan) => {
    const planImpacts = impactsByPlan.get(plan.id) ?? [];
    if (planImpacts.length === 0) return { ...plan, needsRevision: undefined };
    const conflictingRowIndexes = [...new Set(planImpacts.flatMap((impact) => impact.conflictingRowIndexes))].sort((left, right) => left - right);
    return {
      ...plan,
      needsRevision: {
        reason: `Needs revision: ${planImpacts.map((impact) => impact.reason).join(" ")}`,
        conflictingCompletedRecordIds: [...new Set(planImpacts.map((impact) => impact.completedRecordId))],
        conflictingRowIndexes,
      },
    };
  });
}

async function findCompletedPlanConflicts(
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
      const conflictingRowIndexes = new Set<number>();
      let firstPair: { planNumber: string; historicalNumber: string } | undefined;
      plan.rows.forEach((planRow, planRowIndex) => {
        if (!planRow.song?.songId) return;
        for (const historicalRow of record.set.rows) {
          if (!historicalRow.song?.songId || melodyClassOf(planRow.song.songId) !== melodyClassOf(historicalRow.song.songId)) continue;
          conflictingRowIndexes.add(planRowIndex);
          firstPair ??= { planNumber: planRow.song.number, historicalNumber: historicalRow.song.number };
          break;
        }
      });
      if (conflictingRowIndexes.size === 0 || !firstPair) continue;
      impacts.push({
        planId: plan.id,
        planStatus: plan.status,
        completedRecordId: record.id,
        conflictingRowIndexes: [...conflictingRowIndexes].sort((left, right) => left - right),
        reason: `${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}: song ${firstPair.planNumber} conflicts with Completed ${record.serviceContext.serviceDate} ${record.serviceContext.serviceTime}, song ${firstPair.historicalNumber}, within the ${months}-month melody non-repetition period.`,
      });
    }
  }

  return impacts;
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
