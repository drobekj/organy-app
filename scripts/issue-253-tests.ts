import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AuditEventRecord } from "../src/application/audit-history";
import { presentAuditEvent, type AuditServiceFieldKey, type AuditStatePresentation } from "../src/application/audit-history-view";

function event(
  action: string,
  objectRef: string,
  beforeState: unknown,
  afterState: unknown,
  actorKind: "human" | "system" = "human",
): AuditEventRecord {
  return {
    id: 1,
    occurredAt: new Date("2026-08-27T11:42:00.000Z"),
    actorKind,
    actorUserId: actorKind === "human" ? "user-1" : null,
    actorDisplayName: actorKind === "human" ? "Jaroslav Drobek" : null,
    actorRole: actorKind === "human" ? "admin" : null,
    actorPersonId: null,
    action,
    objectKind: action.startsWith("planning.completed.") || action.includes("complete") ? "completedService" : "planningSet",
    objectRef,
    beforeState,
    afterState,
  };
}

function serviceField(state: AuditStatePresentation, key: AuditServiceFieldKey) {
  assert.equal(state.kind, "service", `${key} requires service state`);
  const field = state.fields.find((candidate) => candidate.key === key);
  assert.ok(field, `missing field ${key}`);
  return field;
}

const contextBefore = {
  serviceDate: "2026-08-30",
  serviceTime: "10:00",
  language: "czech",
  priest: { id: "p-1", displayName: "Priest One" },
  organist: { id: "o-1", displayName: "Organist One" },
  referenceTopic: { id: "topic-1", title: "Topic one" },
  note: "service note",
};

const contextAfter = {
  serviceDate: "2026-08-31",
  serviceTime: "10:00",
  language: "polish",
  priest: { id: "p-2", displayName: "Priest Two" },
  organist: { id: "o-1", displayName: "Organist One" },
  referenceAntiphon: { id: "antiphon-1", displayNumber: "1", title: "Antiphon one" },
  referenceTopic: { id: "topic-2", title: "Topic two" },
  note: "changed service note",
};

const rowsBefore = [
  { song: { number: "345", language: "czech" } },
  { song: { number: "21", language: "czech" }, note: "row note" },
  { song: { number: "751", language: "czech" } },
];
const rowsAfter = [
  { song: { number: "345", language: "czech" } },
  { song: { number: "21", language: "czech" }, note: "changed row note" },
  { song: { number: "751", language: "czech" } },
];

const beforePlan = { id: "206", status: "working", language: "czech", serviceContext: contextBefore, rows: rowsBefore };
const afterPlan = { id: "206", status: "final", language: "polish", serviceContext: contextAfter, rows: rowsAfter };
const changed = presentAuditEvent(event("planning.final.create", "206", beforePlan, afterPlan));

assert.equal(changed.objectLabel, "Object 206:");
assert.equal(changed.action, "planning.final.create");
assert.equal(changed.actorLabel, "Jaroslav Drobek");
assert.match(changed.occurredAtLabel, /27\. 8\. 2026/);

assert.equal(serviceField(changed.before, "dateTime").text, "2026-08-30 10:00");
assert.equal(serviceField(changed.before, "antiphon").tone, "muted");
assert.equal(serviceField(changed.before, "topic").tone, "normal");
assert.equal(serviceField(changed.before, "note").tone, "normal");
assert.equal(serviceField(changed.before, "rows").text, "rows 345, 21_t, 751");
assert.equal(serviceField(changed.before, "lifecycle").text, "Working Plan");

assert.equal(serviceField(changed.after, "dateTime").tone, "changed");
assert.equal(serviceField(changed.after, "language").tone, "changed");
assert.equal(serviceField(changed.after, "priest").tone, "changed");
assert.equal(serviceField(changed.after, "organist").tone, "normal");
assert.equal(serviceField(changed.after, "antiphon").tone, "normal", "empty → non-empty is represented by muted → normal, not red");
assert.equal(serviceField(changed.after, "topic").tone, "changed", "non-empty → changed non-empty Topic is red in after");
assert.equal(serviceField(changed.after, "note").tone, "changed", "non-empty → changed non-empty Note is red in after");
assert.equal(serviceField(changed.after, "rows").text, "rows 345, 21_t, 751");
assert.equal(serviceField(changed.after, "rows").tone, "changed", "row-note content change is red even when the visible _t token stays present");
assert.equal(serviceField(changed.after, "lifecycle").text, "Final Plan");
assert.equal(serviceField(changed.after, "lifecycle").tone, "changed", "lifecycle transition is red in after");

const emptyOptional = {
  serviceDate: "2026-08-30",
  serviceTime: "10:00",
  language: "czech",
  priest: { displayName: "Priest One" },
  organist: { displayName: "Organist One" },
};
const filledOptional = {
  ...emptyOptional,
  referenceAntiphon: { id: "a", displayNumber: "1", title: "A" },
  referenceTopic: { id: "t", title: "T" },
  note: "N",
};
const emptyToFilled = presentAuditEvent(event(
  "planning.working.save",
  "207",
  { id: "207", status: "working", language: "czech", serviceContext: emptyOptional, rows: rowsBefore },
  { id: "207", status: "working", language: "czech", serviceContext: filledOptional, rows: rowsBefore },
));
for (const key of ["antiphon", "topic", "note"] as const) {
  assert.equal(serviceField(emptyToFilled.before, key).tone, "muted");
  assert.equal(serviceField(emptyToFilled.after, key).tone, "normal");
  assert.equal(serviceField(emptyToFilled.after, key).text, key, "optional values are never printed");
}

const filledToEmpty = presentAuditEvent(event(
  "planning.working.save",
  "207",
  { id: "207", status: "working", language: "czech", serviceContext: filledOptional, rows: rowsBefore },
  { id: "207", status: "working", language: "czech", serviceContext: emptyOptional, rows: rowsBefore },
));
for (const key of ["antiphon", "topic", "note"] as const) {
  assert.equal(serviceField(filledToEmpty.after, key).tone, "muted");
}

const created = presentAuditEvent(event(
  "planning.working.save",
  "208",
  null,
  { id: "208", status: "working", language: "czech", serviceContext: emptyOptional, rows: rowsBefore },
));
assert.equal(created.before.kind, "empty");
assert.equal(serviceField(created.after, "lifecycle").text, "Working Plan");
assert.equal(serviceField(created.after, "lifecycle").tone, "normal", "creation has no prior lifecycle to diff against");

const completedRecord = {
  id: "209",
  sourceFinalSetId: "208",
  serviceContext: emptyOptional,
  set: { status: "final", language: "czech", rows: rowsBefore },
  completedAt: "2026-08-30T10:00:00.000Z",
};
const deleted = presentAuditEvent(event(
  "planning.completed.delete",
  "209",
  completedRecord,
  { deletedRecordId: "209" },
));
assert.equal(serviceField(deleted.before, "lifecycle").text, "Completed Service");
assert.equal(deleted.after.kind, "empty", "technical delete return object must not replace the requested blank after line");

const legacyAutoComplete = presentAuditEvent(event(
  "planning.final.autoComplete",
  "209",
  { sourceFinalSetId: "208" },
  completedRecord,
  "system",
));
assert.equal(legacyAutoComplete.actorLabel, "System");
assert.equal(serviceField(legacyAutoComplete.before, "lifecycle").text, "Final Plan", "legacy auto-complete before state is reconstructed from the completed snapshot");
assert.equal(serviceField(legacyAutoComplete.after, "lifecycle").text, "Completed Service");
assert.equal(serviceField(legacyAutoComplete.after, "lifecycle").tone, "changed");

const generic = presentAuditEvent(event(
  "account.update",
  "user-5",
  { active: true },
  { active: false },
));
assert.equal(generic.before.kind, "generic");
assert.equal(generic.after.kind, "generic");

const auditPage = readFileSync("app/admin/audit-history/page.tsx", "utf8");
const accountsPage = readFileSync("app/admin/accounts/page.tsx", "utf8");
assert.doesNotMatch(auditPage, />Administration</);
assert.doesNotMatch(accountsPage, />Administration</);
assert.match(auditPage, /label="before"/, "before line is rendered unconditionally");
assert.match(auditPage, /label="after"/, "after line is rendered unconditionally");
assert.doesNotMatch(auditPage, /After \/ delta|<details>|<pre>/, "old expandable JSON audit layout is removed");

console.log("Issue 253 compact Audit History acceptance passed.");
