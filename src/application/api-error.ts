import type { PlanningServiceError } from "./planning-lifecycle";

/** Preserves structured server errors instead of guessing a code from HTTP status. */
export function apiFailure(payload: unknown, fallback: string): { success: false; error: PlanningServiceError } {
  const error = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "object" && payload.error !== null
    ? payload.error as { code?: unknown; message?: unknown }
    : undefined;
  const code = error?.code === "permissionDenied" || error?.code === "notFound" ? error.code : "invalidInput";
  return { success: false, error: { code, message: typeof error?.message === "string" ? error.message : fallback } };
}
