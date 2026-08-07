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
assert.match(candidateDetail, /melody-detail melody-detail-candidate/);
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
assert.match(selectedDetail, /melody-detail melody-detail-selected/);
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

const candidateDetailOverlay = renderToStaticMarkup(
  <CandidateCombobox
    rowId={1}
    rowLabel="Row 1"
    open={false}
    value="29 · Czech song"
    selectedSong={{ songId: available.songId, language: available.language, number: available.number, title: available.title }}
    candidates={[available, polishCandidate]}
    loading={false}
    serviceLanguage="mixed"
    detail={{ mode: "candidate", candidate: available, eligibilityCandidates: [available, polishCandidate], loading: false }}
    onOpen={() => undefined}
    onQueryChange={() => undefined}
    onSelect={() => undefined}
    onCancel={() => undefined}
    onRetry={() => undefined}
    onOpenDetail={() => undefined}
    onBackFromDetail={() => undefined}
    onRetryDetail={() => undefined}
  />,
);
assert.match(candidateDetailOverlay, /aria-expanded="true"/, "candidate-origin Detail keeps its underlying candidate list visually present");
assert.match(candidateDetailOverlay, /melody-detail melody-detail-candidate/);
assert.match(candidateDetailOverlay, /candidate-popup candidate-listbox/, "candidate-origin Detail overlays rather than replacing the candidate list");

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
assert.match(candidateListSource, /function captureDetailReturn\(songId: string\)[\s\S]*?setDetailReturnSongId\(songId\)[\s\S]*?setDetailReturnCandidates\(snapshot\)[\s\S]*?props\.onOpen\(\)/, "candidate-detail member return reopens without mutating Song lookup and retains the eligibility target snapshot");
assert.match(candidateListSource, /function returnToVisibleCandidate\(candidate: CandidateQueryResult, index: number\)[\s\S]*?setActiveIndex\(index\)[\s\S]*?setDetailReturnSongId\(candidate\.songId\)[\s\S]*?setDetailReturnCandidates\(\[\.\.\.visibleCandidates\]\)[\s\S]*?props\.onOpen\(\)/, "clicking the exposed list under candidate Detail closes Detail back to that exact visible candidate without selecting it");
assert.match(candidateListSource, /onClick=\{\(\) => \{[\s\S]*?if \(candidateDetailOpen\) \{[\s\S]*?returnToVisibleCandidate\(candidate, index\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?if \(selectable\) props\.onSelect\(candidate\)/, "underlying-list clicks are cursor returns before normal selection logic");
assert.match(candidateListSource, /if \(candidateDetailOpen\) \{[\s\S]*?querySelector<HTMLElement>\("\.melody-detail-candidate"\)[\s\S]*?listRef\.current\?\.contains\(target\)[\s\S]*?pendingFullCandidateDismiss\.current = true;[\s\S]*?setSuppressCandidateOverlay\(true\)[\s\S]*?props\.onBackFromDetail\(\)/, "candidate Detail outside-dismiss treats the list plus Detail as one inside region and hides both overlays immediately outside it");
assert.match(candidateListSource, /pendingFullCandidateDismiss\.current = false;[\s\S]*?if \(props\.open\) props\.onCancel\(\);[\s\S]*?setSuppressCandidateOverlay\(false\)/, "full candidate-origin dismiss completes by cancelling the restored list and confirmed lookup state");
assert.match(candidateListSource, /suppressOutsideDetailClick[\s\S]*?document\.addEventListener\("click", suppressCandidateDismissClick, true\)[\s\S]*?rightDetailButton[\s\S]*?suppressOutsideDetailClick\.current = rightDetailButton/, "candidate-origin outside-dismiss suppresses the standalone right Detail click-through instead of switching origin");
assert.match(candidateListSource, /const candidateListVisible = !suppressCandidateOverlay && \(props\.open \|\| candidateDetailOpen\)/, "candidate-origin Detail keeps the candidate list visible beneath its overlay unless a full outside-dismiss is in flight");
assert.match(candidateListSource, /\.row-icon-palette \{ top: 0 !important; transform: translateY\(calc\(-100% \+ 0\.26rem\)\); \}/, "smaller row controls compensate their vertical offset so the browser-accepted center is preserved");
assert.match(candidateListSource, /\.row-icon-palette \.row-icon-button \{[\s\S]*?font-size: 1rem;[\s\S]*?font-weight: 900;[\s\S]*?height: 1\.72rem;[\s\S]*?width: 1\.72rem;/, "row controls become slightly smaller while their symbols become substantially bolder");
assert.match(candidateListSource, /\.candidate-combobox > \.candidate-listbox,[\s\S]*?\.candidate-combobox > \.melody-detail-candidate[\s\S]*?position: absolute !important;[\s\S]*?top: calc\(100% \+ 0\.35rem\)/, "candidate list and candidate Detail are independent overlays anchored to the same line below Song lookup");
assert.match(candidateListSource, /\.candidate-combobox > \.candidate-listbox \{[\s\S]*?right: calc\(-4\.7rem - 0\.45rem\);[\s\S]*?width: 100%;/, "candidate list keeps its lookup-column width while aligning its right edge with the standalone Detail button");
assert.match(candidateListSource, /\.candidate-combobox > \.candidate-listbox \{[\s\S]*?max-height: min\(32rem, 70vh\);[\s\S]*?overflow-y: auto;[\s\S]*?direction: rtl;[\s\S]*?z-index: 40;/, "long candidate lists scroll independently with the scrollbar exposed on the left");
assert.match(candidateListSource, /\.candidate-combobox > \.melody-detail-candidate \{[\s\S]*?max-height: min\(32rem, 70vh\);[\s\S]*?overflow-y: auto;[\s\S]*?direction: rtl;[\s\S]*?z-index: 50 !important;/, "candidate Detail scrolls independently and overlays the retained candidate list");
assert.match(candidateListSource, /\.row-card > \.melody-detail-selected \{[\s\S]*?position: absolute !important;[\s\S]*?grid-row: 2 !important;[\s\S]*?top: -0\.2rem;[\s\S]*?right: 0;[\s\S]*?transform: none !important;/, "selected-song Detail is removed from row flow and aligned to the same overlay start immediately below Song lookup");
assert.match(candidateListSource, /\.row-card > \.melody-detail-selected \{[\s\S]*?max-height: min\(32rem, 70vh\);[\s\S]*?overflow-y: auto;[\s\S]*?direction: rtl;/, "selected-song Detail has the same independent overflow policy");
assert.match(candidateListSource, /\.row-card:has\(> \.melody-detail-selected\) \.song-field-detail \{[\s\S]*?opacity: 0\.55;[\s\S]*?pointer-events: none;/, "the right Detail button becomes a disabled-looking outside-dismiss target while selected-song Detail is open");
assert.match(candidateListSource, /getBoundingClientRect\(\)/, "candidate return scrolling must measure the real option position relative to its scroll container");
assert.match(candidateListSource, /optionRect\.bottom > containerRect\.bottom/);
assert.doesNotMatch(candidateListSource, /const top = option\.offsetTop/, "nested grid offsetTop must not drive candidate return positioning");
assert.doesNotMatch(candidateListSource, /candidate-list-cancel/);
assert.doesNotMatch(candidateListSource, /candidate-option-meta/);
assert.doesNotMatch(candidateListSource, /Currently selected/);
assert.match(detailSource, /openedMelodyMemberFirst\(classMembers, props\.candidate\.songId\)/, "Detail ordering is anchored to the song used to enter this Detail session");
assert.doesNotMatch(detailSource, /openedMelodyMemberFirst\(classMembers, openedSongId\)/, "switching the expanded member must not reorder the Detail session");
assert.match(detailSource, /setOpenedSongId\(member\.songId\)/, "Detail still expands another member in place");
assert.equal(detailSource.includes('className={`melody-detail melody-detail-${props.mode}`}'), true, "both Detail origins use the same panel with an origin class only for context");
assert.match(detailSource, /transform: "translateX\(calc\(4\.7rem \+ 0\.45rem\)\)"/, "candidate-origin Detail retains the right-column alignment transform; selected-origin overlay CSS neutralizes it in its full-row grid area");
assert.match(detailSource, /width: "min\(82%, 46rem\)"/);
assert.match(detailSource, /background: "#f5f5f4"/);
assert.match(detailSource, /boxShadow: "0 0\.8rem 2rem rgb\(31 41 51 \/ 14%\)"/);
assert.match(detailSource, /onReturnToCandidates/);
assert.match(detailSource, /dismissSelectedDetailOnOutsidePointer/);
assert.match(detailSource, /document\.addEventListener\("pointerdown", dismissSelectedDetailOnOutsidePointer, true\)/, "selected-song Detail closes on any outside pointer interaction");
assert.match(detailSource, /selectedDetailDismissPointerTarget = target/);
assert.doesNotMatch(detailSource, /Currently selected|Back to candidates|Show this candidate|Replace with this song/);
assert.match(cssSource, /\.compact-row-fields,\s*\.song-field-row\s*\{\s*display: contents;/);
assert.match(cssSource, /\.row-card \.row-note-input\s*\{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?order: 3;/, "Text note stays in the permanent base row flow while overlays do not consume height");
assert.match(cssSource, /\.melody-member-active\s*\{[\s\S]*?outline: 3px solid #84adff;/);

console.log("Phase 31.17 inline melody-class detail and equivalent navigation: PASS");
