import assert from "node:assert/strict";
import type { CompletedServiceRecord, PersistedPlanningSet } from "../src/application/planning-lifecycle";
import { formatCompletedRecordSummary, formatPlanningSetSummary } from "../src/planning-lifecycle/workspace";

const serviceContext = {
  serviceDate: "2026-09-06",
  serviceTime: "11:00",
  language: "czech" as const,
  priest: { id: "p1", displayName: "Lukáš Štefek" },
  organist: { id: "o1", displayName: "Jaroslav Drobek" },
};

const rows = [
  { song: { number: "465", language: "czech" as const } },
  { note: "text only" },
  { song: { number: "21", language: "czech" as const }, note: "row note" },
  {},
];

function planning(status: "working" | "final"): PersistedPlanningSet {
  return {
    id: status === "working" ? "w1" : "f1",
    status,
    language: "czech",
    serviceContext,
    rows,
    lastChangedBy: "Jaroslav Drobek",
  };
}

for (const status of ["working", "final"] as const) {
  const summary = formatPlanningSetSummary(planning(status));
  assert.equal(
    summary,
    "2026-09-06 11:00 · czech · priest Lukáš Štefek · organist Jaroslav Drobek · rows: 465, t, 21+t, — · changed by Jaroslav Drobek",
    `${status} plan summary must show concrete ordered row tokens`,
  );
  assert.doesNotMatch(summary, /\b4 rows\b/, `${status} plan must not fall back to a row count`);
}

const completed: CompletedServiceRecord = {
  id: "c1",
  sourceFinalSetId: "f1",
  serviceContext,
  set: {
    status: "final",
    language: "czech",
    rows,
  },
  completedAt: new Date("2026-09-06T09:00:00.000Z"),
  lastChangedBy: "Jaroslav Drobek",
};

const completedSummary = formatCompletedRecordSummary(completed);
assert.equal(
  completedSummary,
  "2026-09-06 11:00 · czech · priest Lukáš Štefek · organist Jaroslav Drobek · rows: 465, t, 21+t, — · changed by Jaroslav Drobek",
  "Completed Service summary must use the same concrete ordered row tokens",
);
assert.doesNotMatch(completedSummary, /\b4 rows\b/, "Completed Service must not fall back to a row count");

console.log("Issue 265 Plans/History concrete-row summaries acceptance passed.");
