import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const panel = readFileSync("app/non-repetition-period-panel.tsx", "utf8");

assert.doesNotMatch(client, /Set demo 2-month window/, "legacy fixed demo period button must be removed");
assert.match(client, /selectedRole === "admin" && \([\s\S]*?<NonRepetitionPeriodPanel[\s\S]*?runtimeMode=\{runtimeMode\}[\s\S]*?actor=\{activeActor\}[\s\S]*?memoryInteractionRepository=\{interactionRepository\}[\s\S]*?memoryPlanningSets=\{repositories\.planningSets\}/, "Planning must wire the runtime-aware Melody Protection panel only for admin");
assert.match(client, /onSaved=\{\(\) => \{[\s\S]*?invalidatePrefix\("song:"\)[\s\S]*?setCandidateRefreshGeneration/, "successful Melody Protection save must invalidate and refresh Planning candidates");
assert.doesNotMatch(client, /selectedCatalogTab === "knowledge"/, "Knowledge Catalog panel must be removed");

assert.match(panel, /if \(actor\.role !== "admin"\) return null;/, "non-admin must not receive the Melody Protection control");
assert.match(panel, /<select[\s\S]*?aria-label="Melody Protection period"[\s\S]*?onChange=\{\(event\) => void save\(Number\(event\.target\.value\)\)\}/, "admin must receive an autosaving Melody Protection selector");
assert.match(panel, /Array\.from\(\{ length: 13 \}/, "selector must expose exactly 0 through 12 months");
assert.doesNotMatch(panel, />Save period<\/button>/, "separate Save period action must be removed");
assert.match(panel, /runtimeMode === "memory"[\s\S]*?memoryInteractionRepository\.getMelodyWindow\(\)/, "memory runtime must read the current in-memory period");
assert.match(panel, /callPeriodApi\("getMelodyWindow", \{\}, actor\)/, "DB runtime must read the authoritative persisted period through the interaction API");
assert.match(panel, /findNonRepetitionPlanConflicts\(buildNonRepetitionPlanMelodyUsages\(plans, classBySongId\), months\)/, "memory mutation must apply the same saved-plan conflict gate");
assert.match(panel, /role="alert"/, "validation/conflict failure must remain visible");

console.log("Phase 31.24 Melody Protection UI: PASS");
