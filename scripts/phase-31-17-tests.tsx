import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateQueryResult } from "../src/application/interaction-contracts";
import { queryCandidatesFromData, hydrateCandidatesFromData } from "../src/application/interaction-service";
import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";
import { formatPlanningSongField, planningCandidateRowReducer } from "../src/planning-lifecycle/candidate-flow";
import {
  MelodyClassDetail,
  isDetailMemberActivatable,
  isMemberLanguageAllowed,
  melodyMembersForDetail,
  nextDetailMemberIndex,
  openedMelodyMemberFirst,
  replacementCandidateForMember,
} from "../src/planning-lifecycle/melody-detail";

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
const naturalMembers = melodyMembersForDetail(polishCandidate).members;
assert.deepEqual(naturalMembers.map((member) => member.songId), ["czech:29", "polish:38"], "melody-class members retain deterministic natural order before expansion ordering");
assert.deepEqual(openedMelodyMemberFirst(naturalMembers, "polish:38").map((member) => member.songId), ["polish:38", "czech:29"], "the song used to enter Detail starts at the top");
assert.equal(replacementCandidateForMember("polish:38", [polishCandidate])?.songId, "polish:38");
assert.equal(isDetailMemberActivatable({ mode: "candidate", memberSongId: "czech:29", languageAllowed: true, eligibility: available, activationEnabled: true }), true);
assert.equal(isDetailMemberActivatable({ mode: "candidate", memberSongId: "czech:29", languageAllowed: true, eligibility: occupied, activationEnabled: true }), false);
assert.equal(isDetailMemberActivatable({ mode: "selected", memberSongId: "czech:29", currentSongId: "czech:29", languageAllowed: false, activationEnabled: false }), true, "current selected member remains a close target even when replacement is unavailable");
assert.equal(nextDetailMemberIndex(0, "ArrowDown", [true, false, true]), 2, "vertical navigation must skip unavailable detail rows");
assert.equal(nextDetailMemberIndex(2, "ArrowUp", [true, false, true]), 0);

const candidateDetail = renderToStaticMarkup(
  <MelodyClassDetail
    mode="candidate"
    rowLabel="Row 1"
    candidate={available}
    serviceLanguage="mixed"
    eligibilityCandidates={[available, polishCandidate]}
    loading={false}
    onBack={() => undefined}
    onClose={() => undefined}
    onRetry={() => undefined}
    onShowCandidate={() => undefined}
    onReturnToCandidates={() => undefined}
  />,
);
assert.equal((candidateDetail.match(/>Detail<\/button>/g) ?? []).length, 1, "the expanded melody member must not keep a redundant Detail button");
assert.match(candidateDetail, />Score<\/a>/, "expanded row exposes Score when available");
assert.match(candidateDetail, /target="_blank"/);
assert.match(candidateDetail, /rel="noopener noreferrer"/);
assert.match(candidateDetail, /Open score for 29 Czech song/);
assert.match(candidateDetail, /melody-member-meta[\s\S]*?>Score<\/a>[\s\S]*?melody-member-actions/, "available Score occupies the same metadata area as Score not available");
assert.doesNotMatch(candidateDetail, /Currently selected|Back to candidates|Show this candidate|Replace with this song|>Close</, "detail must not show legacy selection/navigation labels or companion buttons");

const polishOpenedDetail = renderToStaticMarkup(
  <MelodyClassDetail
    mode="candidate"
    rowLabel="Row 1"
    candidate={polishCandidate}
    serviceLanguage="mixed"
    eligibilityCandidates={[available, polishCandidate]}
    loading={false}
    onBack={() => undefined}
    onClose={() => undefined}
    onRetry={() => undefined}
    onShowCandidate={() => undefined}
    onReturnToCandidates={() => undefined}
  />,
);
assert.ok(polishOpenedDetail.indexOf("Polish song") < polishOpenedDetail.indexOf("Czech song"), "the entry song must render first even when its natural melody-class position is later");

const selectedDetail = renderToStaticMarkup(
  <MelodyClassDetail
    mode="selected"
    rowLabel="Row 1"
    candidate={available}
    serviceLanguage="mixed"
    currentSongId="czech:29"
    eligibilityCandidates={[available, polishCandidate]}
    loading={false}
    onClose={() => undefined}
    onRetry={() => undefined}
    onReplace={() => undefined}
  />,
);
assert.doesNotMatch(selectedDetail, /Currently selected|Replace with this song|>Close</);
assert.equal((selectedDetail.match(/>Detail<\/button>/g) ?? []).length, 1, "selected-song Detail uses the same expanded-row button rule");

const languageDisabled = renderToStaticMarkup(
  <MelodyClassDetail
    mode="selected"
    rowLabel="Row 1"
    candidate={polishCandidate}
    serviceLanguage="czech"
    currentSongId="czech:29"
    eligibilityCandidates={[available, polishCandidate]}
    loading={false}
    onClose={() => undefined}
    onRetry={() => undefined}
    onReplace={() => undefined}
  />,
);
assert.match(languageDisabled, /Not selectable in a czech service/);
assert.match(languageDisabled, /Polish song, unavailable/);
assert.doesNotMatch(languageDisabled, /role="button"[^>]*aria-label="38 Polish song, unavailable"/, "unavailable member field must not become an activatable keyboard row");
assert.doesNotMatch(languageDisabled, /Show detail for 38 Polish song/, "the already expanded unavailable member must not keep a Detail button");
assert.match(languageDisabled, /Show detail for 29 Czech song/, "compressed equivalent members retain Detail");
assert.match(languageDisabled, />Score<\/a>/, "Score remains usable when the unavailable member is expanded");

const historical = renderToStaticMarkup(
  <MelodyClassDetail
    mode="selected"
    rowLabel="Row 1"
    candidate={{ ...available, songId: "historical:czech:999", number: "999", title: "Saved snapshot", melodyClassId: undefined, melodyMembers: undefined, equivalentNumbers: [] }}
    serviceLanguage="czech"
    currentSongId="historical:czech:999"
    eligibilityCandidates={[]}
    loading={false}
    onClose={() => undefined}
    onRetry={() => undefined}
  />,
);
assert.match(historical, /Authoritative melody-class information is not available/);
assert.match(historical, /Score not available/, "missing-score information belongs with expanded metadata");
assert.doesNotMatch(historical, />Detail<\/button>/, "a single expanded historical member has no redundant Detail control");

const occupiedList = renderToStaticMarkup(<CandidateCombobox rowId={1} rowLabel="Row 1" open value="" candidates={[occupied]} loading={false} serviceLanguage="czech" onOpen={() => undefined} onQueryChange={() => undefined} onSelect={() => undefined} onCancel={() => undefined} onRetry={() => undefined} onOpenDetail={() => undefined} onBackFromDetail={() => undefined} onRetryDetail={() => undefined} onShowDetailCandidate={() => undefined} />);
assert.match(occupiedList, /aria-disabled="true"/);
assert.match(occupiedList, /Show melody detail for 29 Czech song/);
assert.doesNotMatch(occupiedList, /Same melody is already used in Row 2/, "candidate rows stay compact; occupancy explanation belongs in Detail");
assert.doesNotMatch(occupiedList, /Currently selected/);
assert.doesNotMatch(occupiedList, />Cancel</);
assert.doesNotMatch(occupiedList, /In repertoire|preference 3|Melody class:/);

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

assert.equal(formatPlanningSongField({ number: "29", title: "Czech song" }), "29 · Czech song");
const openedRow = planningCandidateRowReducer({
  id: 1,
  songSearch: "29 · Czech song",
  selectedSong: { songId: available.songId, language: available.language, number: available.number, title: available.title },
  selectedCandidate: available,
  note: "keep this note",
  lookupOpen: false,
}, { type: "lookupOpened" });
assert.equal(openedRow.songSearch, "29 · Czech song", "opening candidates must preserve the confirmed number/title display");
assert.equal(openedRow.selectedSong?.songId, available.songId);
assert.equal(openedRow.lookupOpen, true);

const clearedRow = planningCandidateRowReducer({
  id: 1,
  songSearch: "29 · Czech song",
  selectedSong: { songId: available.songId, language: available.language, number: available.number, title: available.title },
  selectedCandidate: available,
  note: "clear this note",
  lookupOpen: false,
}, { type: "rowCleared" });
assert.equal(clearedRow.selectedSong, undefined);
assert.equal(clearedRow.selectedCandidate, undefined);
assert.equal(clearedRow.note, "");
assert.equal(clearedRow.songSearch, "");

const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const candidateListSource = readFileSync("src/planning-lifecycle/candidate-list.tsx", "utf8");
const detailSource = readFileSync("src/planning-lifecycle/melody-detail.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");
assert.match(clientSource, /type PlanningExpansion/);
assert.match(clientSource, /kind: "candidateDetail"/);
assert.match(clientSource, /kind: "selectedSongDetail"/);
assert.match(clientSource, /openSelectedSongDetail/);
assert.match(clientSource, /replaceFromSelectedDetail/);
assert.equal(clientSource.includes('else if (planningExpansion && planningExpansion.kind !== "candidateList")'), true);
assert.equal(clientSource.includes("resetDetailEligibility();\n      setCandidateResults"), true);
assert.match(clientSource, /function openSelectedSongDetail[\s\S]*?lookupCancelled[\s\S]*?setCandidateResults\(\{\}\)/, "opening selected-song Detail collapses any candidate list and clears its result state");
assert.match(clientSource, /function closeSelectedSongDetail[\s\S]*?setPlanningExpansion\(null\)/, "return from selected-song Detail stays in the collapsed Song lookup state");
assert.match(clientSource, /id={`selected-song-detail-button-/);
assert.doesNotMatch(clientSource, /onOpenDetail=\{\(\) => row\.selectedSong\?\.songId && openCatalogSongDetail/);
assert.doesNotMatch(clientSource, /<CandidateLine/);
assert.match(clientSource, /className="row-icon-palette"/);
assert.ok(clientSource.indexOf('aria-label="Move row up"') < clientSource.indexOf('aria-label="Move row down"'));
assert.ok(clientSource.indexOf('aria-label="Move row down"') < clientSource.indexOf('aria-label="Clear row"'));
assert.ok(clientSource.indexOf('aria-label="Clear row"') < clientSource.indexOf('aria-label="Remove row"'));
assert.match(clientSource, />↶<\/button>/);
assert.match(clientSource, /placeholder="Text note"/);
assert.match(candidateListSource, /placeholder="Song lookup"/);
assert.match(candidateListSource, /closeOnOutsidePointer/);
assert.match(candidateListSource, /inputWasOpenOnPointerDown/);
assert.match(candidateListSource, /consumeSelectedDetailDismissPointer/, "Song lookup consumes the outside-dismiss pointer so it cannot immediately reopen candidates");
assert.match(candidateListSource, /detailReturnSongId/, "candidate-detail return keeps its target locally without rewriting Song lookup text");
assert.match(candidateListSource, /detailReturnCandidates/, "candidate-detail return keeps the fresh eligibility snapshot so an equivalent target cannot disappear from the reopened list");
assert.match(candidateListSource, /const effectiveFocusSongId = detailReturnSongId \?\? props\.focusSongId/, "the clicked equivalent target has priority over any selected-song focus");
assert.match(candidateListSource, /function captureDetailReturn\(songId: string\)[\s\S]*?setDetailReturnSongId\(songId\)[\s\S]*?setDetailReturnCandidates\(snapshot\)[\s\S]*?props\.onOpen\(\)/, "candidate-detail return reopens without mutating Song lookup and retains the target snapshot");
assert.match(candidateListSource, /\.row-icon-palette \{ top: 0 !important; transform: translateY\(-50%\); \}/, "row control squares are vertically centered on the fieldset top border like the Row legend");
assert.match(candidateListSource, /getBoundingClientRect\(\)/, "candidate return scrolling must measure the real option position relative to its scroll container");
assert.match(candidateListSource, /optionRect\.bottom > containerRect\.bottom/);
assert.doesNotMatch(candidateListSource, /const top = option\.offsetTop/, "nested grid offsetTop must not drive candidate return positioning");
assert.doesNotMatch(candidateListSource, /candidate-list-cancel/);
assert.doesNotMatch(candidateListSource, /candidate-option-meta/);
assert.doesNotMatch(candidateListSource, /Currently selected/);
assert.match(detailSource, /openedMelodyMemberFirst\(classMembers, props\.candidate\.songId\)/, "Detail ordering is anchored to the song used to enter this Detail session");
assert.doesNotMatch(detailSource, /openedMelodyMemberFirst\(classMembers, openedSongId\)/, "switching the expanded member must not reorder the Detail session");
assert.match(detailSource, /setOpenedSongId\(member\.songId\)/, "Detail still expands another member in place");
assert.match(detailSource, /onReturnToCandidates/);
assert.match(detailSource, /dismissSelectedDetailOnOutsidePointer/);
assert.match(detailSource, /document\.addEventListener\("pointerdown", dismissSelectedDetailOnOutsidePointer, true\)/, "selected-song Detail closes on any outside pointer interaction");
assert.match(detailSource, /selectedDetailDismissPointerTarget = target/);
assert.doesNotMatch(detailSource, /Currently selected|Back to candidates|Show this candidate|Replace with this song/);
assert.match(cssSource, /\.compact-row-fields,\s*\.song-field-row\s*\{\s*display: contents;/);
assert.match(cssSource, /\.row-card > \.melody-detail\s*\{[\s\S]*?grid-column: 1;[\s\S]*?order: 2;/, "selected-song detail is visually placed in the same first-column slot between lookup and note");
assert.match(cssSource, /\.row-card \.row-note-input\s*\{[\s\S]*?order: 3;/);
assert.match(cssSource, /\.melody-member-active\s*\{[\s\S]*?outline: 3px solid #84adff;/);

console.log("Phase 31.17 inline melody-class detail and equivalent navigation: PASS");
