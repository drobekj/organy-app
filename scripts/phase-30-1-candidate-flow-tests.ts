import assert from "node:assert/strict";
import { createElement } from "react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { queryCandidatesFromData } from "../src/application/interaction-service";
import { InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import { CandidateLine, getCandidateLineViewModel } from "../src/planning-lifecycle/candidate-line";
import {
  buildCandidateQueryInput,
  PHASE_30_1_PREFERENCE_THRESHOLD,
  buildCanonicalCandidateUsages,
  candidateToSelectedSong,
  rehydrateCandidateFromSelectedSong,
  getCandidatePopupRows,
  getSelectedSongPresentation,
  planningCandidateRowReducer,
  planningLookupReducer,
  type PlanningCandidateEditableRow,
  type PlanningLookupState,
} from "../src/planning-lifecycle/candidate-flow";
import type { CandidateQueryResult, KnowledgeMapping, MelodyClass, SongPreference } from "../src/application/interaction-contracts";
import type { CatalogSong } from "../src/application/catalog";



const schemaSource = readFileSync("src/db/schema/index.ts", "utf8");
assert(schemaSource.includes('months: integer("months")'), "Drizzle schema must persist melody non-repetition months directly");
assert(existsSync("drizzle/0006_melody_non_repetition_months.sql"), "months persistence must have an additive DB migration");
const smokeSource = readFileSync("scripts/db-phase-30-1-smoke.ts", "utf8");
assert(smokeSource.includes("months"), "DB smoke must verify the persisted months column");

const melodyWindowConfig = new InMemoryInteractionRepository().getMelodyWindow();
assert.deepEqual(melodyWindowConfig, { months: 2 }, "melody non-repetition config must be one global symmetric month count");

const thresholdQuery = buildCandidateQueryInput({ serviceDate: "2026-07-18", serviceLanguage: "czech", candidateUsages: [] });
assert.equal(thresholdQuery.preferenceThreshold, PHASE_30_1_PREFERENCE_THRESHOLD, "Planning candidate queries must default to the Phase 30.1 threshold");
assert.equal(PHASE_30_1_PREFERENCE_THRESHOLD, 1);

const rehydrated = rehydrateCandidateFromSelectedSong({ songId: "rehydrated", language: "czech", number: "777", title: "Rehydrated title" }, "Loaded note");
assert.equal(rehydrated.songId, "rehydrated");
assert.equal(rehydrated.orderKey.includes("rehydrated"), true, "rehydrated rows must regain a complete CandidateQueryResult order key");
assert.equal(rehydrated.suppressedByMelodyWindow, false);
assert.equal(rehydrated.preferenceShade, "none", "text note must not affect rehydrated candidate preference metadata");
assert.equal(rehydrated.aggregatePreferenceScore, 0, "text note must not affect rehydrated candidate scoring metadata");

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
const serviceCandidates = queryCandidatesFromData(songs, [], new Set(), { antiphons: [], seasons: [], melodyClasses, melodyWindow: { months: 2 } }, { serviceDate: "2026-07-18", serviceLanguage: "czech", candidateUsages: [{ songId: "recent", serviceDate: "2026-07-01", source: "completed" }] });
assert.deepEqual(serviceCandidates.map((item) => item.songId), ["eligible"], "candidate service must return only eligible non-suppressed candidates");
assert(serviceCandidates.every((item) => !item.suppressedByMelodyWindow), "suppressed candidates must not leave the candidate service");

const queryContext = buildCandidateQueryInput({ serviceDate: "2026-07-18", serviceLanguage: "czech", organistPersonId: "organist-1", candidateUsages: [], antiphonKey: "service-antiphon", liturgicalSeasonKey: "service-season" });
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


const canonicalUsages = buildCanonicalCandidateUsages({
  currentPlanId: "plan-a",
  serviceDate: "2026-07-18",
  completedRecords: [{ id: "completed-1", serviceDate: "2026-07-01", rows: [{ songId: "completed-song" }] }],
  plans: [
    { id: "plan-a", status: "working", serviceDate: "2026-07-18", rows: [{ songId: "self-plan-song" }] },
    { id: "plan-b", status: "final", serviceDate: "2026-07-11", rows: [{ songId: "other-final-song" }] },
  ],
  currentRows: [
    { rowId: 1, songId: "active-row-song" },
    { rowId: 2, songId: "other-current-row-song" },
  ],
  activeRowId: 1,
});
assert.deepEqual(canonicalUsages.map((usage) => `${usage.source}:${usage.songId}`).sort(), ["completed:completed-song", "current:other-current-row-song", "final:other-final-song"].sort(), "canonical usages must include dated completed/final/current rows and exclude current plan self plus active row");
assert(canonicalUsages.every((usage) => usage.serviceDate), "all canonical candidate usages must be dated");

const domainSongs: CatalogSong[] = [
  { songId: "melody-a", language: "czech", number: "101A", title: "Shared Melody Alpha", active: true },
  { songId: "melody-r", language: "polish", number: "101R", title: "Shared Melody Repertoire", active: true },
  { songId: "melody-recent", language: "czech", number: "101Z", title: "Shared Melody Recent", active: true },
  { songId: "inactive-text-hit", language: "czech", number: "777", title: "Shared Melody Inactive", active: false },
  { songId: "low-pref", language: "czech", number: "201", title: "Shared Low Preference", active: true },
];
const domainPreferences: SongPreference[] = [{ profileId: "p1", songId: "melody-r", score: 6 }, { profileId: "p2", songId: "low-pref", score: 1 }];
const domainCandidates = queryCandidatesFromData(domainSongs, domainPreferences, new Set(["melody-r"]), {
  antiphons: [{ id: "a1", key: "service-antiphon", songId: "melody-a", synthetic: true }],
  seasons: [],
  melodyClasses: [{ id: "class-shared", label: "Shared class", songIds: ["melody-a", "melody-r"], synthetic: true }, { id: "class-recent", label: "Recent class", songIds: ["melody-recent", "recent-used"], synthetic: true }, { id: "class-low", label: "Low class", songIds: ["low-pref"], synthetic: true }],
  melodyWindow: { months: 2 },
}, { serviceDate: "2026-07-18", serviceLanguage: "mixed", organistPersonId: "organist-1", queryText: "Shared", preferenceThreshold: 3, antiphonKey: "service-antiphon", candidateUsages: [{ songId: "recent-used", serviceDate: "2026-07-01", source: "completed" }] });
assert.deepEqual(domainCandidates.map((candidate) => candidate.songId), ["melody-r"], "domain service must hard-filter before text, group one candidate per melody class, require repertoire and honor preference threshold");
assert.deepEqual(domainCandidates[0].equivalentNumbers.map((item) => `${item.number}:${item.repertoire}`), ["101A:false"], "equivalent numbers must be sorted after the repertoire primary candidate");
const candidateVm = getCandidateLineViewModel(domainCandidates[0]);
assert.equal(candidateVm.tone, "neutral");
assert(candidateVm.backgroundClass.includes("preference-high"), "view model must expose preference-driven background shading");
assert(candidateVm.accessibleMeaning.includes("neutral"), "preference/repertoire without season or antiphon must not force red/green signal meaning");
assert.equal(candidateVm.numberOptions[0].primary, true, "primary number must be first in the shared CandidateLine view model");


const futureWindowCandidates = queryCandidatesFromData([
  { songId: "future-equivalent", language: "czech", number: "303", title: "Future Equivalent", active: true },
  { songId: "future-eligible", language: "czech", number: "304", title: "Future Eligible", active: true },
], [], new Set(), { antiphons: [], seasons: [], melodyClasses: [{ id: "future-class", label: "Future class", songIds: ["future-equivalent", "future-used"], synthetic: true }], melodyWindow: { months: 2 } }, { serviceDate: "2026-07-18", serviceLanguage: "czech", candidateUsages: [{ songId: "future-used", serviceDate: "2026-09-17", source: "final" }] });
assert.deepEqual(futureWindowCandidates.map((candidate) => candidate.songId), ["future-eligible"], "symmetric two-calendar-month melody window must suppress future dated usages too");

const selectedFromCandidate = candidateToSelectedSong(domainCandidates[0]);
assert.deepEqual(selectedFromCandidate, { songId: "melody-r", language: "polish", number: "101R", title: "Shared Melody Repertoire" }, "selection must be derived directly from CandidateQueryResult without joining through songResults");

const canonicalQuery = buildCandidateQueryInput({ serviceDate: "2026-07-18", serviceLanguage: "mixed", candidateUsages: canonicalUsages, queryText: "101" });
assert(!("recentSongIds" in canonicalQuery), "candidate query context must not expose undated recentSongIds");
assert(!("recentSongs" in canonicalQuery), "candidate query context must not expose legacy recentSongs");


const primaryFirstVm = getCandidateLineViewModel({ ...visible, repertoire: false, equivalentNumbers: [{ songId: "eq-r", number: "099", repertoire: true }, { songId: "eq-a", number: "100", repertoire: false }] });
assert.equal(primaryFirstVm.numberOptions[0].primary, true, "primary number must remain first and be the only sticky number");
assert.equal(primaryFirstVm.numberOptions[1].repertoire, true, "repertoire equivalents must follow primary and be bold before other equivalents");
assert.equal(primaryFirstVm.numberOptions.filter((item) => item.primary).length, 1);

assert.equal(getCandidateLineViewModel({ ...visible, antiphonMatch: true, seasonMatch: false, signal: "antiphon" }).tone, "negative", "antiphon candidates must be red");
assert.equal(getCandidateLineViewModel({ ...visible, antiphonMatch: false, seasonMatch: true, signal: "season" }).tone, "positive", "season candidates must be green");
assert.equal(getCandidateLineViewModel({ ...visible, antiphonMatch: true, seasonMatch: true, signal: "antiphon" }).tone, "negative", "antiphon+season candidates must be red");

const popupMarkup = renderToStaticMarkup(createElement(CandidateLine, { candidate: visible, variant: "popup", onSelect: () => undefined }));
assert(!popupMarkup.includes("Detail"), "popup candidate line must be compact and must not render Detail");
assert(!popupMarkup.includes(" · preference"), "preference must not be visible text in popup CandidateLine");
const selectedMarkup = renderToStaticMarkup(createElement(CandidateLine, { candidate: visible, variant: "selected", note: "Editable note", onOpenDetail: () => undefined, onNoteChange: () => undefined }));
assert(selectedMarkup.includes("Detail"), "selected candidate line must render Detail on the first row");
assert(!selectedMarkup.includes(" · preference"), "preference must not be visible text in selected CandidateLine");
assert(selectedMarkup.includes("Editable note"), "selected candidate line must render the note as the second row");
assert.equal((selectedMarkup.match(/data-content-row=/g) ?? []).length, 2, "selected candidate line must render exactly two direct content rows");

console.log("Phase 30.1 candidate flow tests passed.");

function candidate(songId: string, suppressedByMelodyWindow: boolean): CandidateQueryResult {
  return { songId, language: "czech", number: songId === "visible" ? "101" : "102", title: `${songId} title`, equivalentNumbers: [], aggregatePreferenceScore: 0, antiphonMatch: false, seasonMatch: false, signal: "none", preferenceShade: "none", repertoire: false, suppressedByMelodyWindow, orderKey: songId };
}
