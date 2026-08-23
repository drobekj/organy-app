import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
} from "../src/application/planning-lifecycle";
import { getDraftPeopleDefaults } from "../src/planning-lifecycle/ui-session";
import { parseLegacyPeople, parseLegacyRows, parseLegacyServices } from "./legacy-history-parser";
import { buildLegacySongCorrections, correctedCanonicalNumber } from "./legacy-history-song-resolution";

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

const legacyFixture = [
  "INSERT [dbo].[Bohosluzby] ([Id], [Datum], [Jazyk], [KazatelId], [VarhanikId]) VALUES (11, CAST(N'2022-10-30T00:00:00.000' AS DateTime), N'ceská', NULL, 1)",
  "INSERT [dbo].[Bohosluzby] ([Id], [Datum], [Jazyk], [KazatelId], [VarhanikId]) VALUES (12, CAST(N'2022-11-06T00:00:00.000' AS DateTime), N'polská', 7, NULL)",
  "INSERT [dbo].[BohosluzbyPisne] ([Id], [BohosluzbaId], [PisenId], [Vyznam]) VALUES (1002, 11, 253, N'1.pisen')",
  "INSERT [dbo].[BohosluzbyPisne] ([Id], [BohosluzbaId], [PisenId], [Vyznam]) VALUES (1003, 11, NULL, N'2.pisen')",
  "INSERT [dbo].[Kazatele] ([Id], [Jmeno], [Prijmeni]) VALUES (7, N'Lukáš', N'Borecki')",
  "INSERT [dbo].[Varhanici] ([Id], [Jmeno], [Prijmeni]) VALUES (1, N'Jaroslav', N'Drobek')",
].join("\n");
assert.deepEqual(parseLegacyServices(legacyFixture), [
  { id: 11, date: "2022-10-30", language: "czech", organistId: 1 },
  { id: 12, date: "2022-11-06", language: "polish", priestId: 7 },
]);
assert.deepEqual(parseLegacyRows(legacyFixture), [
  { id: 1002, serviceId: 11, songNumber: 253, meaning: "1.pisen" },
  { id: 1003, serviceId: 11, meaning: "2.pisen" },
]);
assert.deepEqual(parseLegacyPeople(legacyFixture, "Kazatele"), [{ id: 7, displayName: "Lukáš Borecki" }]);
assert.deepEqual(parseLegacyPeople(legacyFixture, "Varhanici"), [{ id: 1, displayName: "Jaroslav Drobek" }]);

const correctionReferenceKeys = new Set([
  "czech:680",
  "czech:5210", "czech:5220",
  "czech:3761", "czech:3762",
  "czech:6831", "czech:6832",
  "czech:7331", "czech:7332",
  "polish:4381", "polish:4382",
  "polish:6571", "polish:6572",
]);
const correctionServices = [
  { id: 1, date: "2026-01-01", language: "czech" as const },
  { id: 2, date: "2026-01-02", language: "polish" as const },
];
const baseOnlyResolution = buildLegacySongCorrections(correctionServices, [
  { id: 1, serviceId: 1, songNumber: 860 },
  { id: 2, serviceId: 1, songNumber: 683 },
  { id: 3, serviceId: 2, songNumber: 1039 },
], correctionReferenceKeys);
assert.equal(correctedCanonicalNumber("czech", 860, baseOnlyResolution.corrections), 680, "User-confirmed Czech 860 must map to current Czech 680.");
assert.equal(correctedCanonicalNumber("polish", 1039, baseOnlyResolution.corrections), 1039, "Polish 1039 must remain unresolved.");
assert.equal(correctedCanonicalNumber("czech", 683, baseOnlyResolution.corrections), 683, "An unsuffixed variant family must not be guessed when no concrete variant occurs elsewhere.");
const baseOnly683Evidence = baseOnlyResolution.variantEvidence.find((item) => item.language === "czech" && item.legacyNumber === 683);
assert.deepEqual(baseOnly683Evidence?.variants, [
  { canonicalNumber: 6831, occurrences: 0 },
  { canonicalNumber: 6832, occurrences: 0 },
]);
assert.equal(baseOnly683Evidence?.selectedCanonicalNumber, undefined);

const singleVariantResolution = buildLegacySongCorrections(correctionServices, [
  { id: 1, serviceId: 1, songNumber: 683 },
  { id: 2, serviceId: 1, songNumber: 6831 },
  { id: 3, serviceId: 1, songNumber: 6831 },
], correctionReferenceKeys);
assert.equal(correctedCanonicalNumber("czech", 683, singleVariantResolution.corrections), 6831, "Exactly one historically used concrete variant must backfill the old unsuffixed number.");

const ambiguousVariantResolution = buildLegacySongCorrections(correctionServices, [
  { id: 1, serviceId: 1, songNumber: 733 },
  { id: 2, serviceId: 1, songNumber: 7331 },
  { id: 3, serviceId: 1, songNumber: 7332 },
], correctionReferenceKeys);
assert.equal(correctedCanonicalNumber("czech", 733, ambiguousVariantResolution.corrections), 733, "If both variants occur historically, the unsuffixed number must remain unresolved.");

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
assert.ok(client.includes('>Anonymous</option>'), "Planning selectors must expose Anonymous.");
assert.ok(client.includes("Reopen for editing"), "Admin Final UI must expose Reopen for editing.");
assert.ok(client.includes("repertoire filter is not applied"), "Anonymous organist help must explain repertoire behavior.");
assert.ok(!client.includes("Select active priest</option>"), "Old empty priest placeholder must be removed.");
assert.ok(!client.includes("Select active organist</option>"), "Old empty organist placeholder must be removed.");

const serviceSource = readFileSync("src/application/planning-lifecycle/service.ts", "utf8");
assert.ok(serviceSource.includes("Final service requires a concrete active priest and organist."));
assert.ok(serviceSource.includes('ref.displayName === "Anonymous"'));
assert.ok(serviceSource.includes("async reopenFinalSet"));

const onboarding = readFileSync("src/application/protected-staff-onboarding.ts", "utf8");
assert.ok(onboarding.includes("resolveProtectedUser"), "Staff onboarding must be protected by server-session admin resolution.");
assert.ok(onboarding.includes("protected_account_actor_links"));

async function lifecycleBehaviorTests() {
  const createService = () => new PlanningLifecycleService({
    planningSets: new InMemoryPlanningSetRepository(),
    completedServiceRecords: new InMemoryCompletedServiceRecordRepository(),
    catalog: new InMemoryCatalogRepository(),
  });

  const anonymousService = createService();
  const anonymousWorking = await anonymousService.saveWorkingSet({
    role: "admin",
    serviceContext: {
      serviceDate: "2026-09-06",
      serviceTime: "10:00",
      language: "czech",
      priest: { displayName: "Anonymous" },
      organist: { displayName: "Anonymous" },
    },
    set: { status: "working", language: "czech", rows: [{ note: "Instrumental" }] },
  });
  assert.equal(anonymousWorking.success, true, "Anonymous must be persistable as Working.");
  if (anonymousWorking.success) {
    const blockedFinal = await anonymousService.finalizeWorkingSet({ role: "admin", workingSetId: anonymousWorking.value.id });
    assert.equal(blockedFinal.success, false, "Anonymous must not be Finalizable.");
    if (!blockedFinal.success) assert.equal(blockedFinal.error.code, "invalidInput");
  }

  const reopenService = createService();
  const working = await reopenService.saveWorkingSet({
    role: "admin",
    serviceContext: {
      serviceDate: "2026-09-13",
      serviceTime: "10:00",
      language: "czech",
      priest: { id: "demo-priest", displayName: "Demo Priest" },
      organist: { id: "demo-organist", displayName: "Demo Organist" },
    },
    set: { status: "working", language: "czech", rows: [{ note: "Instrumental" }] },
  });
  assert.equal(working.success, true);
  if (!working.success) return;
  const final = await reopenService.finalizeWorkingSet({ role: "admin", workingSetId: working.value.id });
  assert.equal(final.success, true);
  if (!final.success) return;
  const denied = await reopenService.reopenFinalSet({ role: "priest", finalSetId: final.value.id });
  assert.equal(denied.success, false, "Only admin may reopen Final.");
  const reopened = await reopenService.reopenFinalSet({ role: "admin", finalSetId: final.value.id });
  assert.equal(reopened.success, true, "Admin must be able to reopen Final.");
  if (reopened.success) {
    assert.equal(reopened.value.status, "working");
    assert.equal(reopened.value.id, final.value.id);
    assert.deepEqual(reopened.value.rows, final.value.rows, "Reopen must preserve ordered content.");
    assert.deepEqual(reopened.value.serviceContext, final.value.serviceContext, "Reopen must preserve service context.");
  }
}

lifecycleBehaviorTests()
  .then(() => console.log("Issue 210 product refinement regression tests passed."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
