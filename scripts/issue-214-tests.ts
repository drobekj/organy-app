import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import { InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";
import { InMemoryCompletedServiceRecordRepository, InMemoryPlanningSetRepository, PlanningLifecycleService } from "../src/application/planning-lifecycle";

async function main() {
const referenceData: ReferenceCandidateData = {
  melodyWindowMonths: 2,
  songs: [
    { id: "czech:1", language: "czech", canonicalNumber: 1, displayNumber: "1", title: "One", classId: "class-a", aggregatePreferenceScore: 0, repertoire: false },
    { id: "polish:1", language: "polish", canonicalNumber: 1, displayNumber: "1", title: "Jeden", classId: "class-a", aggregatePreferenceScore: 9, repertoire: false },
    { id: "czech:2", language: "czech", canonicalNumber: 2, displayNumber: "2", title: "Two", classId: "class-b", aggregatePreferenceScore: 0, repertoire: false },
  ],
};
const historical = queryReferenceCandidatesFromData(referenceData, {
  serviceDate: "2026-08-30",
  serviceLanguage: "czech",
  organistPersonId: "nobody",
  referenceAntiphonId: "czech:800",
  preferenceThreshold: 100,
  candidateUsages: [{ songId: "czech:1", serviceDate: "2026-08-30", source: "final", planId: "future" }],
  historicalTruth: true,
});
assert(historical.some((candidate) => candidate.songId === "czech:1"));
assert(historical.some((candidate) => candidate.songId === "polish:1"), "Historical truth must not language-filter.");
assert(historical.some((candidate) => candidate.songId === "czech:2"), "Historical truth must not repertoire/preference/non-repeat-filter.");
assert.equal(historical.filter((candidate) => candidate.number === "0").length, 1, "Historical truth must expose exactly one zero option.");
assert(historical.some((candidate) => candidate.number === "0" && candidate.language === "czech"));
assert(historical.every((candidate) => candidate.availability.kind === "available" && candidate.signal === "none" && candidate.preferenceShade === "none" && !candidate.repertoire));
assert.equal(historical.filter((candidate) => candidate.number === "1").length, 2, "Melody-equivalent concrete numbers remain independently selectable.");

const memoryCandidates = new InMemoryInteractionRepository().queryCandidates(await new InMemoryCatalogRepository().listSongs(), {
  serviceDate: "2026-08-30", serviceLanguage: "polish", organistPersonId: "missing", preferenceThreshold: 999, historicalTruth: true,
});
assert(memoryCandidates.some((candidate) => candidate.language === "czech"));
assert.equal(memoryCandidates.filter((candidate) => candidate.number === "0").length, 1, "In-memory historical truth must expose exactly one zero option.");
assert(memoryCandidates.some((candidate) => candidate.number === "0" && candidate.language === "polish"));

const mixedHistorical = queryReferenceCandidatesFromData(referenceData, {
  serviceDate: "2026-08-30", serviceLanguage: "mixed", historicalTruth: true,
});
assert.equal(mixedHistorical.filter((candidate) => candidate.number === "0").length, 1, "Mixed historical truth must still expose one zero option.");
assert(mixedHistorical.some((candidate) => candidate.number === "0" && candidate.language === "czech"), "Mixed zero uses the stable Czech storage fallback without filtering concrete candidates.");

const plans = new InMemoryPlanningSetRepository();
const completed = new InMemoryCompletedServiceRecordRepository(plans);
await plans.saveFinalSet({ status: "final", language: "czech", rows: [{ song: { songId: "czech:1", language: "czech", number: "1", title: "One" } }] }, {
  serviceDate: "2026-09-01", serviceTime: "10:00", language: "czech", priest: { displayName: "Anonymous" }, organist: { displayName: "Anonymous" },
});
const historicalRecord = await completed.createFromFinalSet({ sourceFinalSetId: "legacy", set: { status: "final", language: "czech", rows: [{ song: { songId: "czech:2", language: "czech", number: "2", title: "Two" } }] }, serviceContext: {
  serviceDate: "2026-08-01", serviceTime: "10:00", language: "czech", priest: { displayName: "Anonymous" }, organist: { displayName: "Anonymous" },
}, completedAt: new Date("2026-08-01T12:00:00Z") });
const service = new PlanningLifecycleService({
  planningSets: plans,
  completedServiceRecords: completed,
  catalog: new InMemoryCatalogRepository(),
  referenceSongs: { getById: async (id) => id === "czech:1" ? { id, language: "czech", canonicalNumber: 1, displayNumber: "1", sourceId: "1", title: "One" } : id === "czech:2" ? { id, language: "czech", canonicalNumber: 2, displayNumber: "2", sourceId: "2", title: "Two" } : undefined },
  referenceMelodyClasses: { getClassMemberships: async (ids) => ids.flatMap((songId): { songId: string; melodyClassId: string }[] => songId === "czech:1" ? [{ songId, melodyClassId: "class-a" }] : songId === "czech:2" ? [{ songId, melodyClassId: "class-b" }] : []) },
  melodyNonRepetitionMonths: async () => 2,
});
const updateInput = {
  role: "admin" as const,
  recordId: historicalRecord.id,
  serviceContext: historicalRecord.serviceContext,
  set: { status: "final" as const, language: "czech" as const, rows: [
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "historical-zero:czech", language: "czech" as const, number: "0", title: "Historical zero value" } },
    {},
  ] },
};
const requiresConfirmation = await service.updateCompletedRecord(updateInput);
assert(!requiresConfirmation.success && requiresConfirmation.error.issues?.some((issue) => issue.path.startsWith("retroactivePlan.")));
const accepted = await service.updateCompletedRecord({ ...updateInput, acceptPlanInvalidation: true });
assert(accepted.success);
if (accepted.success) {
  assert.equal(accepted.value.set.rows.length, 6);
  assert.equal(accepted.value.set.rows[4].song?.number, "0");
  assert.equal(accepted.value.set.rows[4].song?.songId, undefined);
  assert.equal(accepted.value.set.rows[5].song, undefined);
}
const annotated = await service.listPlanningSets();
assert(annotated.success && annotated.value[0].status === "working" && annotated.value[0].needsRevision, "Accepted history correction must demote Final and derive Needs revision.");

const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
assert(clientSource.includes("historicalTruth: true"));
assert(clientSource.includes("Historical truth mode: no Planning filters are applied."));
assert(clientSource.includes("retroactivePlan."));
assert(clientSource.includes("needs-revision-record"));
const accountSource = readFileSync("src/application/protected-account-admin.ts", "utf8");
assert(accountSource.includes("async deleteAccount"));
assert(accountSource.includes("async deletePerson"));
assert(accountSource.includes("service_contexts where priest_id = $1 or organist_id = $1"));
assert(accountSource.includes("Sign in as another admin before deleting your own protected Account."));

console.log("Issue 214 historical truth, retroactive invalidation, and safe identity deletion: PASS");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
