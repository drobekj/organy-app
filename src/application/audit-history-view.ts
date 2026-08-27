import type { AuditEventRecord } from "./audit-history";

export type AuditFieldTone = "normal" | "muted" | "changed";
export type AuditServiceFieldKey =
  | "dateTime"
  | "language"
  | "priest"
  | "organist"
  | "antiphon"
  | "topic"
  | "note"
  | "rows"
  | "lifecycle";

export type AuditServiceField = {
  key: AuditServiceFieldKey;
  text: string;
  tone: AuditFieldTone;
};

export type AuditStatePresentation =
  | { kind: "empty" }
  | { kind: "service"; fields: AuditServiceField[] }
  | { kind: "generic"; text: string };

export type AuditEventPresentation = {
  objectLabel: string;
  action: string;
  actorLabel: string;
  occurredAtLabel: string;
  before: AuditStatePresentation;
  after: AuditStatePresentation;
};

type LifecycleLabel = "Working Plan" | "Final Plan" | "Completed Service";

type ServiceSnapshot = {
  dateTime: string;
  dateTimeComparable: string;
  language: string;
  priest: string;
  priestComparable: string;
  organist: string;
  organistComparable: string;
  antiphonPresent: boolean;
  antiphonComparable: string;
  topicPresent: boolean;
  topicComparable: string;
  notePresent: boolean;
  noteComparable: string;
  rowsText: string;
  rowsComparable: string;
  lifecycle: LifecycleLabel;
};

export function presentAuditEvent(event: AuditEventRecord): AuditEventPresentation {
  const isPlanningEvent = event.action.startsWith("planning.");
  let beforeSnapshot = extractServiceSnapshot(event.beforeState);
  const afterSnapshot = extractServiceSnapshot(event.afterState);

  if (
    !beforeSnapshot
    && afterSnapshot
    && (event.action === "planning.final.autoComplete" || event.action === "planning.final.complete")
  ) {
    beforeSnapshot = { ...afterSnapshot, lifecycle: "Final Plan" };
  }

  return {
    objectLabel: `Object ${event.objectRef}:`,
    action: event.action,
    actorLabel: event.actorKind === "system"
      ? "System"
      : event.actorDisplayName?.trim() || event.actorUserId?.trim() || "Unknown",
    occurredAtLabel: formatPragueTimestamp(event.occurredAt),
    before: presentState(event.beforeState, beforeSnapshot, undefined, isPlanningEvent),
    after: presentState(event.afterState, afterSnapshot, beforeSnapshot, isPlanningEvent),
  };
}

function presentState(
  rawState: unknown,
  snapshot: ServiceSnapshot | undefined,
  beforeSnapshot: ServiceSnapshot | undefined,
  isPlanningEvent: boolean,
): AuditStatePresentation {
  if (snapshot) {
    return {
      kind: "service",
      fields: serviceFields(snapshot, beforeSnapshot),
    };
  }

  if (isPlanningEvent || rawState === null || rawState === undefined) {
    return { kind: "empty" };
  }

  return { kind: "generic", text: compactState(rawState) };
}

function serviceFields(snapshot: ServiceSnapshot, before: ServiceSnapshot | undefined): AuditServiceField[] {
  return [
    {
      key: "dateTime",
      text: snapshot.dateTime,
      tone: changedTone(before, snapshot.dateTimeComparable, before?.dateTimeComparable),
    },
    presenceField("antiphon", snapshot.antiphonPresent, snapshot.antiphonComparable, before?.antiphonPresent, before?.antiphonComparable),
    presenceField("topic", snapshot.topicPresent, snapshot.topicComparable, before?.topicPresent, before?.topicComparable),
    presenceField("note", snapshot.notePresent, snapshot.noteComparable, before?.notePresent, before?.noteComparable),
    {
      key: "language",
      text: snapshot.language,
      tone: changedTone(before, snapshot.language, before?.language),
    },
    {
      key: "priest",
      text: `priest ${snapshot.priest || "—"}`,
      tone: changedTone(before, snapshot.priestComparable, before?.priestComparable),
    },
    {
      key: "organist",
      text: `organist ${snapshot.organist || "—"}`,
      tone: changedTone(before, snapshot.organistComparable, before?.organistComparable),
    },
    {
      key: "rows",
      text: `rows ${snapshot.rowsText}`,
      tone: changedTone(before, snapshot.rowsComparable, before?.rowsComparable),
    },
    {
      key: "lifecycle",
      text: snapshot.lifecycle,
      tone: changedTone(before, snapshot.lifecycle, before?.lifecycle),
    },
  ];
}

function presenceField(
  key: "antiphon" | "topic" | "note",
  present: boolean,
  comparable: string,
  beforePresent: boolean | undefined,
  beforeComparable: string | undefined,
): AuditServiceField {
  if (!present) return { key, text: key, tone: "muted" };
  const changedNonEmpty = beforePresent === true && beforeComparable !== comparable;
  return { key, text: key, tone: changedNonEmpty ? "changed" : "normal" };
}

function changedTone(
  before: ServiceSnapshot | undefined,
  afterComparable: string,
  beforeComparable: string | undefined,
): AuditFieldTone {
  return before && beforeComparable !== afterComparable ? "changed" : "normal";
}

function extractServiceSnapshot(value: unknown): ServiceSnapshot | undefined {
  if (!isRecord(value) || !isRecord(value.serviceContext)) return undefined;

  const nestedSet = isRecord(value.set) ? value.set : undefined;
  const rows = Array.isArray(value.rows)
    ? value.rows
    : nestedSet && Array.isArray(nestedSet.rows)
      ? nestedSet.rows
      : undefined;
  if (!rows) return undefined;

  const context = value.serviceContext;
  const serviceDate = stringValue(context.serviceDate);
  const serviceTime = stringValue(context.serviceTime);
  const language = stringValue(context.language)
    || stringValue(value.language)
    || (nestedSet ? stringValue(nestedSet.language) : "");
  const priest = displayName(context.priest);
  const organist = displayName(context.organist);

  const antiphonValue = context.referenceAntiphon ?? context.antiphonKey ?? null;
  const topicValue = context.referenceTopic ?? null;
  const noteValue = typeof context.note === "string" ? context.note.trim() : "";
  const completed = nestedSet !== undefined && ("sourceFinalSetId" in value || "completedAt" in value);
  const rawStatus = stringValue(value.status) || (nestedSet ? stringValue(nestedSet.status) : "");

  const lifecycle: LifecycleLabel = completed
    ? "Completed Service"
    : rawStatus === "final"
      ? "Final Plan"
      : "Working Plan";

  const rowTokens = rows.map(rowToken);

  return {
    dateTime: `${serviceDate || "date missing"} ${serviceTime || "time missing"}`,
    dateTimeComparable: stableStringify([serviceDate, serviceTime]),
    language: language || "language missing",
    priest,
    priestComparable: stableStringify(context.priest ?? null),
    organist,
    organistComparable: stableStringify(context.organist ?? null),
    antiphonPresent: hasMeaningfulValue(antiphonValue),
    antiphonComparable: stableStringify(antiphonValue),
    topicPresent: hasMeaningfulValue(topicValue),
    topicComparable: stableStringify(topicValue),
    notePresent: noteValue.length > 0,
    noteComparable: noteValue,
    rowsText: rowTokens.length > 0 ? rowTokens.join(", ") : "—",
    rowsComparable: stableStringify(rows),
    lifecycle,
  };
}

function rowToken(value: unknown): string {
  if (!isRecord(value)) return "—";
  const song = isRecord(value.song) ? value.song : undefined;
  const number = song ? stringValue(song.number) : "";
  const notePresent = typeof value.note === "string" && value.note.trim().length > 0;
  return `${number || "—"}${notePresent ? "+t" : ""}`;
}

function displayName(value: unknown): string {
  if (!isRecord(value)) return "";
  return stringValue(value.displayName);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function formatPragueTimestamp(value: Date): string {
  return value.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactState(value: unknown): string {
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
