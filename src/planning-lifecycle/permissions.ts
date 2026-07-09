import type { PlanningRole } from "./model";

export type PlanningAction =
  | "createWorkingSet"
  | "editWorkingSet"
  | "deleteWorkingSet"
  | "saveFinalSet"
  | "deleteFinalSet"
  | "convertFinalSetToCompletedServiceRecord";

const workingSetRoles: readonly PlanningRole[] = ["priest", "organist", "admin"];
const finalSetRoles: readonly PlanningRole[] = ["priest", "admin"];

export function canPerformPlanningAction(role: PlanningRole, action: PlanningAction): boolean {
  switch (action) {
    case "createWorkingSet":
    case "editWorkingSet":
    case "deleteWorkingSet":
      return workingSetRoles.includes(role);
    case "saveFinalSet":
    case "deleteFinalSet":
    case "convertFinalSetToCompletedServiceRecord":
      return finalSetRoles.includes(role);
  }
}
