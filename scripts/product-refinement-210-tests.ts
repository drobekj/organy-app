import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";
import { getDraftPeopleDefaults } from "../src/planning-lifecycle/ui-session";

const data: ReferenceCandidateData = {
  melodyWindowMonths: 2,
  songs: [
    { id: "czech:1", language: "czech", canonicalNumber: 1, displayNumber: "1", title: "Without repertoire", classId: "class:1", aggregatePreferenceScore: 1, repertoire: false },
    { id: "czech:2", language: "czech", canonicalNumber: 2, displayNumber: "2", title: "In repertoire", classId: "class:2", aggregatePreferenceScore: 1, repertoire: true },
    { id: "polish:3", language: "polish", canonicalNumber: 3, displayNumber: "3", title: "Polish", classId: "class:3", aggregatePreferenceScore: 1, repertoire: false },
  ],
};

const anonymous = queryReferenceCandidatesFromData(data, {
  serviceDate: "2026-09-06",
  serviceLanguage: "czech",
  preferenceThreshold: 0,
  candidateUsages: [],
});
assert.deepEqual(anonymous.map((item) => item.songId), ["czech:1", "czech:2"], "Anonymous organist must skip repertoire filtering but keep language filtering.");

const concrete = queryReferenceCandidatesFromData(data, {
  serviceDate: "2026-09-06",
  serviceLanguage: "czech",
  organistPersonId: "organist:test",
  preferenceThreshold: 0,
  candidateUsages: [],
});
assert.deepEqual(concrete.map((item) => item.songId), ["czech:2"], "Concrete organist must keep the repertoire hard filter.");

assert.deepEqual(getDraftPeopleDefaults([]), {
  priest: { displayName: "Anonymous" },
  organist: { displayName: "Anonymous" },
});

const client = await readFile("app/planning-lifecycle-client.tsx", "utf8");
assert.ok(client.includes('>Anonymous</option>'), "Planning selectors must expose Anonymous.");
assert.ok(client.includes("Reopen for editing"), "Admin Final UI must expose Reopen for editing.");
assert.ok(client.includes("repertoire filter is not applied"), "Anonymous organist help must explain repertoire behavior.");
assert.ok(!client.includes("Select active priest</option>"), "Old empty priest placeholder must be removed.");
assert.ok(!client.includes("Select active organist</option>"), "Old empty organist placeholder must be removed.");

const service = await readFile("src/application/planning-lifecycle/service.ts", "utf8");
assert.ok(service.includes("Final service requires a concrete active priest and organist."));
assert.ok(service.includes('ref.displayName === "Anonymous"'));
assert.ok(service.includes("async reopenFinalSet"));

const onboarding = await readFile("src/application/protected-staff-onboarding.ts", "utf8");
assert.ok(onboarding.includes("resolveProtectedUser"), "Staff onboarding must be protected by server-session admin resolution.");
assert.ok(onboarding.includes("protected_account_actor_links"));

console.log("Issue 210 product refinement regression tests passed.");
