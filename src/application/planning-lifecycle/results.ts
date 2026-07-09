import type { PlanningValidationIssue } from "../../planning-lifecycle";

export type PlanningServiceErrorCode =
  | "notFound"
  | "permissionDenied"
  | "invalidInput"
  | "invalidStatus";

export type PlanningServiceError = {
  code: PlanningServiceErrorCode;
  message: string;
  issues?: PlanningValidationIssue[];
};

export type PlanningServiceResult<T> =
  | { success: true; value: T }
  | { success: false; error: PlanningServiceError };

export function success<T>(value: T): PlanningServiceResult<T> {
  return { success: true, value };
}

export function failure<T = never>(error: PlanningServiceError): PlanningServiceResult<T> {
  return { success: false, error };
}
