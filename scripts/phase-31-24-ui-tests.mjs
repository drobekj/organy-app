import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const panel = readFileSync("app/non-repetition-period-panel.tsx", "utf8");

assert.doesNotMatch(client, /Set demo 2-month window/, "legacy fixed demo period button must be removed");
assert.match(client, /<NonRepetitionPeriodPanel[\s\S]*?runtimeMode=\{runtimeMode\}[\s\S]*?actor=\{activeActor\}[\s\S]*?memoryInteractionRepository=\{interactionRepository\}[\s\S]*?memoryPlanningSets=\{repositories\.planningSets\}/, "Knowledge must wire the runtime-aware period panel to authoritative actor/config/plans");

assert.match(panel, /actor\.role === "admin" \? \([\s\S]*?aria-label="Melody non-repetition period"[\s\S]*?min=\{0\}[\s\S]*?step=\{1\}[\s\S]*?>Save period<\/button>[\s\S]*?\) : null/, "only admin must receive the explicit integer mutation control");
assert.match(panel, /Melody non-repetition: \$\{currentMonths\} calendar month/, "current runtime-authoritative period must be visibly displayed");
assert.match(panel, /runtimeMode === "memory"[\s\S]*?memoryInteractionRepository\.getMelodyWindow\(\)/, "memory runtime must read the current in-memory period");
assert.match(panel, /callPeriodApi\("getMelodyWindow", \{\}, actor\)/, "DB runtime must read the authoritative persisted period through the interaction API");
assert.match(panel, /findNonRepetitionPlanConflicts\(buildNonRepetitionPlanMelodyUsages\(plans, classBySongId\), months\)/, "memory mutation must apply the same saved-plan conflict gate");
assert.match(panel, /role="status"/, "successful save feedback must be visible");
assert.match(panel, /role="alert"/, "validation/conflict failure must be visible");

console.log("Phase 31.24 Knowledge period UI: PASS");
