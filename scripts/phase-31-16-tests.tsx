import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateQueryResult } from "../src/application/interaction-contracts";
import {
  CandidateCombobox,
  candidateIndexForKey,
  getCandidateEmptyMessage,
  getInitialCandidateIndex,
  getUnavailableCurrentReason,
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
  assert.match(getUnavailableCurrentReason({ songId: "polish:38", language: "polish", number: "38" }, "czech"), /polish song in a czech service/);
  assert.equal(isCandidateSelectable(occupied), false);

  const rows: PlanningCandidateEditableRow[] = [
    { id: 1, songSearch: "temporary", selectedSong: { songId: "czech:29", language: "czech", number: "29", title: "Current" }, selectedCandidate: available, note: "keep", lookupOpen: true },
    { id: 2, songSearch: "czech 421 — Equivalent", selectedSong: { songId: "czech:421", language: "czech", number: "421", title: "Equivalent" }, selectedCandidate: equivalent, note: "second", lookupOpen: false },
  ];
  const opened = openSingleCandidateRow(rows, 2);
  assert.equal(opened[0].lookupOpen, false);
  assert.equal(opened[0].songSearch, "czech 29 — Current", "opening another row must cancel and restore the prior temporary search");
  assert.equal(opened[1].lookupOpen, true);
  assert.equal(opened[1].songSearch, "", "browse mode must not query the confirmed display label");
  const typedThenCleared = planningCandidateRowReducer(
    planningCandidateRowReducer(opened[1], { type: "lookupChanged", text: "421" }),
    { type: "lookupChanged", text: "" },
  );
  assert.equal(typedThenCleared.lookupOpen, true, "clearing a live query must return to open browse mode");
  const switchedAfterClear = openSingleCandidateRow([opened[0], typedThenCleared], 1);
  assert.equal(switchedAfterClear[1].songSearch, "czech 421 — Equivalent", "switching after a cleared query must restore the confirmed label");

  const replaced = planningCandidateRowReducer(rows[0], {
    type: "candidateSelected",
    song: { songId: equivalent.songId, language: equivalent.language, number: equivalent.number, title: equivalent.title },
    candidate: equivalent,
  });
  assert.equal(replaced.note, "keep", "replacement must preserve the row note");
  const cleared = planningCandidateRowReducer(replaced, { type: "songCleared" });
  assert.equal(cleared.note, "keep", "clear must preserve the row note");
}

function renderCoverage() {
  const common = {
    rowId: 1,
    rowLabel: "Row 1",
    open: true,
    value: "",
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
  const html = renderToStaticMarkup(<CandidateCombobox {...common} />);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /role="listbox"/);
  assert.equal((html.match(/role="option"/g) ?? []).length, 3, "one backend candidate must render as one concrete option");
  assert.ok(html.indexOf("Current exact song") < html.indexOf("Same melody equivalent"));
  assert.ok(html.indexOf("Same melody equivalent") < html.indexOf("Occupied Polish equivalent"), "UI must preserve backend ordering");
  assert.match(html, /Currently selected/);
  const equivalentSlice = html.slice(html.indexOf("Same melody equivalent"), html.indexOf("Occupied Polish equivalent"));
  assert.doesNotMatch(equivalentSlice, /Currently selected/, "equivalent song must not receive the exact current marker");
  assert.match(html, /aria-disabled="true"/);
  assert.doesNotMatch(html, /<button[^>]*disabled/, "disabled candidates remain semantic options rather than nested disabled controls");
  assert.match(html, /Row 2 and Row 3/);
  assert.doesNotMatch(html, /All matching melodies are already occupied/, "mixed available and occupied results must not become an empty state");

  const loadingHtml = renderToStaticMarkup(<CandidateCombobox {...common} candidates={[]} loading={true} />);
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /Loading candidates/);
  const browseEmpty = renderToStaticMarkup(<CandidateCombobox {...common} candidates={[]} />);
  assert.match(browseEmpty, /No songs satisfy/);
  const searchEmpty = renderToStaticMarkup(<CandidateCombobox {...common} value="missing" candidates={[]} />);
  assert.match(searchEmpty, /No candidate matches/);
  const errorHtml = renderToStaticMarkup(<CandidateCombobox {...common} candidates={[]} error="Candidate lookup failed." />);
  assert.match(errorHtml, /Candidate lookup failed/);
  assert.match(errorHtml, />Retry</);
  assert.match(errorHtml, />Cancel</);
  const unavailableHtml = renderToStaticMarkup(
    <CandidateCombobox
      {...common}
      selectedSong={{ songId: "polish:999", language: "polish", number: "999", title: "Retained invalid" }}
      candidates={[available]}
      serviceLanguage="czech"
    />,
  );
  assert.match(unavailableHtml, /Currently selected/);
  assert.match(unavailableHtml, /polish song in a czech service/i);
  const searchedHtml = renderToStaticMarkup(
    <CandidateCombobox
      {...common}
      value="different search"
      selectedSong={{ songId: "polish:999", language: "polish", number: "999", title: "Retained invalid" }}
      candidates={[available]}
      serviceLanguage="czech"
    />,
  );
  assert.doesNotMatch(searchedHtml, /Not available because/, "search mismatch must not be presented as a hard-filter failure");
  const allOccupiedHtml = renderToStaticMarkup(<CandidateCombobox {...common} selectedSong={undefined} candidates={[occupied]} />);
  assert.match(allOccupiedHtml, /All matching melodies are already occupied/);
}

async function staticCoverage() {
  const [client, component, flow, schema, journal] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/planning-lifecycle/candidate-list.tsx", "utf8"),
    readFile("src/planning-lifecycle/candidate-flow.ts", "utf8"),
    readFile("src/db/schema/index.ts", "utf8"),
    readFile("drizzle/meta/_journal.json", "utf8"),
  ]);
  assert.match(client, /openCandidateRowId/);
  assert.match(client, /openCandidateRowId === null \|\| openCandidateRowId === row\.id/, "unrelated row focus must not detach the open list from its query state");
  assert.match(client, /CandidateCombobox/);
  assert.match(client, /preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD/);
  assert.match(client, /const PHASE_30_1_PREFERENCE_THRESHOLD = 0/);
  assert.doesNotMatch(client, /getCandidatePopupRows\(candidateResults/);
  assert.match(component, /aria-activedescendant/);
  assert.match(component, /ArrowDown/);
  assert.match(component, /scrollOptionInsideList/);
  assert.match(component, /role="option"/);
  assert.match(flow, /lookupOpened/);
  assert.doesNotMatch(schema, /phase_31_16|candidate_list_state/i);
  assert.doesNotMatch(journal, /31_16/);
}

async function main() {
  stateCoverage();
  renderCoverage();
  await staticCoverage();
  console.log("Phase 31.16 concrete candidate-list UI and single-open interaction: PASS");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.16 concrete candidate-list UI and single-open interaction: FAIL");
  console.error(error);
  process.exitCode = 1;
});
