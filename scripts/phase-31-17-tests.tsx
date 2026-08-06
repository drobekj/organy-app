import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateQueryResult } from "../src/application/interaction-contracts";
import { queryCandidatesFromData, hydrateCandidatesFromData } from "../src/application/interaction-service";
import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";
import { MelodyClassDetail, isMemberLanguageAllowed, melodyMembersForDetail, replacementCandidateForMember } from "../src/planning-lifecycle/melody-detail";

const available: CandidateQueryResult = {
  songId: "czech:29", language: "czech", number: "29", title: "Czech song", equivalentNumbers: [{ songId: "polish:38", number: "38", repertoire: true }],
  melodyClassId: "class-a",
  melodyMembers: [
    { songId: "czech:29", language: "czech", number: "29", title: "Czech song", repertoire: false, aggregatePreferenceScore: 3, sheetMusicUrl: "https://example.test/cz29.pdf" },
    { songId: "polish:38", language: "polish", number: "38", title: "Polish song", repertoire: true, aggregatePreferenceScore: 2, sheetMusicUrl: "https://example.test/pl38.pdf" },
  ],
  aggregatePreferenceScore: 3, antiphonMatch: false, seasonMatch: false, signal: "none", preferenceShade: "medium", repertoire: false,
  availability: { kind: "available" }, suppressedByMelodyWindow: false, orderKey: "0:29",
};
const polishCandidate: CandidateQueryResult = { ...available, songId: "polish:38", language: "polish", number: "38", title: "Polish song", aggregatePreferenceScore: 2, repertoire: true, orderKey: "1:38" };
const occupied: CandidateQueryResult = { ...available, availability: { kind: "occupiedByCurrentRows", rows: [{ rowId: 2, label: "Row 2" }] } };

assert.equal(isMemberLanguageAllowed("polish", "czech"), false);
assert.equal(isMemberLanguageAllowed("polish", "mixed"), true);
assert.equal(melodyMembersForDetail(polishCandidate).members[0]?.songId, "polish:38");
assert.equal(replacementCandidateForMember("polish:38", [polishCandidate])?.songId, "polish:38");

const candidateDetail = renderToStaticMarkup(<MelodyClassDetail mode="candidate" rowLabel="Row 1" candidate={available} serviceLanguage="mixed" eligibilityCandidates={[available, polishCandidate]} loading={false} onBack={() => undefined} onClose={() => undefined} onRetry={() => undefined} onShowCandidate={() => undefined} />);
assert.match(candidateDetail, /Complete melody-class context/);
assert.match(candidateDetail, /Show this candidate/);
assert.match(candidateDetail, /target="_blank"/);
assert.match(candidateDetail, /rel="noopener noreferrer"/);
assert.match(candidateDetail, /Open score for 38 Polish song/);

const selectedDetail = renderToStaticMarkup(<MelodyClassDetail mode="selected" rowLabel="Row 1" candidate={available} serviceLanguage="mixed" currentSongId="czech:29" eligibilityCandidates={[available, polishCandidate]} loading={false} onClose={() => undefined} onRetry={() => undefined} onReplace={() => undefined} />);
assert.match(selectedDetail, /Currently selected/);
assert.match(selectedDetail, /Replace with this song/);

const languageDisabled = renderToStaticMarkup(<MelodyClassDetail mode="selected" rowLabel="Row 1" candidate={available} serviceLanguage="czech" currentSongId="czech:29" eligibilityCandidates={[available, polishCandidate]} loading={false} onClose={() => undefined} onRetry={() => undefined} onReplace={() => undefined} />);
assert.match(languageDisabled, /Not selectable in a czech service/);
assert.doesNotMatch(languageDisabled, /Replace with this song/);

const historical = renderToStaticMarkup(<MelodyClassDetail mode="selected" rowLabel="Row 1" candidate={{ ...available, songId: "historical:czech:999", number: "999", title: "Saved snapshot", melodyClassId: undefined, melodyMembers: undefined, equivalentNumbers: [] }} serviceLanguage="czech" currentSongId="historical:czech:999" eligibilityCandidates={[]} loading={false} onClose={() => undefined} onRetry={() => undefined} />);
assert.match(historical, /Authoritative melody-class information is not available/);

const occupiedList = renderToStaticMarkup(<CandidateCombobox rowId={1} rowLabel="Row 1" open value="" candidates={[occupied]} loading={false} serviceLanguage="czech" onOpen={() => undefined} onQueryChange={() => undefined} onSelect={() => undefined} onCancel={() => undefined} onRetry={() => undefined} onOpenDetail={() => undefined} onBackFromDetail={() => undefined} onRetryDetail={() => undefined} onShowDetailCandidate={() => undefined} />);
assert.match(occupiedList, /aria-disabled="true"/);
assert.match(occupiedList, /Show melody detail for 29 Czech song/);
assert.match(occupiedList, /Same melody is already used in Row 2/);

const songs = [
  { songId: "demo-cz", language: "czech" as const, number: "101", title: "Demo Czech", active: true, sheetMusicUrl: "https://example.test/demo-cz.pdf" },
  { songId: "demo-pl", language: "polish" as const, number: "101", title: "Demo Polish", active: true },
];
const preferences = [{ profileId: "p", songId: "demo-cz", score: 3 }];
const knowledge = { antiphons: [], seasons: [], melodyClasses: [{ id: "demo-class", label: "Demo", songIds: ["demo-cz", "demo-pl"], synthetic: true }], melodyWindow: { months: 2 } };
const memoryCandidates = queryCandidatesFromData(songs, preferences, new Set(["demo-cz"]), knowledge, { serviceDate: "2026-08-09", serviceLanguage: "mixed", organistPersonId: "demo-organist", preferenceThreshold: 0 });
assert.deepEqual(memoryCandidates.map((candidate) => candidate.songId), ["demo-cz", "demo-pl"]);
assert.equal(memoryCandidates[0]?.melodyClassId, "demo-class");
assert.deepEqual(memoryCandidates[0]?.melodyMembers?.map((member) => member.songId), [memoryCandidates[0]?.songId, memoryCandidates[0]?.songId === "demo-cz" ? "demo-pl" : "demo-cz"]);
const hydrated = hydrateCandidatesFromData(songs, preferences, new Set(["demo-cz"]), knowledge, { songs: [{ songId: "demo-pl", language: "polish", number: "101", title: "Stored Polish" }], organistPersonId: "demo-organist" });
assert.deepEqual(hydrated[0]?.melodyMembers?.map((member) => member.songId), ["demo-pl", "demo-cz"]);

const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
assert.match(clientSource, /type PlanningExpansion/);
assert.match(clientSource, /kind: "candidateDetail"/);
assert.match(clientSource, /kind: "selectedSongDetail"/);
assert.match(clientSource, /openSelectedSongDetail/);
assert.match(clientSource, /replaceFromSelectedDetail/);
assert.equal(clientSource.includes('else if (planningExpansion && planningExpansion.kind !== "candidateList")'), true);
assert.equal(clientSource.includes("resetDetailEligibility();\n      setCandidateResults"), true);
assert.match(clientSource, /id={`selected-song-detail-button-/);
assert.doesNotMatch(clientSource, /onOpenDetail=\{\(\) => row\.selectedSong\?\.songId && openCatalogSongDetail/);

console.log("Phase 31.17 inline melody-class detail and equivalent navigation: PASS");
