import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PersistedPlanningSet } from "../src/application/planning-lifecycle/ports";
import { formatPlanExportText } from "../src/planning-lifecycle/plan-export";

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const preview = readFileSync("app/plan-export-preview.tsx", "utf8");

const plan: PersistedPlanningSet = {
  id: "plan-test",
  status: "final",
  language: "czech",
  serviceContext: {
    serviceDate: "2026-09-06",
    serviceTime: "10:00",
    language: "czech",
    priest: { id: "priest-1", displayName: "Test Priest" },
    organist: { id: "organist-1", displayName: "Test Organist" },
    note: "Parish celebration",
    referenceAntiphon: { id: "a-1", displayNumber: "12", title: "Test antiphon" },
    referenceTopic: { id: "t-1", title: "Test topic" },
  },
  rows: [
    { song: { songId: "cz-1", language: "czech", number: "123", title: "First hymn" }, note: "Entrance" },
    { song: { songId: "cz-2", language: "czech", number: "456", title: "Second hymn" } },
  ],
};

const message = formatPlanExportText(plan);
assert.match(message, /^Final plan\n/);
assert.match(message, /Date: 2026-09-06/);
assert.match(message, /Time: 10:00/);
assert.match(message, /Language: czech/);
assert.match(message, /Priest: Test Priest/);
assert.match(message, /Organist: Test Organist/);
assert.match(message, /Antiphon: 12 Test antiphon/);
assert.match(message, /Topic: Test topic/);
assert.match(message, /Note: Parish celebration/);
assert.match(message, /1\. 123 First hymn — Entrance/);
assert.match(message, /2\. 456 Second hymn/);

const workingMessage = formatPlanExportText({ ...plan, status: "working" });
assert.match(workingMessage, /^Working plan\n/);

const minimalPlan: PersistedPlanningSet = {
  ...plan,
  serviceContext: {
    ...plan.serviceContext,
    note: undefined,
    referenceAntiphon: undefined,
    referenceTopic: undefined,
  },
};
const minimalMessage = formatPlanExportText(minimalPlan);
assert.doesNotMatch(minimalMessage, /Antiphon:/);
assert.doesNotMatch(minimalMessage, /Topic:/);
assert.doesNotMatch(minimalMessage, /Note:/);

assert.match(planning, />\s*Save working plan\s*<\/button>/);
assert.match(planning, />\s*Finalize plan\s*<\/button>/);
assert.match(planning, />\s*Delete saved plan\s*<\/button>[\s\S]*?>\s*Export preview\s*<\/button>/);
assert.match(planning, /!isCompletedRecordOpen && isFinalSetOpen && \([\s\S]*?>Edit Final Plan<\/button>[\s\S]*?>\s*Store Service\s*<\/button>[\s\S]*?>\s*Delete Saved Plan\s*<\/button>[\s\S]*?>\s*Export preview\s*<\/button>/);
assert.doesNotMatch(planning, />\s*Complete service\s*<\/button>/);
assert.doesNotMatch(planning, />\s*Reopen for editing\s*<\/button>/);

assert.match(planning, /function currentWorkingExportPlan\(\): PlanExportSource/);
assert.match(planning, /setExportPreviewPlan\(currentWorkingExportPlan\(\)\)/);
assert.match(planning, /setExportPreviewPlan\(result\.value\)/, "Export preview appears only after successful finalization result is available");
assert.match(planning, /<PlanExportPreview[\s\S]*?plan=\{exportPreviewPlan\}/);

assert.match(preview, /navigator\.clipboard\?\.writeText/);
assert.match(preview, /document\.execCommand\("copy"\)/);
assert.match(preview, /aria-label="Copy export text"/);
assert.match(preview, /event\.key === "Escape"/);
assert.match(preview, /event\.target === event\.currentTarget/);
assert.doesNotMatch(planning + preview, /WhatsApp|wa\.me|Phone Setting/);

console.log("Issue 310 evolved plan terminology and export-preview coverage passed.");
