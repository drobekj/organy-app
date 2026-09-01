import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const panel = readFileSync("app/non-repetition-period-panel.tsx", "utf8");

assert.doesNotMatch(client, /Set demo 2-month window/, "legacy fixed demo period button must be removed");
assert.match(client, /selectedRole === "priest" \|\| selectedRole === "organist"[\s\S]*?<NonRepetitionPeriodPanel[\s\S]*?runtimeMode=\{runtimeMode\}[\s\S]*?actor=\{activeActor\}/, "Planning must wire Melody Protection for Priest and Organist");
assert.match(client, /selectedOrganistPersonId=\{organistId\}/);
assert.match(client, /effectiveMonths=\{melodyProtectionMonths\}/);
assert.match(client, /onSaved=\{\(\) => \{[\s\S]*?invalidatePrefix\("song:"\)[\s\S]*?setCandidateRefreshGeneration/, "successful Melody Protection change must invalidate and refresh Planning candidates");
assert.doesNotMatch(client, /selectedCatalogTab === "knowledge"/, "Knowledge Catalog panel must be removed");

assert.match(panel, /if \(actor\.role !== "priest" && actor\.role !== "organist"\) return null;/, "only Priest and Organist receive the Planning Melody Protection control");
assert.match(panel, /Array\.from\(\{ length: 13 \}/, "selector must expose exactly 0 through 12 months");
assert.match(panel, /disabled=\{actor\.role === "priest" && months < minimumMonths\}/, "Priest options below Organist minimum must remain visible but disabled");
assert.match(panel, /getOwnMelodyProtection/, "Organist must read their own persisted minimum");
assert.match(panel, /setOwnMelodyProtection/, "Organist must be able to change their own persisted minimum");
assert.match(panel, /getOrganistMelodyProtection/, "Priest must read the selected Organist minimum");
assert.doesNotMatch(panel, />Save period<\/button>/, "separate Save period action must remain removed");
assert.match(panel, /role="alert"/, "load/save failure must remain visible");

console.log("Phase 31.24 Melody Protection UI evolved acceptance: PASS");
