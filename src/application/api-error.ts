import type { PlanningServiceError } from "./planning-lifecycle";

/** Preserves structured server errors instead of guessing a code from HTTP status. */
export function apiFailure(payload: unknown, fallback: string): { success: false; error: PlanningServiceError } {
  const rawError = typeof payload === "object" && payload !== null && "error" in payload ? payload.error : undefined;
  const error = typeof rawError === "object" && rawError !== null ? rawError as { code?: unknown; message?: unknown } : undefined;
  const code = error?.code === "permissionDenied" || error?.code === "notFound" ? error.code : "invalidInput";
  return { success: false, error: { code, message: typeof error?.message === "string" ? error.message : typeof rawError === "string" ? rawError : fallback } };
}
