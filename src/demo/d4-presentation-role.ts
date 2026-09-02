export const DEMO_PRESENTATION_ROLES = ["admin", "priest", "organist"] as const;

export type DemoPresentationRole = (typeof DEMO_PRESENTATION_ROLES)[number];

export const DEFAULT_DEMO_PRESENTATION_ROLE: DemoPresentationRole = "priest";

export type DemoPresentationPlanningAction =
  | "createWorkingSet"
  | "editWorkingSet"
  | "deleteWorkingSet"
  | "saveFinalSet"
  | "deleteFinalSet"
  | "convertFinalSetToCompletedServiceRecord"
  | "editCompletedServiceRecord"
  | "deleteCompletedServiceRecord";

export const DEMO_PRESENTATION_ROLE_COPY: Readonly<Record<DemoPresentationRole, {
  label: string;
  summary: string;
}>> = Object.freeze({
  priest: {
    label: "Priest",
    summary: "Working plans are editable; Final lifecycle is part of the Priest view. Melody Protection cannot go below the selected Organist minimum.",
  },
  organist: {
    label: "Organist",
    summary: "Working plans are editable; Final lifecycle stays unavailable. Own Melody Protection may be adjusted locally.",
  },
  admin: {
    label: "Admin",
    summary: "Admin view includes Completed editing semantics and unrestricted temporary Melody Protection. Demo persistence still stays disabled.",
  },
});

export const DEMO_ORGANIST_MELODY_PROTECTION_MINIMUMS: Readonly<Record<string, number>> = Object.freeze({
  "demo-organist": 2,
  "demo-organist-petr": 3,
  "demo-both": 1,
});

export function demoPresentationCanPerformPlanningAction(
  role: DemoPresentationRole,
  action: DemoPresentationPlanningAction,
): boolean {
  switch (action) {
    case "createWorkingSet":
    case "editWorkingSet":
    case "deleteWorkingSet":
      return true;
    case "saveFinalSet":
    case "deleteFinalSet":
    case "convertFinalSetToCompletedServiceRecord":
      return role === "priest" || role === "admin";
    case "editCompletedServiceRecord":
    case "deleteCompletedServiceRecord":
      return role === "admin";
  }
}

export function demoPresentationCanMutatePlanningEditor(input: {
  role: DemoPresentationRole;
  isFinalSetOpen: boolean;
  isCompletedRecordOpen: boolean;
}): boolean {
  if (input.isFinalSetOpen) return false;
  if (!input.isCompletedRecordOpen) return true;
  return input.role === "admin";
}

export function demoOrganistMelodyProtectionMinimum(organistPersonId?: string): number {
  if (!organistPersonId) return 0;
  return DEMO_ORGANIST_MELODY_PROTECTION_MINIMUMS[organistPersonId] ?? 2;
}

export function demoRoleInitialMelodyProtectionMonths(
  role: DemoPresentationRole,
  organistPersonId?: string,
): number {
  if (role === "organist") return 2;
  return demoOrganistMelodyProtectionMinimum(organistPersonId);
}
