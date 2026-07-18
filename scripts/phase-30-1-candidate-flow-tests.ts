import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { queryCandidatesFromData } from "../src/application/interaction-service";
import { CandidateLine } from "../src/planning-lifecycle/candidate-line";
import {
  buildCandidateQueryInput,
  getCandidatePopupRows,
  getSelectedSongPresentation,
  planningCandidateRowReducer,
  planningLookupReducer,
  type PlanningCandidateEditableRow,
  type PlanningLookupState,
} from "../src/planning-lifecycle/candidate-flow";
import type { CandidateQueryResult, KnowledgeMapping, MelodyClass, SongPreference } from "../src/application/interaction-contracts";
import type { CatalogSong } from "../src/application/catalog";

const visible = candidate("visible", false);
const suppressed = candidate("suppressed", true);

const rows = getCandidatePopupRows([suppressed, visible]);
assert.deepEqual(rows.map((row) => row.songId), ["visible"], "suppressed candidates must be removed from popup results");
assert(rows.every((row) => !(row.actions as readonly string[]).includes("detail")), "candidate popup rows must not expose Detail actions");

const selected = getSelectedSongPresentation(visible, "Manual row note");
assert.equal(selected.lines.length, 2, "selected song presentation must have exactly two content rows");
assert.equal(selected.lines[0].kind, "candidate");
assert.equal(selected.lines[0].detailAction, true, "selected first row keeps the candidate copy with Detail on the right");
assert.equal(selected.lines[1].kind, "note");
assert.equal(selected.lines[1].text, "Manual row note");

const initial: PlanningLookupState = { status: "idle" };
const lookup = planningLookupReducer(initial, { type: "lookupChanged", text: "101" });
assert.equal(lookup.status, "lookupActive");
const selectedState = planningLookupReducer(lookup, { type: "candidateSelected", candidate: visible, note: "Manual row note" });
assert.equal(selectedState.status, "selected");
assert.equal(selectedState.presentation.lines.length, 2);
const detail = planningLookupReducer(selectedState, { type: "detailOpened", songId: "visible", returnRowId: 7 });
assert.deepEqual(detail.detailNavigation, { songId: "visible", returnRowId: 7 });
const returned = planningLookupReducer(detail, { type: "detailReturned" });
assert.equal(returned.detailNavigation, undefined);

const songs: CatalogSong[] = [
  { songId: "recent-equivalent", language: "czech", number: "100", title: "Recent Equivalent", active: true },
  { songId: "eligible", language: "czech", number: "101", title: "Eligible", active: true },
];
const melodyClasses: MelodyClass[] = [{ id: "class-a", label: "Class A", songIds: ["recent", "recent-equivalent"], synthetic: true }];
const serviceCandidates = queryCandidatesFromData(songs, [], new Set(), { antiphons: [], seasons: [], melodyClasses, melodyWindow: { daysBefore: 60, daysAfter: 0 } }, { serviceDate: "2026-07-18", serviceLanguage: "czech", recentSongs: [{ songId: "recent", serviceDate: "2026-07-01" }] });
assert.deepEqual(serviceCandidates.map((item) => item.songId), ["eligible"], "candidate service must return only eligible non-suppressed candidates");
assert(serviceCandidates.every((item) => !item.suppressedByMelodyWindow), "suppressed candidates must not leave the candidate service");

const queryContext = buildCandidateQueryInput({ serviceDate: "2026-07-18", serviceLanguage: "czech", organistPersonId: "organist-1", recentSongs: [], antiphonKey: "service-antiphon", liturgicalSeasonKey: "service-season" });
assert.equal(queryContext.antiphonKey, "service-antiphon");
assert.equal(queryContext.liturgicalSeasonKey, "service-season");
assert(!JSON.stringify(queryContext).includes("synthetic-entry"), "lookup query context must not inject hard-coded antiphon values");
assert(!JSON.stringify(queryContext).includes("synthetic-advent"), "lookup query context must not inject hard-coded season values");

const confirmed: PlanningCandidateEditableRow = { id: 1, songSearch: "czech 101 — Visible", selectedSong: { songId: "visible", language: "czech", number: "101", title: "Visible" }, selectedCandidate: visible, note: "Keep this note", lookupOpen: false };
const invalidLookup = planningCandidateRowReducer(confirmed, { type: "lookupChanged", text: "bad temporary text" });
assert.equal(invalidLookup.selectedSong?.songId, "visible", "invalid lookup must keep the confirmed song snapshot");
assert.equal(invalidLookup.selectedCandidate?.songId, "visible", "invalid lookup must keep the confirmed candidate snapshot");
const escaped = planningCandidateRowReducer(invalidLookup, { type: "lookupCancelled" });
assert.equal(escaped.songSearch, "czech 101 — Visible");
assert.equal(escaped.selectedSong?.songId, "visible");
assert.equal(escaped.lookupOpen, false);
const switchedAway = planningCandidateRowReducer(invalidLookup, { type: "rowDeactivated" });
assert.equal(switchedAway.songSearch, "czech 101 — Visible", "row deactivation must restore the confirmed lookup label");

const popupMarkup = renderToStaticMarkup(createElement(CandidateLine, { candidate: visible, variant: "popup", onSelect: () => undefined }));
assert(!popupMarkup.includes("Detail"), "popup candidate line must be compact and must not render Detail");
const selectedMarkup = renderToStaticMarkup(createElement(CandidateLine, { candidate: visible, variant: "selected", note: "Editable note", onOpenDetail: () => undefined, onNoteChange: () => undefined }));
assert(selectedMarkup.includes("Detail"), "selected candidate line must render Detail on the first row");
assert(selectedMarkup.includes("Editable note"), "selected candidate line must render the note as the second row");
assert.equal((selectedMarkup.match(/data-content-row=/g) ?? []).length, 2, "selected candidate line must render exactly two direct content rows");

console.log("Phase 30.1 candidate flow tests passed.");

function candidate(songId: string, suppressedByMelodyWindow: boolean): CandidateQueryResult {
  return { songId, language: "czech", number: songId === "visible" ? "101" : "102", title: `${songId} title`, equivalentNumbers: [], aggregatePreferenceScore: 0, antiphonMatch: false, seasonMatch: false, signal: "none", preferenceShade: "none", repertoire: false, suppressedByMelodyWindow, orderKey: songId };
}
