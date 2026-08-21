import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogSong } from "../src/application/catalog";
import type { CandidateQueryResult } from "../src/application/interaction-contracts";
import { queryCandidatesFromData } from "../src/application/interaction-service";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";
import {
  CandidateCombobox,
  candidateIndexForKey,
  getCandidateEmptyMessage,
  getInitialCandidateIndex,
  isCandidateSelectable,
} from "../src/planning-lifecycle/candidate-list";
import {
  PHASE_30_1_PREFERENCE_THRESHOLD,
  buildCandidateQueryInput,
  openSingleCandidateRow,
  planningCandidateRowReducer,
  type PlanningCandidateEditableRow,
} from "../src/planning-lifecycle/candidate-flow";

const available = candidate("czech:29", "29", "Current exact song");
const equivalent = candidate("czech:421", "421", "Same melody equivalent", {
  melodyClassId: "class-a",
  melodyMembers: [member("czech:29", "29"), member("czech:421", "421")],
});
const occupied = candidate("polish:38", "38", "Occupied Polish equivalent", {
  language: "polish",
  melodyClassId: "class-a",
  availability: { kind: "occupiedByCurrentRows", rows: [{ rowId: 2, label: "Row 2" }, { rowId: 3, label: "Row 3" }] },
});

function candidate(songId: string, number: string, title: string, changes: Partial<CandidateQueryResult> = {}): CandidateQueryResult {
  return {
    songId,
    language: "czech",
    number,
    title,
    equivalentNumbers: [],
    aggregatePreferenceScore: 0,
    antiphonMatch: false,
    seasonMatch: false,
    signal: "none",
    preferenceShade: "none",
    repertoire: true,
    availability: { kind: "available" },
    suppressedByMelodyWindow: false,
    orderKey: `${songId}:${number}`,
    melodyClassId: "class-a",
    melodyMembers: [member(songId, number)],
    ...changes,
  };
}

function member(songId: string, number: string) {
  return {
    songId,
    language: songId.startsWith("polish:") ? "polish" as const : "czech" as const,
    number,
    title: `Member ${number}`,
    repertoire: true,
    aggregatePreferenceScore: 0,
  };
}

function stateCoverage() {
  assert.equal(PHASE_30_1_PREFERENCE_THRESHOLD, 0, "approved default threshold must be zero");
  assert.equal(buildCandidateQueryInput({ serviceDate: "2026-08-09", serviceLanguage: "czech", candidateUsages: [] }).preferenceThreshold, 0);
  assert.equal(candidateIndexForKey(-1, "ArrowDown", 3), 0);
  assert.equal(candidateIndexForKey(0, "ArrowUp", 3), 0);
  assert.equal(candidateIndexForKey(1, "End", 3), 2);
  assert.equal(candidateIndexForKey(2, "Home", 3), 0);
  assert.equal(getInitialCandidateIndex([equivalent, available], available.songId), 1, "exact current songId must set the initial index");
  assert.equal(getInitialCandidateIndex([equivalent], available.songId), 0, "an equivalent must not be treated as the exact current song");
  assert.equal(getCandidateEmptyMessage(""), "No songs satisfy the current language, repertoire, preference and melody rules.");
  assert.equal(getCandidateEmptyMessage("abc"), "No candidate matches this search within the current filters.");
  assert.equal(isCandidateSelectable(occupied), false);

  const rows: PlanningCandidateEditableRow[] = [
    { id: 1, songSearch: "temporary", selectedSong: { songId: "czech:29", language: "czech", number: "29", title: "Current" }, selectedCandidate: available, note: "keep", lookupOpen: true },
    { id: 2, songSearch: "421 · Equivalent", selectedSong: { songId: "czech:421", language: "czech", number: "421", title: "Equivalent" }, selectedCandidate: equivalent, note: "second", lookupOpen: false },
  ];
  const opened = openSingleCandidateRow(rows, 2);
  assert.equal(opened[0].lookupOpen, false);
  assert.equal(opened[0].songSearch, "29 · Current", "opening another row must cancel and restore the prior temporary search");
  assert.equal(opened[1].lookupOpen, true);
  assert.equal(opened[1].songSearch, "421 · Equivalent", "opening the candidate list must keep the confirmed number/title visible");

  const typed = planningCandidateRowReducer(opened[1], { type: "lookupChanged", text: "421" });
  assert.equal(typed.selectedSong?.songId, "czech:421", "non-empty manual text remains only a query and must not discard the last confirmed song");
  const typedThenCancelled = planningCandidateRowReducer(typed, { type: "lookupCancelled" });
  assert.equal(typedThenCancelled.songSearch, "421 · Equivalent", "unconfirmed manual text must restore the last confirmed song when lookup closes");

  const explicitlyEmpty = planningCandidateRowReducer(opened[1], { type: "lookupChanged", text: "" });
  assert.equal(explicitlyEmpty.lookupOpen, true, "clearing the field must keep browse mode open");
  assert.equal(explicitlyEmpty.songSearch, "");
  assert.equal(explicitlyEmpty.selectedSong, undefined, "explicitly empty lookup is a valid no-song state");
  assert.equal(explicitlyEmpty.selectedCandidate, undefined);
  assert.equal(explicitlyEmpty.note, "second", "clearing only Song lookup must preserve the row note");
  const emptyThenClosed = planningCandidateRowReducer(explicitlyEmpty, { type: "lookupCancelled" });
  assert.equal(emptyThenClosed.songSearch, "", "closing an explicitly empty lookup must not resurrect the former song");
  assert.equal(emptyThenClosed.selectedSong, undefined);

  const switchedAfterClear = openSingleCandidateRow([opened[0], explicitlyEmpty], 1);
  assert.equal(switchedAfterClear[1].songSearch, "", "switching rows after explicit clear must preserve the accepted empty state");
  assert.equal(switchedAfterClear[1].selectedSong, undefined);

  const replaced = planningCandidateRowReducer(rows[0], {
    type: "candidateSelected",
    song: { songId: equivalent.songId, language: equivalent.language, number: equivalent.number, title: equivalent.title },
    candidate: equivalent,
  });
  assert.equal(replaced.note, "keep", "replacement must preserve the row note");
  const cleared = planningCandidateRowReducer(replaced, { type: "songCleared" });
  assert.equal(cleared.note, "keep", "clear must preserve the row note");
}

function dynamicSearchCoverage() {
  const songs: CatalogSong[] = [
    { songId: "czech:29", language: "czech", number: "29", title: "Current exact song", active: true },
    { songId: "czech:421", language: "czech", number: "421", title: "Same Melody Equivalent", active: true },
    { songId: "czech:512", language: "czech", number: "512", title: "Another hymn", active: true },
  ];
  const repertoire = new Set(songs.map((song) => song.songId));
  const knowledge = { antiphons: [], seasons: [], melodyClasses: [], melodyWindow: { months: 2 } };
  const baseInput = {
    serviceDate: "2026-08-09",
    serviceLanguage: "czech" as const,
    organistPersonId: "demo-organist",
    preferenceThreshold: 0,
    candidateUsages: [],
  };

  const byNumber = queryCandidatesFromData(songs, [], repertoire, knowledge, { ...baseInput, queryText: "42" });
  assert.deepEqual(byNumber.map((item) => item.songId), ["czech:421"], "memory manual query must match a partially typed candidate number");
  const byTitle = queryCandidatesFromData(songs, [], repertoire, knowledge, { ...baseInput, queryText: "melody" });
  assert.deepEqual(byTitle.map((item) => item.songId), ["czech:421"], "memory manual query must match candidate title");
  const caseInsensitive = queryCandidatesFromData(songs, [], repertoire, knowledge, { ...baseInput, queryText: "MELODY" });
  assert.deepEqual(caseInsensitive.map((item) => item.songId), ["czech:421"], "memory candidate title matching must be case-insensitive");

  const referenceData: ReferenceCandidateData = {
    songs: [
      { id: "czech:29", language: "czech", canonicalNumber: 29, displayNumber: "29", title: "Current exact song", classId: "reference-melody:czech:29", aggregatePreferenceScore: 0, repertoire: true },
      { id: "czech:421", language: "czech", canonicalNumber: 421, displayNumber: "421", title: "Same Melody Equivalent", classId: "reference-melody:czech:421", aggregatePreferenceScore: 0, repertoire: true },
      { id: "czech:512", language: "czech", canonicalNumber: 512, displayNumber: "512", title: "Another hymn", classId: "reference-melody:czech:512", aggregatePreferenceScore: 0, repertoire: true },
    ],
    melodyWindowMonths: 2,
  };
  const referenceByNumber = queryReferenceCandidatesFromData(referenceData, { ...baseInput, queryText: "42" });
  assert.deepEqual(referenceByNumber.map((item) => item.songId), ["czech:421"], "DB/reference manual query must match a partially typed displayed number");
  const referenceByTitle = queryReferenceCandidatesFromData(referenceData, { ...baseInput, queryText: "melody" });
  assert.deepEqual(referenceByTitle.map((item) => item.songId), ["czech:421"], "DB/reference manual query must match candidate title");
  const referenceCaseInsensitive = queryReferenceCandidatesFromData(referenceData, { ...baseInput, queryText: "MELODY" });
  assert.deepEqual(referenceCaseInsensitive.map((item) => item.songId), ["czech:421"], "DB/reference candidate title matching must be case-insensitive");
}

function renderCoverage() {
  const common = {
    rowId: 1,
    rowLabel: "Row 1",
    open: true,
    value: "29 · Current exact song",
    selectedSong: { songId: available.songId, language: "czech" as const, number: available.number, title: available.title },
    candidates: [available, equivalent, occupied],
    loading: false,
    serviceLanguage: "mixed" as const,
    onOpen() {},
    onQueryChange() {},
    onSelect() {},
    onCancel() {},
    onRetry() {},
  };
  const season = candidate("czech:1", "1", "Season candidate", { seasonMatch: true, signal: "season" });
  const antiphon = candidate("czech:2", "2", "Antiphon candidate", { antiphonMatch: true, signal: "antiphon" });
  const html = renderToStaticMarkup(<CandidateCombobox {...common} />);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /value="29 · Current exact song"/, "open lookup must keep the confirmed number/title visible");
  assert.match(html, /role="listbox"/);
  assert.equal((html.match(/role="option"/g) ?? []).length, 3, "one backend candidate must render as one concrete option");
  assert.equal((html.match(/candidate-inline-detail/g) ?? []).length, 3, "every candidate row must retain one Detail button");
  assert.ok(html.indexOf("Current exact song") < html.indexOf("Same melody equivalent"));
  assert.ok(html.indexOf("Same melody equivalent") < html.indexOf("Occupied Polish equivalent"), "UI must preserve backend ordering");
  assert.match(html, /candidate-option-current/, "the exact selected song keeps its visual current-row highlight");
  const seasonHtml = renderToStaticMarkup(<CandidateCombobox {...common} value="" selectedSong={undefined} candidates={[season]} />);
  assert.match(seasonHtml, /candidate-option-row candidate-tone-positive candidate-preference-none/, "compact season candidate must keep the established positive tone class");
  assert.match(seasonHtml, /candidate-option-main candidate-content-text candidate-text-positive/, "compact season candidate text must render green");
  const antiphonHtml = renderToStaticMarkup(<CandidateCombobox {...common} value="" selectedSong={undefined} candidates={[antiphon]} />);
  assert.match(antiphonHtml, /candidate-option-row candidate-tone-negative candidate-preference-none/, "compact antiphon candidate must keep the established negative tone class");
  assert.match(antiphonHtml, /candidate-option-main candidate-content-text candidate-text-negative/, "compact antiphon candidate text must render red");
  assert.doesNotMatch(html, /Currently selected/);
  assert.doesNotMatch(html, /In repertoire/);
  assert.doesNotMatch(html, /Melody known through an equivalent/);
  assert.doesNotMatch(html, /preference 0/);
  assert.doesNotMatch(html, /Melody class:/);
  assert.doesNotMatch(html, /Unavailable —/);
  assert.doesNotMatch(html, />Cancel</);
  assert.match(html, /aria-disabled="true"/);
  assert.doesNotMatch(html, /<button[^>]*disabled/, "disabled candidates remain semantic options rather than nested disabled controls");
  assert.doesNotMatch(html, /Row 2 and Row 3/, "occupancy explanation belongs in Detail rather than the candidate row");
  assert.doesNotMatch(html, /All matching melodies are already occupied/, "mixed available and occupied results must not become an empty state");

  const loadingHtml = renderToStaticMarkup(<CandidateCombobox {...common} candidates={[]} loading={true} />);
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /Loading candidates/);
  const browseEmpty = renderToStaticMarkup(<CandidateCombobox {...common} candidates={[]} />);
  assert.match(browseEmpty, /No songs satisfy/, "confirmed display text must not be mistaken for a search query");
  const searchEmpty = renderToStaticMarkup(<CandidateCombobox {...common} value="missing" candidates={[]} />);
  assert.match(searchEmpty, /No candidate matches/);
  const errorHtml = renderToStaticMarkup(<CandidateCombobox {...common} candidates={[]} error="Candidate lookup failed." />);
  assert.match(errorHtml, /Candidate lookup failed/);
  assert.match(errorHtml, />Retry</);
  assert.doesNotMatch(errorHtml, />Cancel</);
  const unavailableHtml = renderToStaticMarkup(
    <CandidateCombobox
      {...common}
      value="999 · Retained invalid"
      selectedSong={{ songId: "polish:999", language: "polish", number: "999", title: "Retained invalid" }}
      candidates={[available]}
      serviceLanguage="czech"
    />,
  );
  assert.match(unavailableHtml, /value="999 · Retained invalid"/);
  assert.doesNotMatch(unavailableHtml, /Not available because/);
  assert.doesNotMatch(unavailableHtml, /Currently selected/);
  const allOccupiedHtml = renderToStaticMarkup(<CandidateCombobox {...common} value="" selectedSong={undefined} candidates={[occupied]} />);
  assert.match(allOccupiedHtml, /All matching melodies are already occupied/);
}

async function staticCoverage() {
  const [client, component, flow, service, referenceService, schema, journal] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/planning-lifecycle/candidate-list.tsx", "utf8"),
    readFile("src/planning-lifecycle/candidate-flow.ts", "utf8"),
    readFile("src/application/interaction-service.ts", "utf8"),
    readFile("src/application/reference-candidate-service.ts", "utf8"),
    readFile("src/db/schema/index.ts", "utf8"),
    readFile("drizzle/meta/_journal.json", "utf8"),
  ]);
  assert.match(client, /openCandidateRowId/);
  assert.match(client, /openCandidateRowId === null \|\| openCandidateRowId === row\.id/, "unrelated row focus must not detach the open list from its query state");
  assert.match(client, /CandidateCombobox/);
  assert.match(client, /queryText: value/, "every manual edit must drive a fresh candidate query");
  assert.match(client, /preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD/);
  assert.match(client, /const PHASE_30_1_PREFERENCE_THRESHOLD = 0/);
  assert.doesNotMatch(client, /getCandidatePopupRows\(candidateResults/);
  assert.match(component, /aria-activedescendant/);
  assert.match(component, /ArrowDown/);
  assert.match(component, /event\.key === "Enter"/);
  assert.match(component, /props\.candidates\[activeIndex\]/, "Enter must resolve the currently active candidate");
  assert.match(component, /currentTarget\.select\(\)/, "activating a non-empty Song lookup must select the whole value for replacement typing");
  assert.match(component, /scrollOptionInsideList/);
  assert.match(component, /role="option"/);
  assert.match(component, /candidate-option-current/);
  assert.match(component, /inputWasOpenOnPointerDown/);
  assert.doesNotMatch(component, /candidate-option-meta/);
  assert.doesNotMatch(component, /candidate-current-marker/);
  assert.doesNotMatch(component, /candidate-list-cancel/);
  assert.doesNotMatch(component, /Currently selected/);
  assert.match(flow, /case "lookupOpened"/);
  assert.match(flow, /selectedSong: undefined, selectedCandidate: undefined, lookupOpen: true/, "explicit blank query must become an accepted no-song state while the list remains open");
  assert.match(flow, /songSearch: row\.selectedSong \? formatPlanningSongField\(row\.selectedSong\) : ""/);
  assert.match(service, /song\.number\.toLocaleLowerCase\(\)\.includes\(queryText\)/);
  assert.match(service, /song\.title\.toLocaleLowerCase\(\)\.includes\(queryText\)/);
  assert.match(referenceService, /song\.displayNumber\.toLocaleLowerCase\(\)\.includes\(lower\)/, "DB/reference lookup must support incremental partial displayed-number matching");
  assert.match(referenceService, /song\.title\.toLocaleLowerCase\(\)\.includes\(lower\)/);
  assert.doesNotMatch(schema, /phase_31_16|candidate_list_state/i);
  assert.doesNotMatch(journal, /31_16/);
}

async function main() {
  stateCoverage();
  dynamicSearchCoverage();
  renderCoverage();
  await staticCoverage();
  console.log("Phase 31.16 concrete candidate-list UI and single-open interaction: PASS");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.16 concrete candidate-list UI and single-open interaction: FAIL");
  console.error(error);
  process.exitCode = 1;
});
