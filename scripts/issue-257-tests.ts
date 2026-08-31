import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldRecordPlanningAudit } from "../src/application/planning-change-attribution";

const context = {
  serviceDate: "2026-08-30",
  serviceTime: "10:00",
  language: "czech",
  priest: { id: "p1", displayName: "Priest One" },
  organist: { id: "o1", displayName: "Organist One" },
  note: "",
};

const rows = [
  { song: { number: "345", language: "czech" } },
  { song: { number: "21", language: "czech" }, note: "row note" },
];

const workingBefore = { id: "9", status: "working", language: "czech", serviceContext: context, rows };
const workingSame = JSON.parse(JSON.stringify(workingBefore));
const workingChanged = {
  ...workingSame,
  serviceContext: { ...workingSame.serviceContext, note: "real change" },
};

assert.equal(
  shouldRecordPlanningAudit("saveWorkingSet", workingBefore, workingSame),
  false,
  "no-op Working Save must not create an audit event",
);
assert.equal(
  shouldRecordPlanningAudit("saveWorkingSet", workingBefore, workingChanged),
  true,
  "real Working Save change must create an audit event",
);

const completedBefore = {
  id: "20",
  sourceFinalSetId: "9",
  serviceContext: context,
  set: { status: "final", language: "czech", rows },
};
const completedSame = JSON.parse(JSON.stringify(completedBefore));
const completedChanged = {
  ...completedSame,
  set: {
    ...completedSame.set,
    rows: [
      completedSame.set.rows[0],
      { ...completedSame.set.rows[1], note: "changed row note" },
    ],
  },
};

assert.equal(
  shouldRecordPlanningAudit("updateCompletedRecord", completedBefore, completedSame),
  false,
  "no-op Completed update must not create an audit event",
);
assert.equal(
  shouldRecordPlanningAudit("updateCompletedRecord", completedBefore, completedChanged),
  true,
  "real Completed correction must create an audit event",
);

for (const action of ["finalizeWorkingSet", "reopenFinalSet", "completeFinalSet", "deletePlanningSet", "deleteCompletedRecord"]) {
  assert.equal(
    shouldRecordPlanningAudit(action, workingBefore, workingSame),
    true,
    `${action} must remain auditable as a lifecycle/create/delete action`,
  );
}

const page = readFileSync("app/admin/audit-history/page.tsx", "utf8");
const css = readFileSync("app/audit-history.css", "utf8");

assert.ok(
  page.indexOf('<AuditStateLine label="after"') < page.indexOf('<AuditStateLine label="before"'),
  "after must render above before",
);
assert.match(
  page,
  /pickFields\(fields, \["dateTime", "antiphon", "topic", "note", "language"\]\)/,
  "primary left field order must be date/time, antiphon, topic, note, language",
);
assert.match(
  page,
  /pickFields\(fields, \["priest", "organist"\]\)/,
  "priest and organist must form the right-aligned primary group",
);
assert.match(
  css,
  /\.audit-service-primary,\s*\.audit-service-secondary\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/,
  "primary and secondary rows must share the same left/right grid",
);
assert.match(
  css,
  /\.audit-service-primary-right\s*\{[\s\S]*justify-self:\s*end/,
  "organist group must end at the right edge of the service field",
);
assert.match(
  css,
  /\.audit-lifecycle-slot\s*\{[\s\S]*justify-self:\s*end/,
  "lifecycle must end at the same right edge as the organist group",
);

console.log("Issue 257 Audit History ordering/no-op acceptance passed.");
