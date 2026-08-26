import assert from "node:assert/strict";
import {
  queryReferenceCandidatesFromData,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";
import { candidatesForView } from "../src/planning-lifecycle/candidate-view";

const song = (
  id: string,
  canonicalNumber: number,
  title: string,
  classId: string,
  repertoire = false,
): ReferenceCandidateSong => ({
  id,
  language: id.startsWith("polish:") ? "polish" : "czech",
  canonicalNumber,
  displayNumber: String(canonicalNumber),
  title,
  classId,
  aggregatePreferenceScore: 0,
  repertoire,
  fallbackRepertoire: false,
});

const data: ReferenceCandidateData = {
  melodyWindowMonths: 2,
  songs: [
    song("czech:50", 50, "Eligible Czech repertoire pivot", "eligible-cross-language", true),
    song("polish:2", 2, "Eligible Polish sibling", "eligible-cross-language"),
    song("czech:70", 70, "Pure Czech repertoire pivot", "ineligible-pure-czech", true),
    song("czech:30", 30, "Ineligible mixed Czech", "ineligible-no-repertoire"),
    song("polish:5", 5, "Ineligible mixed Polish", "ineligible-no-repertoire"),
  ],
};

const base = {
  serviceDate: "2026-08-26",
  serviceLanguage: "polish" as const,
  organistPersonId: "selected-organist-242",
  preferenceThreshold: 0,
  candidateUsages: [],
};

const candidates = queryReferenceCandidatesFromData(data, base);
const songs = candidatesForView(candidates, "songs");
const melodies = candidatesForView(candidates, "melodies");
const songsClassIds = new Set(songs.map((candidate) => candidate.melodyClassId));

assert.deepEqual(songs.map((candidate) => candidate.songId), ["polish:2"]);
assert.deepEqual(melodies.map((candidate) => candidate.songId), ["czech:50"]);
assert.ok(melodies.every((candidate) => songsClassIds.has(candidate.melodyClassId)), "Melodies introduced a class absent from Songs");
assert.equal(melodies.some((candidate) => candidate.melodyClassId === "ineligible-pure-czech"), false);
assert.equal(melodies.some((candidate) => candidate.melodyClassId === "ineligible-no-repertoire"), false);

const representativeSearch = queryReferenceCandidatesFromData(data, {
  ...base,
  queryText: "Eligible Czech repertoire pivot",
});
assert.deepEqual(candidatesForView(representativeSearch, "songs"), []);
assert.deepEqual(
  candidatesForView(representativeSearch, "melodies").map((candidate) => candidate.songId),
  ["czech:50"],
  "representative-only search must retain an eligible opposite-language pivot",
);

console.log("Issue 242 Songs-derived Melodies class subset acceptance passed.");
