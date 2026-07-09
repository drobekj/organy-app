import type { CompletedService, CompletedServiceId, PlanningRole, ServiceSet } from "./model";
import { assertCanConvertFinalSetToCompletedService } from "./permissions";
import { validateServiceSetRows } from "./validation";

export type ConvertFinalSetToCompletedServiceInput = {
  readonly role: PlanningRole;
  readonly serviceSet: ServiceSet;
  readonly completedServiceId: CompletedServiceId;
};

export const convertFinalSetToCompletedService = ({
  role,
  serviceSet,
  completedServiceId,
}: ConvertFinalSetToCompletedServiceInput): CompletedService => {
  assertCanConvertFinalSetToCompletedService(role, serviceSet);

  const validationIssues = validateServiceSetRows(serviceSet.rows);
  if (validationIssues.length > 0) {
    throw new Error("Cannot convert an invalid final service set to a completed service.");
  }

  return {
    id: completedServiceId,
    sourceServiceSetId: serviceSet.id,
    serviceContextId: serviceSet.serviceContextId,
    rows: serviceSet.rows.map((row) => ({ ...row, song: row.song === undefined ? undefined : { ...row.song } })),
    priestId: serviceSet.priestId,
    organistId: serviceSet.organistId,
  };
};

export * from "./model";
export * from "./permissions";
export * from "./validation";
