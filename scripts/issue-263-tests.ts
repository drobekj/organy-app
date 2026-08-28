import assert from "node:assert/strict";
import type { AuditEventRecord } from "../src/application/audit-history";
import { presentAuditEvent, type AuditStatePresentation } from "../src/application/audit-history-view";
import { formatPlanningRowsSummary } from "../src/planning-lifecycle/row-summary";
import { formatCompletedRecordSummary, formatPlanningSetSummary } from "../src/planning-lifecycle/workspace";

const rows = [
  { song: { number: "465", language: "czech" as const } },
  { note: "text-only row" },
  { song: { number: "21", language: "czech" as const }, note: "row note" },
];

const context = {
  serviceDate: "2026-09-06",
  serviceTime: "11:00",
  language: "czech" as const,
  priest: { displayName: "Lukáš Štefek" },
  organist: { displayName: "Jaroslav Drobek" },
};

const working = {
  id: "263",
  status: "working" as const,
  language: "czech" as const,
  serviceContext: context,
  rows,
  lastChangedBy: "Jaroslav Drobek",
};

const final = {
  ...working,
  status: "final" as const,
};

const completed = {
  id: "300",
  sourceFinalSetId: final.id,
  serviceContext: context,
  set: {
    status: "final" as const,
    language: "czech" as const,
    rows,
  },
  completedAt: new Date("2026-09-06T09:00:00.000Z"),
  lastChangedBy: "Jaroslav Drobek",
};

const expectedRows = "rows: 465, t, 21+t";
assert.equal(formatPlanningRowsSummary(rows), expectedRows);

for (const plan of [working, final]) {
  const summary = formatPlanningSetSummary(plan);
  assert.equal(
    summary,
    "2026-09-06 11:00 · czech · Lukáš Štefek · Jaroslav Drobek · rows: 465, t, 21+t · changed by Jaroslav Drobek",
  );
  assert.doesNotMatch(summary, /\bpriest\b|\borganist\b/);
  assert.doesNotMatch(summary, /\b3 rows\b|\b3 row\b/);
}

const completedSummary = formatCompletedRecordSummary(completed);
assert.equal(
  completedSummary,
  "2026-09-06 11:00 · czech · Lukáš Štefek · Jaroslav Drobek · rows: 465, t, 21+t · changed by Jaroslav Drobek",
);
assert.doesNotMatch(completedSummary, /\bpriest\b|\borganist\b/);

const auditEvent: AuditEventRecord = {
  id: 263,
  occurredAt: new Date("2026-08-27T19:00:00.000Z"),
  actorKind: "human",
  actorUserId: "u-1",
  actorDisplayName: "Jaroslav Drobek",
  actorRole: "admin",
  actorPersonId: null,
  action: "planning.working.save",
  objectKind: "planningSet",
  objectRef: working.id,
  beforeState: null,
  afterState: working,
};

const audit = presentAuditEvent(auditEvent);
function auditRows(state: AuditStatePresentation): string {
  if (state.kind !== "service") throw new Error("service state expected");
  const field = state.fields.find((candidate) => candidate.key === "rows");
  if (!field) throw new Error("rows field missing");
  return field.text;
}
assert.equal(auditRows(audit.after), expectedRows, "Audit History and Plans/History must share identical row-token formatting");

console.log("Issue 263 Plans/History concrete row summary acceptance passed.");
