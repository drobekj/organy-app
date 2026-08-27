import type { PlanningRow } from "./model";

export function formatPlanningRowToken(row: PlanningRow): string {
  const number = row.song?.number?.trim() ?? "";
  const notePresent = typeof row.note === "string" && row.note.trim().length > 0;
  if (!number && notePresent) return "t";
  return `${number || "—"}${notePresent ? "+t" : ""}`;
}

export function formatPlanningRowsSummary(rows: PlanningRow[]): string {
  const tokens = rows.map(formatPlanningRowToken);
  return `rows: ${tokens.length > 0 ? tokens.join(", ") : "—"}`;
}
