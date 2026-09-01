import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatCompletedRecordSummary,
  formatPlanningSetSummary,
} from "../src/planning-lifecycle/workspace";
import type { CompletedServiceRecord, PersistedPlanningSet } from "../src/application/planning-lifecycle";

const context = {
  serviceDate: "2026-09-06",
  serviceTime: "10:00",
  language: "czech" as const,
  priest: { id: "priest-1", displayName: "Priest" },
  organist: { id: "organist-1", displayName: "Organist" },
};

const working: PersistedPlanningSet = {
  id: "working-1",
  status: "working",
  language: "czech",
  serviceContext: context,
  rows: [{ note: "Prelude" }],
};

const final: PersistedPlanningSet = {
  ...working,
  id: "final-1",
  status: "final",
};

const completed: CompletedServiceRecord = {
  id: "completed-1",
  sourceFinalSetId: "final-1",
  serviceContext: context,
  set: { status: "final", language: "czech", rows: [{ note: "Prelude" }] },
  completedAt: new Date("2026-09-06T12:00:00Z"),
};

for (const summary of [formatPlanningSetSummary(working), formatPlanningSetSummary(final), formatCompletedRecordSummary(completed)]) {
  assert.match(summary, /06\.09\.2026 10:00/);
  assert.doesNotMatch(summary, /2026-09-06/);
}

const defaults = readFileSync("src/planning-lifecycle/service-context-defaults.ts", "utf8");
assert.match(defaults, /return `\$\{year\}-\$\{month\}-\$\{day\}`;/, "Planning date input storage/display contract must remain ISO-backed.");

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const navStart = planning.indexOf('<nav className="workspace-nav"');
const navEnd = planning.indexOf("</nav>", navStart);
assert.ok(navStart >= 0 && navEnd > navStart);
const nav = planning.slice(navStart, navEnd);
assert.doesNotMatch(nav, />\s*(EN|CZ)\s*</, "Main navigation must not gain an EN/CZ switch.");

const guide = readFileSync("app/guide-workspace.tsx", "utf8");
assert.match(guide, /onClick=\{\(\) => selectLanguage\("en"\)\}/);
assert.match(guide, />\s*EN\s*<\/button>/);
assert.match(guide, /onClick=\{\(\) => selectLanguage\("cz"\)\}/);
assert.match(guide, />\s*CZ\s*<\/button>/);
assert.match(guide, /localStorage\.setItem\(GUIDE_LANGUAGE_STORAGE_KEY, next\)/);

const decisions = readFileSync("docs/decisions.md", "utf8");
assert.match(decisions, /DEC-2026-09-01-01/);
assert.match(decisions, /App-wide bilingual localization is frozen indefinitely/);
assert.match(decisions, /existing EN\/CZ choice remains available only inside Guide/);

console.log("Issue 388 list date and localization-boundary acceptance passed.");
