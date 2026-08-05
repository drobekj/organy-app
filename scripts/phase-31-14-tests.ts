import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { CandidateQueryInput } from "../src/application/interaction-contracts";
import {
  hydrateReferenceCandidatesFromData,
  queryReferenceCandidatesFromData,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";

const makeSong = (
  id: string,
  canonicalNumber: number,
  title: string,
  classId: string,
  aggregatePreferenceScore: number,
  repertoire: boolean,
  sourceUrl?: string,
): ReferenceCandidateSong => ({
  id,
  language: id.startsWith("polish:") ? "polish" : "czech",
  canonicalNumber,
  displayNumber: canonicalNumber === 5210 ? "52/1" : canonicalNumber === 5220 ? "52/2" : String(canonicalNumber),
  title,
  classId,
  aggregatePreferenceScore,
  repertoire,
  ...(sourceUrl ? { sourceUrl } : {}),
});

const songs: ReferenceCandidateSong[] = [
  makeSong("czech:10", 10, "Ten Czech", "class-b", 4, true, "https://scores.example/czech-10"),
  makeSong("czech:28", 28, "Twenty-eight Czech", "class-c", 0, false),
  makeSong("czech:29", 29, "Twenty-nine Czech", "class-a", 3, false, "https://scores.example/czech-29"),
  makeSong("czech:5210", 5210, "Slash One", "class-slash", 1, true, "https://scores.example/czech-52-1"),
  makeSong("czech:5220", 5220, "Slash Two", "class-slash-two", 0, true),
  makeSong("czech:421", 421, "Four hundred twenty-one Czech", "class-a", 0, false),
  makeSong("polish:38", 38, "Thirty-eight Polish", "class-a", 2, true, "https://scores.example/polish-38"),
  makeSong("polish:613", 613, "Six hundred thirteen Polish", "class-c", 2, true),
];

const data = (recommendedReferenceSongId?: string): ReferenceCandidateData => ({
  songs,
  melodyWindowMonths: 2,
  ...(recommendedReferenceSongId ? { recommendedReferenceSongId } : {}),
});

const query = (changes: Partial<CandidateQueryInput> = {}): CandidateQueryInput => ({
  serviceDate: "2026-08-09",
  serviceLanguage: "czech",
  organistPersonId: "organist-a",
  preferenceThreshold: 0,
  candidateUsages: [],
  ...changes,
});

function concreteRowsAndOrdering() {
  const czech = queryReferenceCandidatesFromData(data(), query());
  assert.deepEqual(czech.map((candidate) => candidate.songId), [
    "czech:10",
    "czech:28",
    "czech:29",
    "czech:5210",
    "czech:5220",
    "czech:421",
  ]);
  assert.deepEqual(
    czech.filter((candidate) => candidate.melodyClassId === "class-a").map((candidate) => candidate.songId),
    ["czech:29", "czech:421"],
    "one melody class was collapsed back to one primary row",
  );

  const polish = queryReferenceCandidatesFromData(data(), query({ serviceLanguage: "polish" }));
  assert.deepEqual(polish.map((candidate) => candidate.songId), ["polish:38", "polish:613"]);

  const mixed = queryReferenceCandidatesFromData(data(), query({ serviceLanguage: "mixed" }));
  assert.deepEqual(mixed.map((candidate) => candidate.songId), [
    "czech:10",
    "czech:28",
    "czech:29",
    "czech:5210",
    "czech:5220",
    "czech:421",
    "polish:38",
    "polish:613",
  ]);
}

function repertoireAndPreferences() {
  const czech = queryReferenceCandidatesFromData(data(), query());
  assert.ok(czech.some((candidate) => candidate.songId === "czech:29"), "opposite-language repertoire evidence did not unlock Czech concrete song");
  assert.ok(czech.some((candidate) => candidate.songId === "czech:421"), "second Czech member of reachable class was lost");
  assert.ok(czech.some((candidate) => candidate.songId === "czech:28"), "Polish repertoire evidence did not unlock the Czech member of class C");

  const thresholdThree = queryReferenceCandidatesFromData(data(), query({ preferenceThreshold: 3 }));
  assert.deepEqual(thresholdThree.map((candidate) => candidate.songId), ["czech:10", "czech:29"]);
  assert.equal(thresholdThree.some((candidate) => candidate.songId === "czech:421"), false, "preference score transferred within a melody class");

  const noRepertoireData: ReferenceCandidateData = {
    songs: songs.map((candidate) => ({ ...candidate, repertoire: false })),
    melodyWindowMonths: 2,
  };
  const noRepertoire = queryReferenceCandidatesFromData(noRepertoireData, query());
  assert.deepEqual(noRepertoire, []);
}

function melodyWindow() {
  const completed = queryReferenceCandidatesFromData(data(), query({
    candidateUsages: [{ songId: "polish:38", serviceDate: "2026-07-01", source: "completed" }],
  }));
  assert.equal(completed.some((candidate) => candidate.melodyClassId === "class-a"), false);

  const futureWorking = queryReferenceCandidatesFromData(data(), query({
    candidateUsages: [{ songId: "czech:28", serviceDate: "2026-09-01", source: "working", planId: "future-working" }],
  }));
  assert.equal(futureWorking.some((candidate) => candidate.melodyClassId === "class-c"), false);

  const futureFinal = queryReferenceCandidatesFromData(data(), query({
    candidateUsages: [{ songId: "czech:10", serviceDate: "2026-09-01", source: "final", planId: "future-final" }],
  }));
  assert.equal(futureFinal.some((candidate) => candidate.melodyClassId === "class-b"), false);

  const currentPlan = queryReferenceCandidatesFromData(data(), query({
    currentPlanId: "current-plan",
    candidateUsages: [{ songId: "polish:38", serviceDate: "2026-08-01", source: "working", planId: "current-plan" }],
  }));
  assert.ok(currentPlan.some((candidate) => candidate.songId === "czech:29"));
  assert.ok(currentPlan.some((candidate) => candidate.songId === "czech:421"));
}

function searchIsConcrete() {
  assert.deepEqual(
    queryReferenceCandidatesFromData(data(), query({ queryText: "29" })).map((candidate) => candidate.songId),
    ["czech:29"],
  );
  assert.deepEqual(
    queryReferenceCandidatesFromData(data(), query({ queryText: "Four hundred" })).map((candidate) => candidate.songId),
    ["czech:421"],
    "title search returned a sibling that did not itself match",
  );
  assert.deepEqual(
    queryReferenceCandidatesFromData(data(), query({ queryText: "52/1" })).map((candidate) => candidate.songId),
    ["czech:5210"],
  );
  assert.deepEqual(
    queryReferenceCandidatesFromData(data(), query({ queryText: "5210" })).map((candidate) => candidate.songId),
    ["czech:5210"],
  );
  assert.deepEqual(
    queryReferenceCandidatesFromData(data(), query({ queryText: "52/" })).map((candidate) => candidate.songId),
    ["czech:5210", "czech:5220"],
  );
}

function antiphonDoesNotReorderOrTransfer() {
  const without = queryReferenceCandidatesFromData(data(), query({ serviceLanguage: "mixed" }));
  const withRecommendation = queryReferenceCandidatesFromData(data("polish:38"), query({ serviceLanguage: "mixed", referenceAntiphonId: "czech:800" }));
  assert.deepEqual(withRecommendation.map((candidate) => candidate.songId), without.map((candidate) => candidate.songId));
  assert.equal(withRecommendation.find((candidate) => candidate.songId === "polish:38")?.signal, "antiphon");
  assert.equal(withRecommendation.find((candidate) => candidate.songId === "czech:29")?.signal, "none");
  assert.equal(withRecommendation.find((candidate) => candidate.songId === "czech:421")?.signal, "none");
}

function melodyMetadata() {
  const candidate = queryReferenceCandidatesFromData(data(), query({ queryText: "29" }))[0];
  assert.equal(candidate.melodyClassId, "class-a");
  assert.deepEqual(candidate.melodyMembers.map((member) => member.songId), ["czech:29", "polish:38", "czech:421"]);
  assert.deepEqual(candidate.melodyMembers[0], {
    songId: "czech:29",
    language: "czech",
    number: "29",
    title: "Twenty-nine Czech",
    repertoire: false,
    aggregatePreferenceScore: 3,
    sheetMusicUrl: "https://scores.example/czech-29",
  });
  assert.equal(candidate.melodyMembers.find((member) => member.songId === "polish:38")?.sheetMusicUrl, "https://scores.example/polish-38");
  assert.deepEqual(candidate.equivalentNumbers, [
    { songId: "polish:38", number: "38", repertoire: true },
    { songId: "czech:421", number: "421", repertoire: false },
  ]);
}

function hydration() {
  const hydrated = hydrateReferenceCandidatesFromData(data("czech:29"), {
    songs: [{ songId: "czech:29", language: "czech", number: "OLD-29", title: "Historical 29" }],
    organistPersonId: "organist-a",
    referenceAntiphonId: "czech:800",
  })[0];
  assert.equal(hydrated.songId, "czech:29");
  assert.equal(hydrated.number, "OLD-29");
  assert.equal(hydrated.title, "Historical 29");
  assert.equal(hydrated.signal, "antiphon");
  assert.equal(hydrated.melodyClassId, "class-a");
  assert.deepEqual(hydrated.melodyMembers.map((member) => member.songId), ["czech:29", "polish:38", "czech:421"]);

  const historical = hydrateReferenceCandidatesFromData(data(), {
    songs: [{ songId: "historical:czech:999", language: "czech", number: "999", title: "Historical only" }],
  })[0];
  assert.equal(historical.songId, "historical:czech:999");
  assert.equal(historical.number, "999");
  assert.equal(historical.title, "Historical only");
  assert.equal(historical.melodyClassId, "historical:historical:czech:999");
  assert.deepEqual(historical.melodyMembers.map((member) => member.songId), ["historical:czech:999"]);
}

async function staticScope() {
  const [service, journal, schema, client, lifecycleService] = await Promise.all([
    readFile("src/application/reference-candidate-service.ts", "utf8"),
    readFile("drizzle/meta/_journal.json", "utf8"),
    readFile("src/db/schema/index.ts", "utf8"),
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/application/planning-lifecycle/service.ts", "utf8"),
  ]);
  assert.match(service, /one concrete song|for \(const song of data\.songs\)/i);
  assert.match(service, /melodyClassId/);
  assert.match(service, /melodyMembers/);
  assert.match(service, /song\.aggregatePreferenceScore < threshold/);
  assert.doesNotMatch(service, /Math\.max\(\.\.\.visibleSongs/);
  assert.doesNotMatch(service, /visibleGroups/);
  assert.doesNotMatch(service, /signal === "antiphon" \? 0/);
  assert.doesNotMatch(journal, /phase_31_14/);
  assert.doesNotMatch(schema, /candidate_melody|phase_31_14/);
  assert.match(client, /queryCandidates/);
  assert.match(lifecycleService, /number: referenceSong\.displayNumber, title: referenceSong\.title/);
}

async function main() {
  concreteRowsAndOrdering();
  repertoireAndPreferences();
  melodyWindow();
  searchIsConcrete();
  antiphonDoesNotReorderOrTransfer();
  melodyMetadata();
  hydration();
  await staticScope();
  console.log("Phase 31.14 concrete-song authoritative Planning candidates: PASS");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.14 concrete-song authoritative Planning candidates: FAIL");
  console.error(error);
  process.exitCode = 1;
});