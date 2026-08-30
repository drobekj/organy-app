import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PersistedPlanningSet } from "../src/application/planning-lifecycle/ports";
import { buildFinalPlanWhatsAppUrl, formatFinalPlanWhatsAppMessage } from "../src/planning-lifecycle/whatsapp-finalization";

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");

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

const message = formatFinalPlanWhatsAppMessage(plan);
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

const minimalPlan: PersistedPlanningSet = {
  ...plan,
  serviceContext: {
    ...plan.serviceContext,
    note: undefined,
    referenceAntiphon: undefined,
    referenceTopic: undefined,
  },
};
const minimalMessage = formatFinalPlanWhatsAppMessage(minimalPlan);
assert.doesNotMatch(minimalMessage, /Antiphon:/);
assert.doesNotMatch(minimalMessage, /Topic:/);
assert.doesNotMatch(minimalMessage, /Note:/);

const url = buildFinalPlanWhatsAppUrl(plan);
assert.match(url, /^https:\/\/wa\.me\/\?text=/);
assert.equal(decodeURIComponent(url.split("?text=")[1] ?? ""), message);

assert.match(planning, />\s*Save working plan\s*<\/button>/);
assert.match(planning, />\s*Finalize plan\s*<\/button>/);
assert.match(planning, />\s*Delete saved plan\s*<\/button>/);
assert.match(planning, /!isCompletedRecordOpen && isFinalSetOpen && \([\s\S]*?>Edit Final Plan<\/button>[\s\S]*?>\s*Store Service\s*<\/button>[\s\S]*?>\s*Delete Saved Plan\s*<\/button>/);
assert.doesNotMatch(planning, />\s*Complete service\s*<\/button>/);
assert.doesNotMatch(planning, />\s*Reopen for editing\s*<\/button>/);
assert.doesNotMatch(planning, /type="checkbox"/);
assert.doesNotMatch(planning, /<button[^>]*>\s*Inform\s*<\/button>/);

assert.match(planning, /if \(!result\.success\) \{[\s\S]*?return;[\s\S]*?setPostFinalizePlan\(result\.value\)/, "WhatsApp offer appears only after successful finalization");
assert.match(planning, /role="dialog"[\s\S]*?>Plan finalized<[\s\S]*?Inform about the finalized plan via WhatsApp\?[\s\S]*?>\s*Open WhatsApp\s*<[\s\S]*?>Close<\/button>/);
assert.match(planning, /href=\{buildFinalPlanWhatsAppUrl\(postFinalizePlan\)\}[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/);

console.log("Issue 310 plan terminology and post-finalization WhatsApp handoff coverage passed.");
