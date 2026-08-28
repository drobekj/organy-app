export type NonRepetitionPlanStatus = "working" | "final";

export type NonRepetitionPlanMelodyUsage = {
  planId: string;
  status: NonRepetitionPlanStatus;
  serviceDate: string;
  melodyClassId: string;
};

export type NonRepetitionPlanConflict = {
  melodyClassId: string;
  left: {
    planId: string;
    status: NonRepetitionPlanStatus;
    serviceDate: string;
  };
  right: {
    planId: string;
    status: NonRepetitionPlanStatus;
    serviceDate: string;
  };
};

export type MelodyWindowValue = { months: number };

export type MelodyWindowFailure = {
  success: false;
  error: {
    code: "permissionDenied" | "invalidInput" | "conflict";
    message: string;
    conflicts?: NonRepetitionPlanConflict[];
  };
};

export type MelodyWindowResult =
  | { success: true; value: MelodyWindowValue }
  | MelodyWindowFailure;

export type NonRepetitionPlanLike = {
  id: string;
  status: NonRepetitionPlanStatus;
  serviceContext: { serviceDate: string };
  rows: { song?: { songId?: string } }[];
};

export function validateMelodyWindowMonths(months: unknown): months is number {
  return typeof months === "number" && Number.isFinite(months) && Number.isInteger(months) && months >= 0 && months <= 12;
}

export function buildNonRepetitionPlanMelodyUsages(
  plans: NonRepetitionPlanLike[],
  classBySongId: ReadonlyMap<string, string>,
): NonRepetitionPlanMelodyUsage[] {
  const usages: NonRepetitionPlanMelodyUsage[] = [];
  for (const plan of plans) {
    const classes = new Set<string>();
    for (const row of plan.rows) {
      const songId = row.song?.songId;
      const melodyClassId = songId ? classBySongId.get(songId) : undefined;
      if (melodyClassId) classes.add(melodyClassId);
    }
    for (const melodyClassId of [...classes].sort()) {
      usages.push({
        planId: plan.id,
        status: plan.status,
        serviceDate: plan.serviceContext.serviceDate,
        melodyClassId,
      });
    }
  }
  return usages.sort(compareUsage);
}

export function findNonRepetitionPlanConflicts(
  usages: NonRepetitionPlanMelodyUsage[],
  months: number,
): NonRepetitionPlanConflict[] {
  if (!validateMelodyWindowMonths(months)) return [];

  const unique = new Map<string, NonRepetitionPlanMelodyUsage>();
  for (const usage of usages) {
    if (!usage.planId || !usage.melodyClassId || !isIsoDate(usage.serviceDate)) continue;
    unique.set(`${usage.planId}\u0000${usage.melodyClassId}`, { ...usage });
  }

  const byClass = new Map<string, NonRepetitionPlanMelodyUsage[]>();
  for (const usage of unique.values()) {
    byClass.set(usage.melodyClassId, [...(byClass.get(usage.melodyClassId) ?? []), usage]);
  }

  const conflicts: NonRepetitionPlanConflict[] = [];
  for (const melodyClassId of [...byClass.keys()].sort()) {
    const classUsages = (byClass.get(melodyClassId) ?? []).sort(compareUsage);
    for (let leftIndex = 0; leftIndex < classUsages.length; leftIndex += 1) {
      const left = classUsages[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < classUsages.length; rightIndex += 1) {
        const right = classUsages[rightIndex];
        if (left.planId === right.planId) continue;
        if (!isWithinCalendarMonths(left.serviceDate, right.serviceDate, months)) continue;
        conflicts.push({
          melodyClassId,
          left: planSummary(left),
          right: planSummary(right),
        });
      }
    }
  }

  return conflicts.sort(compareConflict);
}

export function melodyWindowConflictMessage(conflicts: NonRepetitionPlanConflict[], months: number): string {
  if (conflicts.length === 0) return "Melody non-repetition period conflicts with saved planning sets.";
  const first = conflicts[0];
  const count = conflicts.length === 1 ? "1 conflict" : `${conflicts.length} conflicts`;
  return `Cannot change melody non-repetition period to ${months} calendar month${months === 1 ? "" : "s"}: ${count}. ${formatPlan(first.left)} and ${formatPlan(first.right)} share melody class ${first.melodyClassId}. Delete one or more blocking saved sets and retry.`;
}

export function isWithinCalendarMonths(leftDate: string, rightDate: string, months: number): boolean {
  if (!validateMelodyWindowMonths(months) || !isIsoDate(leftDate) || !isIsoDate(rightDate)) return false;
  const left = Date.parse(`${leftDate}T00:00:00Z`);
  const right = Date.parse(`${rightDate}T00:00:00Z`);
  return right >= addMonthsUtc(left, -months) && right <= addMonthsUtc(left, months);
}

function addMonthsUtc(value: number, months: number): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}

function planSummary(usage: NonRepetitionPlanMelodyUsage): NonRepetitionPlanConflict["left"] {
  return { planId: usage.planId, status: usage.status, serviceDate: usage.serviceDate };
}

function formatPlan(plan: NonRepetitionPlanConflict["left"]): string {
  return `${plan.status} set ${plan.planId} (${plan.serviceDate})`;
}

function compareUsage(left: NonRepetitionPlanMelodyUsage, right: NonRepetitionPlanMelodyUsage): number {
  return `${left.serviceDate}:${left.planId}:${left.status}:${left.melodyClassId}`.localeCompare(`${right.serviceDate}:${right.planId}:${right.status}:${right.melodyClassId}`);
}

function compareConflict(left: NonRepetitionPlanConflict, right: NonRepetitionPlanConflict): number {
  return `${left.left.serviceDate}:${left.left.planId}:${left.right.serviceDate}:${left.right.planId}:${left.melodyClassId}`.localeCompare(`${right.left.serviceDate}:${right.left.planId}:${right.right.serviceDate}:${right.right.planId}:${right.melodyClassId}`);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
