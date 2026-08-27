import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AuditEventRecord } from "../src/application/audit-history";
import type { CompletedServiceRecord, PersistedPlanningSet } from "../src/application/planning-lifecycle";
import { attributePlanningLastEditors, businessContentChanged } from "../src/application/planning-change-attribution";
import { formatCompletedRecordSummary, formatPlanningSetSummary } from "../src/planning-lifecycle/workspace";

const serviceContext = {
  serviceDate: "2026-08-30",
  serviceTime: "10:00",
  language: "czech" as const,
  priest: { id: "p-1", displayName: "Priest One" },
  organist: { id: "o-1", displayName: "Organist One" },
};

const rowsA = [{ note: "Opening" }];
const rowsB = [{ note: "Opening changed" }];
const rowsC = [{ note: "Completed correction" }];

function plan(id: string, status: "working" | "final", rows = rowsA) {
  return { id, status, language: "czech" as const, serviceContext, rows };
}

function completed(id: string, sourceFinalSetId: string, rows = rowsB) {
  return {
    id,
    sourceFinalSetId,
    serviceContext,
    set: { status: "final" as const, language: "czech" as const, rows },
    completedAt: new Date("2026-08-30T10:00:00.000Z"),
  };
}

function event(
  id: number,
  actorDisplayName: string | null,
  action: string,
  objectKind: "planningSet" | "completedService",
  objectRef: string,
  beforeState: unknown,
  afterState: unknown,
  actorKind: "human" | "system" = "human",
): AuditEventRecord {
  return {
    id,
    occurredAt: new Date(`2026-08-27T0${id}:00:00.000Z`),
    actorKind,
    actorUserId: actorKind === "human" ? `user-${id}` : null,
    actorDisplayName,
    actorRole: actorKind === "human" ? "admin" : null,
    actorPersonId: null,
    action,
    objectKind,
    objectRef,
    beforeState,
    afterState,
  };
}

const createByAlice = event(1, "Alice", "planning.working.save", "planningSet", "10", null, plan("10", "working", rowsA));
const noOpSaveByBob = event(2, "Bob", "planning.working.save", "planningSet", "10", plan("10", "working", rowsA), plan("10", "working", rowsA));
const realSaveByCarol = event(3, "Carol", "planning.working.save", "planningSet", "10", plan("10", "working", rowsA), plan("10", "working", rowsB));
const finalizeByDave = event(4, "Dave", "planning.final.create", "planningSet", "10", plan("10", "working", rowsB), plan("10", "final", rowsB));

assert.equal(businessContentChanged(noOpSaveByBob.beforeState, noOpSaveByBob.afterState), false);
assert.equal(businessContentChanged(finalizeByDave.beforeState, finalizeByDave.afterState), false);
assert.equal(businessContentChanged(realSaveByCarol.beforeState, realSaveByCarol.afterState), true);

const finalSet: PersistedPlanningSet = plan("10", "final", rowsB);
const activeAttribution = attributePlanningLastEditors({
  activeSets: [finalSet],
  completedRecords: [],
  events: [createByAlice, noOpSaveByBob, realSaveByCarol, finalizeByDave],
});
assert.equal(activeAttribution.activeSets[0].lastChangedBy, "Carol", "no-op save or Finalize must not replace the last actual editor");

const completeByEve = event(
  5,
  "Eve",
  "planning.final.complete",
  "completedService",
  "20",
  plan("10", "final", rowsB),
  completed("20", "10", rowsB),
);
const autoComplete = event(
  6,
  null,
  "planning.final.autoComplete",
  "completedService",
  "20",
  { sourceFinalSetId: "10" },
  completed("20", "10", rowsB),
  "system",
);
const completedNoOpByFrank = event(
  7,
  "Frank",
  "planning.completed.update",
  "completedService",
  "20",
  completed("20", "10", rowsB),
  completed("20", "10", rowsB),
);
const completedCorrectionByGrace = event(
  8,
  "Grace",
  "planning.completed.update",
  "completedService",
  "20",
  completed("20", "10", rowsB),
  completed("20", "10", rowsC),
);

const historyRecord: CompletedServiceRecord = completed("20", "10", rowsC);
const historyAttribution = attributePlanningLastEditors({
  activeSets: [],
  completedRecords: [historyRecord],
  events: [createByAlice, noOpSaveByBob, realSaveByCarol, finalizeByDave, completeByEve, autoComplete, completedNoOpByFrank, completedCorrectionByGrace],
});
assert.equal(historyAttribution.completedRecords[0].lastChangedBy, "Grace", "a real Completed correction must become the last editor");

const historyBeforeCorrection = attributePlanningLastEditors({
  activeSets: [],
  completedRecords: [completed("20", "10", rowsB)],
  events: [createByAlice, noOpSaveByBob, realSaveByCarol, finalizeByDave, completeByEve, autoComplete, completedNoOpByFrank],
});
assert.equal(historyBeforeCorrection.completedRecords[0].lastChangedBy, "Carol", "Completed history must inherit the last real Planning editor across lifecycle transitions");

const planSummary = formatPlanningSetSummary({ ...finalSet, lastChangedBy: "Carol" });
assert.doesNotMatch(planSummary, /Working service|Final service/);
assert.match(planSummary, /changed by Carol/);

const historySummary = formatCompletedRecordSummary({ ...historyRecord, lastChangedBy: "Grace" });
assert.doesNotMatch(historySummary, /Completed service/);
assert.match(historySummary, /changed by Grace/);

const route = readFileSync("app/api/planning-lifecycle/route.ts", "utf8");
const auditHistory = readFileSync("src/application/audit-history.ts", "utf8");
assert.match(route, /attributePlanningLastEditors/);
assert.match(route, /listPlanningAuditEvents/);
assert.match(auditHistory, /where action like 'planning\.%'/);

console.log("Issue 251 Plans/History last-editor acceptance passed.");
