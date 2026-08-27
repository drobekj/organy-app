export function formatPlanningRowToken(value: unknown): string {
  if (!isRecord(value)) return "—";
  const song = isRecord(value.song) ? value.song : undefined;
  const number = song ? stringValue(song.number) : "";
  const notePresent = typeof value.note === "string" && value.note.trim().length > 0;
  if (!number && notePresent) return "t";
  return `${number || "—"}${notePresent ? "+t" : ""}`;
}

export function formatPlanningRowsText(rows: readonly unknown[]): string {
  const tokens = rows.map(formatPlanningRowToken);
  return tokens.length > 0 ? tokens.join(", ") : "—";
}

export function formatPlanningRowsSummary(rows: readonly unknown[]): string {
  return `rows: ${formatPlanningRowsText(rows)}`;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
