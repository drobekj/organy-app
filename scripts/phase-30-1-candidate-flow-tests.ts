import assert from "node:assert/strict";
import { getCandidatePopupRows, getSelectedSongPresentation, planningLookupReducer, type PlanningLookupState } from "../src/planning-lifecycle/candidate-flow";
import type { CandidateQueryResult } from "../src/application/interaction-contracts";

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

console.log("Phase 30.1 candidate flow tests passed.");

function candidate(songId: string, suppressedByMelodyWindow: boolean): CandidateQueryResult {
  return { songId, language: "czech", number: songId === "visible" ? "101" : "102", title: `${songId} title`, equivalentNumbers: [], aggregatePreferenceScore: 0, antiphonMatch: false, seasonMatch: false, signal: "none", preferenceShade: "none", repertoire: false, suppressedByMelodyWindow, orderKey: songId };
}
