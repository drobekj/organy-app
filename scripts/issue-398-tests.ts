import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveEffectiveCandidateMelodyProtectionMonths } from "../src/application/reference-candidate-service";

const panel = readFileSync("app/non-repetition-period-panel.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const route = readFileSync("app/api/interaction/route.ts", "utf8");
const candidateService = readFileSync("src/application/reference-candidate-service.ts", "utf8");

assert.equal(
  resolveEffectiveCandidateMelodyProtectionMonths(6, 0, true),
  0,
  "Admin filtering override must be allowed below the selected Organist minimum.",
);
assert.equal(
  resolveEffectiveCandidateMelodyProtectionMonths(6, 0, false),
  6,
  "Non-Admin candidate filtering must remain clamped to the selected Organist minimum.",
);
assert.equal(
  resolveEffectiveCandidateMelodyProtectionMonths(6, 9, true),
  9,
  "Admin filtering override must accept the full requested range above the minimum too.",
);

assert.match(panel, /actor\.role !== "priest" && actor\.role !== "organist" && actor\.role !== "admin"/);
assert.match(panel, /actor\.role === "admin"[\s\S]*onEffectiveChange\(months\);[\s\S]*onSaved\?\.\(months\);[\s\S]*return;/);
assert.match(panel, /Array\.from\(\{ length: 13 \}, \(_, months\) =>/);
assert.match(panel, /disabled=\{actor\.role === "priest" && months < minimumMonths\}/);
assert.doesNotMatch(panel, /actor\.role === "admin"[\s\S]{0,500}setOwnMelodyProtection/);

assert.match(planning, /adminMelodyProtectionMinimums/);
assert.match(planning, /adminMelodyProtectionOverrides/);
assert.match(planning, /adminMelodyProtectionKey = organistId \?\? "__anonymous__"/);
assert.match(planning, /candidateMelodyProtectionMonths = selectedRole === "admin"/);
assert.match(planning, /setAdminMelodyProtectionOverrides\(\(current\) => \(\{ \.\.\.current, \[adminMelodyProtectionKey\]: months \}\)\)/);
assert.match(planning, /melodyProtectionMonths: candidateMelodyProtectionMonths/);
assert.match(planning, /serviceContext: \{[\s\S]*melodyProtectionMonths,[\s\S]*set: \{/);
assert.doesNotMatch(planning, /serviceContext: \{[\s\S]{0,700}candidateMelodyProtectionMonths/);

assert.match(route, /allowBelowOrganistMinimum: actor\.role === "admin"/);
assert.match(candidateService, /policy\.allowBelowOrganistMinimum === true/);
assert.match(candidateService, /return allowBelowOrganistMinimum \? requestedMonths : Math\.max\(minimumMonths, requestedMonths\)/);

console.log("Issue 398 Admin session-only Melody Protection override acceptance passed.");
