import type { PlanningRole, ServiceSet } from "./model";

export const canCreateOrEditWorkingSet = (role: PlanningRole): boolean =>
  role === "priest" || role === "organist" || role === "admin";

export const canFinalizeServiceSet = (role: PlanningRole): boolean =>
  role === "priest" || role === "admin";

export const canDeleteNonCompletedServiceSet = (role: PlanningRole): boolean =>
  role === "priest" || role === "organist" || role === "admin";

export const canConvertFinalSetToCompletedService = (role: PlanningRole): boolean =>
  role === "priest" || role === "admin";

export const assertCanConvertFinalSetToCompletedService = (
  role: PlanningRole,
  serviceSet: ServiceSet,
): void => {
  if (serviceSet.status !== "final") {
    throw new Error("Only a final service set can be converted to a completed service.");
  }

  if (!canConvertFinalSetToCompletedService(role)) {
    throw new Error("Only priest and admin roles can convert a final service set to a completed service.");
  }
};
