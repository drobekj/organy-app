import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";
import { getDraftPeopleDefaults } from "../src/planning-lifecycle/ui-session";
import { parseLegacyPeople, parseLegacyRows, parseLegacyServices } from "./legacy-history-parser";

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
