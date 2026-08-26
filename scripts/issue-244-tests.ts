import assert from "node:assert/strict";
import {
  queryReferenceCandidatesFromData,
  resolveAnonymousMelodyRepresentativeSongId,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";
import { candidatesForView } from "../src/planning-lifecycle/candidate-view";
import type { ServiceLanguage } from "../src/planning-lifecycle/model";

const song = (
  id: string,
  canonicalNumber: number,
  title: string,
  classId: string,
  options: { repertoire?: boolean; fallbackRepertoire?: boolean } = {},
): ReferenceCandidateSong => ({
  id,
  language: id.startsWith("polish:") ? "polish" : "czech",
  canonicalNumber,
  displayNumber: String(canonicalNumber),
  title,
  classId,
  aggregatePreferenceScore: 0,
  repertoire: options.repertoire ?? false,
  fallbackRepertoire: options.fallbackRepertoire ?? false,
});

const data: ReferenceCandidateData = {
  melodyWindowMonths: 2,
  songs: [
    song("czech:20", 20, "Pure Czech twenty", "pure-czech", { fallbackRepertoire: true }),
    song("czech:10", 10, "Pure Czech ten", "pure-czech"),
    song("czech:109", 109, "Na kříži proliv krev", "mixed-109-138", { repertoire: true, fallbackRepertoire: true }),
    song("polish:138", 138, "Na krzyźum prelał krew", "mixed-109-138"),
    song("polish:17", 17, "Pure Polish seventeen", "pure-polish", { repertoire: true, fallbackRepertoire: true }),
    song("polish:7", 7, "Pure Polish seven", "pure-polish"),
  ],
};

const expectedHistoricalMelodies: Record<ServiceLanguage, string[]> = {
  czech: ["czech:10", "czech:109"],
  polish: ["polish:7", "polish:138"],
  mixed: ["czech:10", "czech:109", "polish:7"],
};

function historicalTruthMatrixCoverage() {
  for (const serviceLanguage of ["czech", "polish", "mixed"] as const) {
    const candidates = queryReferenceCandidatesFromData(data, {
      serviceDate: "2026-08-26",
      serviceLanguage,
      candidateUsages: [],
      historicalTruth: true,
    });
    assert.deepEqual(
      candidatesForView(candidates, "melodies").map((candidate) => candidate.songId),
      expectedHistoricalMelodies[serviceLanguage],
      `${serviceLanguage} Completed-set Melodies do not match the approved anonymous language matrix`,
    );
  }
}

function repertoireIndependenceAndProductionRegressionCoverage() {
  const mixed = data.songs.filter((member) => member.classId === "mixed-109-138");
  assert.equal(resolveAnonymousMelodyRepresentativeSongId(mixed, "czech"), "czech:109");
  assert.equal(resolveAnonymousMelodyRepresentativeSongId(mixed, "polish"), "polish:138");
  assert.equal(resolveAnonymousMelodyRepresentativeSongId(mixed, "mixed"), "czech:109");

  const pureCzech = data.songs.filter((member) => member.classId === "pure-czech");
  const purePolish = data.songs.filter((member) => member.classId === "pure-polish");
  assert.equal(resolveAnonymousMelodyRepresentativeSongId(pureCzech, "polish"), undefined);
  assert.equal(resolveAnonymousMelodyRepresentativeSongId(purePolish, "czech"), undefined);
  assert.equal(resolveAnonymousMelodyRepresentativeSongId(pureCzech, "mixed"), "czech:10");
  assert.equal(resolveAnonymousMelodyRepresentativeSongId(purePolish, "mixed"), "polish:7");

  const polishAnonymous = queryReferenceCandidatesFromData(data, {
    serviceDate: "2026-08-26",
    serviceLanguage: "polish",
    candidateUsages: [],
  });
  assert.deepEqual(
    candidatesForView(polishAnonymous, "melodies").map((candidate) => candidate.songId),
    ["polish:7", "polish:138"],
    "anonymous Melodies still depend on fallback/Jaroslav repertoire",
  );
}

historicalTruthMatrixCoverage();
repertoireIndependenceAndProductionRegressionCoverage();
console.log("Issue 244 anonymous Completed-set Melodies acceptance passed.");
