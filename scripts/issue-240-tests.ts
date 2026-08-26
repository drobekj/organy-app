import assert from "node:assert/strict";
import {
  queryReferenceCandidatesFromData,
  resolveSelectedOrganistMelodyRepresentativeSongId,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";
import { candidateToSelectedSong } from "../src/planning-lifecycle/candidate-flow";
import { candidatesForView } from "../src/planning-lifecycle/candidate-view";
import { melodyMembersForDetail } from "../src/planning-lifecycle/melody-detail";
import type { ServiceLanguage } from "../src/planning-lifecycle/model";

const makeSong = (
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

const songs = [
  makeSong("czech:10", 10, "Pure Czech ten", "pure-cz"),
  makeSong("czech:20", 20, "Pure Czech twenty", "pure-cz"),
  makeSong("czech:30", 30, "Mixed Czech thirty", "mixed-no-repertoire"),
  makeSong("czech:40", 40, "Mixed Czech forty", "mixed-no-repertoire"),
  makeSong("polish:5", 5, "Mixed Polish five", "mixed-no-repertoire"),
  makeSong("polish:15", 15, "Mixed Polish fifteen", "mixed-no-repertoire"),
  makeSong("polish:7", 7, "Pure Polish seven", "pure-pl"),
  makeSong("polish:17", 17, "Pure Polish seventeen", "pure-pl"),
  makeSong("czech:50", 50, "Czech repertoire pivot", "repertoire-cz", true),
  makeSong("polish:2", 2, "Polish sibling of Czech pivot", "repertoire-cz"),
  makeSong("czech:60", 60, "Czech sibling of Polish pivot", "repertoire-pl"),
  makeSong("polish:1", 1, "Polish repertoire pivot", "repertoire-pl", true),
];

const data: ReferenceCandidateData = { songs, melodyWindowMonths: 2 };
const base = {
  serviceDate: "2026-08-26",
  organistPersonId: "person-selected-240",
  preferenceThreshold: 0,
  candidateUsages: [],
};

const expectedMelodies: Record<ServiceLanguage, string[]> = {
  czech: ["czech:10", "czech:30", "czech:50", "polish:1"],
  polish: ["czech:50", "polish:1", "polish:5", "polish:7"],
  mixed: ["czech:10", "czech:30", "czech:50", "polish:1", "polish:7"],
};

const expectedSongs: Record<ServiceLanguage, string[]> = {
  czech: ["czech:50", "czech:60"],
  polish: ["polish:1", "polish:2"],
  mixed: ["czech:50", "czech:60", "polish:1", "polish:2"],
};

function selectedOrganistMatrixCoverage() {
  for (const serviceLanguage of ["czech", "polish", "mixed"] as const) {
    const candidates = queryReferenceCandidatesFromData(data, { ...base, serviceLanguage });
    assert.deepEqual(
      candidatesForView(candidates, "songs").map((candidate) => candidate.songId),
      expectedSongs[serviceLanguage],
      `${serviceLanguage} service changed the Songs baseline`,
    );
    const melodies = candidatesForView(candidates, "melodies");
    assert.deepEqual(
      melodies.map((candidate) => candidate.songId),
      expectedMelodies[serviceLanguage],
      `${serviceLanguage} service does not match the Issue 240 representative matrix`,
    );
    assert.equal(new Set(melodies.map((candidate) => candidate.melodyClassId)).size, melodies.length, "Melodies must contain one concrete song per class");
    assert.ok(melodies.some((candidate) => candidate.songId === "czech:50"), "Czech repertoire pivot must win for every service language");
    assert.ok(melodies.some((candidate) => candidate.songId === "polish:1"), "Polish repertoire pivot must win for every service language");
  }

  assert.equal(
    resolveSelectedOrganistMelodyRepresentativeSongId(songs.filter((song) => song.classId === "mixed-no-repertoire"), "polish"),
    "polish:5",
  );
  assert.equal(
    resolveSelectedOrganistMelodyRepresentativeSongId(songs.filter((song) => song.classId === "pure-pl"), "czech"),
    undefined,
  );
}

function searchSelectionAvailabilityAndDetailCoverage() {
  const polishSearch = queryReferenceCandidatesFromData(data, {
    ...base,
    serviceLanguage: "polish",
    queryText: "Mixed Polish five",
  });
  assert.deepEqual(candidatesForView(polishSearch, "songs"), [], "Melodies-only fallback leaked into Songs search");
  const representative = candidatesForView(polishSearch, "melodies")[0];
  assert.equal(representative?.songId, "polish:5", "search did not retain the resolved representative");
  assert.deepEqual(candidateToSelectedSong(representative!), {
    songId: "polish:5",
    language: "polish",
    number: "5",
    title: "Mixed Polish five",
  }, "selection must persist the concrete representative");
  const detail = melodyMembersForDetail(representative!);
  assert.equal(detail.authoritative, true, "representative lost authoritative melody detail");
  assert.deepEqual(detail.members.map((member) => member.songId), ["czech:30", "czech:40", "polish:5", "polish:15"]);

  const nonRepresentativeSearch = queryReferenceCandidatesFromData(data, {
    ...base,
    serviceLanguage: "polish",
    queryText: "Polish sibling of Czech pivot",
  });
  assert.deepEqual(candidatesForView(nonRepresentativeSearch, "songs").map((candidate) => candidate.songId), ["polish:2"]);
  assert.deepEqual(candidatesForView(nonRepresentativeSearch, "melodies"), [], "search promoted a non-representative sibling");

  const occupied = queryReferenceCandidatesFromData(data, {
    ...base,
    serviceLanguage: "polish",
    candidateUsages: [{
      songId: "czech:30",
      serviceDate: "2026-08-26",
      source: "current",
      rowId: 2,
      rowLabel: "Row 2",
    }],
  });
  const occupiedRepresentative = candidatesForView(occupied, "melodies").find((candidate) => candidate.songId === "polish:5");
  assert.equal(occupiedRepresentative?.availability.kind, "occupiedByCurrentRows", "Melodies weakened current-service occupancy");
}

selectedOrganistMatrixCoverage();
searchSelectionAvailabilityAndDetailCoverage();
console.log("Issue 240 Melodies representative acceptance passed.");
