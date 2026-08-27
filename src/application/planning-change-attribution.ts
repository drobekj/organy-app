import type { AuditEventRecord } from "./audit-history";
import type { CompletedServiceRecord, PersistedPlanningSet } from "./planning-lifecycle";

type PlanningAttributionInput = {
  activeSets: PersistedPlanningSet[];
  completedRecords: CompletedServiceRecord[];
  events: AuditEventRecord[];
};

type BusinessState = {
  serviceContext: unknown;
  language: unknown;
  rows: unknown[];
};

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(value: string) {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    this.add(value);
    const parent = this.parent.get(value)!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }
}

export function attributePlanningLastEditors(input: PlanningAttributionInput) {
  const unionFind = new UnionFind();

  for (const set of input.activeSets) unionFind.add(entityKey("planningSet", set.id));
  for (const record of input.completedRecords) unionFind.add(entityKey("completedService", record.id));

  for (const event of input.events) connectEventLineage(unionFind, event);

  const lastChangedByRoot = new Map<string, string>();
  const orderedEvents = [...input.events].sort((left, right) =>
    left.occurredAt.getTime() - right.occurredAt.getTime() || left.id - right.id,
  );

  for (const event of orderedEvents) {
    if (event.actorKind !== "human" || !event.actorDisplayName?.trim()) continue;
    if (!businessContentChanged(event.beforeState, event.afterState)) continue;

    const key = auditObjectKey(event);
    if (!key) continue;
    lastChangedByRoot.set(unionFind.find(key), event.actorDisplayName.trim());
  }

  return {
    activeSets: input.activeSets.map((set) => {
      const lastChangedBy = lastChangedByRoot.get(unionFind.find(entityKey("planningSet", set.id)));
      return lastChangedBy ? { ...set, lastChangedBy } : { ...set };
    }),
    completedRecords: input.completedRecords.map((record) => {
      const lastChangedBy = lastChangedByRoot.get(unionFind.find(entityKey("completedService", record.id)));
      return lastChangedBy ? { ...record, lastChangedBy } : { ...record };
    }),
  };
}

export function businessContentChanged(beforeState: unknown, afterState: unknown): boolean {
  const before = extractBusinessState(beforeState);
  const after = extractBusinessState(afterState);
  if (!before && !after) return false;
  if (!before || !after) return true;
  return stableStringify(before) !== stableStringify(after);
}

export function shouldRecordPlanningAudit(action: string, beforeState: unknown, afterState: unknown): boolean {
  if (action === "saveWorkingSet" || action === "updateCompletedRecord") {
    return businessContentChanged(beforeState, afterState);
  }
  return true;
}

function connectEventLineage(unionFind: UnionFind, event: AuditEventRecord) {
  const objectKey = auditObjectKey(event);
  if (!objectKey) return;
  unionFind.add(objectKey);

  if (event.objectKind === "planningSet") {
    for (const id of [readString(event.beforeState, "id"), readString(event.afterState, "id")]) {
      if (id) unionFind.union(objectKey, entityKey("planningSet", id));
    }
    return;
  }

  if (event.objectKind !== "completedService") return;

  if (event.action === "planning.final.complete" || event.action === "planning.final.autoComplete") {
    const sourceFinalSetId =
      readString(event.beforeState, "sourceFinalSetId")
      ?? readString(event.beforeState, "id")
      ?? readString(event.afterState, "sourceFinalSetId");
    if (sourceFinalSetId) unionFind.union(objectKey, entityKey("planningSet", sourceFinalSetId));
    const completedId = readString(event.afterState, "id");
    if (completedId) unionFind.union(objectKey, entityKey("completedService", completedId));
    return;
  }

  if (event.action.startsWith("planning.completed.")) {
    for (const id of [readString(event.beforeState, "id"), readString(event.afterState, "id")]) {
      if (id) unionFind.union(objectKey, entityKey("completedService", id));
    }
  }
}

function auditObjectKey(event: AuditEventRecord): string | undefined {
  if (event.objectKind !== "planningSet" && event.objectKind !== "completedService") return undefined;
  return entityKey(event.objectKind, event.objectRef);
}

function entityKey(kind: "planningSet" | "completedService", id: string): string {
  return `${kind}:${id}`;
}

function extractBusinessState(value: unknown): BusinessState | undefined {
  if (!isRecord(value) || !isRecord(value.serviceContext)) return undefined;

  const nestedSet = isRecord(value.set) ? value.set : undefined;
  const rows = Array.isArray(value.rows) ? value.rows : nestedSet && Array.isArray(nestedSet.rows) ? nestedSet.rows : undefined;
  if (!rows) return undefined;

  const language =
    typeof value.language === "string"
      ? value.language
      : nestedSet && typeof nestedSet.language === "string"
        ? nestedSet.language
        : value.serviceContext.language;

  return {
    serviceContext: value.serviceContext,
    language,
    rows,
  };
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === "string" && candidate ? candidate : undefined;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
