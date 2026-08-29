import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createRecommendationPanelClients,
  ReferenceAntiphonRecommendationPanelView,
} from "../app/reference-antiphon-recommendation-panel";
import {
  ReferenceAntiphonRecommendationUiState,
  type RecommendationUiIdentity,
  type RecommendationUiRole,
  type RecommendationUiScope,
  type RecommendationUiSnapshot,
} from "../src/application/reference-antiphon-recommendation-ui-state";

const identity: RecommendationUiIdentity = { runtimeMode: "db", userId: "admin-1", role: "admin", selectedAntiphonId: null };
const antiphon = (id = "czech:800") => ({ id, language: "czech" as const, canonicalNumber: Number(id.split(":")[1]), displayNumber: id.split(":")[1], title: `Antiphon ${id}`, sourceUrl: "https://example.test" });
const song = (id = "czech:1") => ({ id, language: id.startsWith("polish:") ? "polish" as const : "czech" as const, canonicalNumber: Number(id.split(":")[1]), displayNumber: id.split(":")[1], title: `Song ${id}` });
const recommendation = (songId: string | null) => ({ antiphonId: "czech:800", recommendedSong: songId ? { referenceSongId: songId, language: songId.startsWith("polish:") ? "polish" as const : "czech" as const, canonicalNumber: Number(songId.split(":")[1]), displayNumber: songId.split(":")[1], title: `Song ${songId}` } : null });
const noops = { setAntiphonSearch: (_: string) => undefined, setSongSearch: (_: string) => undefined, chooseAntiphon: () => undefined, deselectAntiphon: () => undefined, chooseSong: () => undefined, mutate: () => undefined };

function stateMachineCoverage() {
  const scopes: RecommendationUiScope[] = ["antiphonSearch", "recommendationRead", "songSearch", "mutation"];
  for (const scope of scopes) {
    const state = new ReferenceAntiphonRecommendationUiState(identity);
    const old = state.begin(scope); const current = state.begin(scope);
    assert.deepEqual(Object.keys(old).sort(), ["context", "generation", "scope"]);
    assert.equal(state.isCurrent(old), false); assert.equal(state.isCurrent(current), true);
  }

  const independent = new ReferenceAntiphonRecommendationUiState(identity);
  const read = independent.begin("recommendationRead"); const search = independent.begin("songSearch");
  independent.complete(search, { songs: [song()] });
  assert.equal(independent.isCurrent(read), true);
  assert.equal(independent.snapshot().requests.recommendationRead.loading, true);
  assert.equal(independent.snapshot().requests.songSearch.loading, false);

  const context = new ReferenceAntiphonRecommendationUiState(identity);
  const beforeSelection = scopes.map((scope) => context.begin(scope));
  context.selectAntiphon(antiphon());
  for (const token of beforeSelection) assert.equal(context.isCurrent(token), false, `${token.scope} survived selection context`);
  const lateRead = context.begin("recommendationRead"); const lateSearch = context.begin("antiphonSearch");
  context.selectAntiphon(null);
  assert.equal(context.isCurrent(lateRead), false); assert.equal(context.isCurrent(lateSearch), false);

  const aToB = new ReferenceAntiphonRecommendationUiState(identity);
  aToB.selectAntiphon(antiphon("czech:800"));
  const readA = aToB.begin("recommendationRead"); const targetA = aToB.begin("songSearch");
  aToB.selectAntiphon(antiphon("czech:801"));
  assert.equal(aToB.isCurrent(readA), false); assert.equal(aToB.isCurrent(targetA), false);
  assert.equal(aToB.snapshot().selectedAntiphon?.id, "czech:801");

  const stableSelection = new ReferenceAntiphonRecommendationUiState(identity);
  stableSelection.selectAntiphon(antiphon("czech:800"));
  stableSelection.complete(stableSelection.begin("antiphonSearch"), { antiphons: [antiphon("czech:801")] });
  assert.equal(stableSelection.snapshot().selectedAntiphon?.id, "czech:800", "search response changed selection");

  const actor = new ReferenceAntiphonRecommendationUiState(identity);
  actor.selectAntiphon(antiphon());
  actor.complete(actor.begin("recommendationRead"), { recommendation: recommendation("czech:1") });
  actor.complete(actor.begin("songSearch"), { songs: [song("polish:1")] });
  actor.selectSong(song("polish:1"));
  const actorTokens = scopes.map((scope) => actor.begin(scope));
  actor.changeRuntimeActor("db", "admin-2", "admin");
  for (const token of actorTokens) assert.equal(actor.isCurrent(token), false, `${token.scope} survived actor context`);
  assert.equal(actor.snapshot().selectedAntiphon?.id, "czech:800");
  assert.equal(actor.snapshot().recommendation, null); assert.equal(actor.snapshot().songs.length, 0); assert.equal(actor.snapshot().selectedSong, null);
  const roleMutation = actor.begin("mutation"); actor.changeRuntimeActor("db", "admin-2", "priest");
  assert.equal(actor.isCurrent(roleMutation), false); assert.equal(actor.snapshot().selectedAntiphon?.id, "czech:800");
  const runtimeRead = actor.begin("recommendationRead"); actor.changeRuntimeActor("memory", "admin-2", "priest");
  assert.equal(actor.isCurrent(runtimeRead), false); assert.equal(actor.snapshot().selectedAntiphon, null);

  const mutation = new ReferenceAntiphonRecommendationUiState(identity);
  mutation.selectAntiphon(antiphon());
  mutation.complete(mutation.begin("recommendationRead"), { recommendation: recommendation("czech:1") });
  mutation.selectSong(song("polish:1"));
  const failed = mutation.begin("mutation");
  assert.equal(mutation.snapshot().recommendation?.recommendedSong?.referenceSongId, "czech:1", "mutation was optimistic");
  assert.equal(mutation.snapshot().selectedSong?.id, "polish:1");
  mutation.fail(failed, "save failed");
  assert.equal(mutation.snapshot().recommendation?.recommendedSong?.referenceSongId, "czech:1");
  assert.equal(mutation.snapshot().selectedSong?.id, "polish:1"); assert.equal(mutation.snapshot().saved, false);
  const staleTargetSearch = mutation.begin("songSearch");
  const success = mutation.begin("mutation"); const serverResult = recommendation("polish:1"); mutation.mutationSucceeded(success, serverResult);
  assert.deepEqual(mutation.snapshot().recommendation, serverResult);
  assert.equal(mutation.snapshot().selectedSong, null); assert.equal(mutation.snapshot().songs.length, 0); assert.equal(mutation.snapshot().saved, true);
  assert.equal(mutation.isCurrent(staleTargetSearch), false, "successful mutation retained an in-flight target search");
  assert.equal(mutation.complete(staleTargetSearch, { songs: [song("czech:2")] }), false, "late target search repopulated cleared results");
  assert.equal(mutation.snapshot().songs.length, 0);
}

function memoryZeroCallCoverage() {
  let calls = 0;
  const factories = { antiphons: () => { calls++; return {} as never; }, catalog: () => { calls++; return {} as never; }, recommendations: () => { calls++; return {} as never; } };
  assert.equal(createRecommendationPanelClients("memory", { userId: "x", role: "priest" }, factories), null);
  assert.equal(calls, 0);
}

function render(runtime: "memory" | "db", role: RecommendationUiRole, snapshot: RecommendationUiSnapshot, antiphonSearch = "", songSearch = "") {
  return renderToStaticMarkup(<ReferenceAntiphonRecommendationPanelView runtime={runtime} role={role} snapshot={snapshot} antiphonSearch={antiphonSearch} songSearch={songSearch} {...noops} />);
}
function renderCoverage() {
  const initial = new ReferenceAntiphonRecommendationUiState(identity);
  const memory = render("memory", "priest", initial.snapshot());
  assert.match(memory, /Antiphon recommendations are available only in DB runtime\./); assert.doesNotMatch(memory, /Find antiphon/);
  assert.match(render("db", "priest", initial.snapshot()), /No antiphon selected/);

  initial.complete(initial.begin("antiphonSearch"), { antiphons: [antiphon()] });
  const results = render("db", "priest", initial.snapshot(), "800");
  assert.match(results, />800 · Antiphon czech:800</); assert.doesNotMatch(results, /Antiphon czech:800 \(czech\)/);

  initial.selectAntiphon(antiphon());
  assert.match(render("db", "priest", initial.snapshot()), /Loading recommendation…/);
  const errorState = new ReferenceAntiphonRecommendationUiState(identity); errorState.selectAntiphon(antiphon());
  errorState.fail(errorState.begin("recommendationRead"), "read failed");
  assert.match(render("db", "priest", errorState.snapshot()), /Recommendation unavailable: read failed/);
  initial.complete(initial.begin("recommendationRead"), { recommendation: recommendation(null) });
  assert.match(render("db", "priest", initial.snapshot()), /No recommended song/);

  initial.complete(initial.begin("recommendationRead"), { recommendation: recommendation("czech:1") });
  for (const role of ["priest", "organist", "congregationMember"] as const) {
    const readOnly = render("db", role, initial.snapshot());
    for (const text of ["1 · Song czech:1", "language", "czech", "canonicalNumber", "referenceSongId", "czech:1"]) assert.match(readOnly, new RegExp(text));
    assert.doesNotMatch(readOnly, /Set recommendation|Replace recommendation|Remove recommendation/);
  }

  const admin = new ReferenceAntiphonRecommendationUiState(identity); admin.selectAntiphon(antiphon());
  admin.complete(admin.begin("recommendationRead"), { recommendation: recommendation(null) });
  let markup = render("db", "admin", admin.snapshot());
  assert.match(markup, /Set recommendation/); assert.match(markup, /disabled=""[^>]*>Set recommendation/);
  admin.selectSong(song("czech:1")); markup = render("db", "admin", admin.snapshot()); assert.doesNotMatch(markup, /disabled=""[^>]*>Set recommendation/);
  admin.complete(admin.begin("recommendationRead"), { recommendation: recommendation("czech:1") });
  markup = render("db", "admin", admin.snapshot()); assert.match(markup, /disabled=""[^>]*>Replace recommendation/); assert.match(markup, /Remove recommendation/);
  admin.selectSong(song("polish:1")); markup = render("db", "admin", admin.snapshot()); assert.doesNotMatch(markup, /disabled=""[^>]*>Replace recommendation/);
  const pending = admin.begin("mutation"); markup = render("db", "admin", admin.snapshot());
  assert.match(markup, /disabled=""[^>]*>Replace recommendation/); assert.match(markup, /disabled=""[^>]*>Remove recommendation/); assert.match(markup, /Saving…/);
  admin.mutationSucceeded(pending, recommendation("polish:1")); markup = render("db", "admin", admin.snapshot());
  assert.match(markup, /Saved\./); assert.match(markup, /polish:1/);
  const remove = admin.begin("mutation"); admin.mutationSucceeded(remove, recommendation(null));
  assert.match(render("db", "admin", admin.snapshot()), /No recommended song/);
}

async function integrationCoverage() {
  const planning = await readFile(new URL("../app/planning-lifecycle-client.tsx", import.meta.url), "utf8");
  assert.equal((planning.match(/<ReferenceAntiphonRecommendationPanel\b/g) ?? []).length, 0, "Catalog step 2 must not remount the legacy recommendation mutation UI inside the read-only Catalog workspace");
  assert.match(planning, /<CatalogWorkspace\b/, "Catalog step 2 must render the unified read-only Catalog workspace");
  assert.match(planning, /DbReferenceAntiphonRecommendationClient/, "Stage 4 must load the current Antiphon Reference song for the shared Planning lookup.");
  assert.doesNotMatch(planning, /ReferenceAntiphonRecommendationUiState/, "Planning must not remount the legacy recommendation state machine.");
  const panel = await readFile(new URL("../app/reference-antiphon-recommendation-panel.tsx", import.meta.url), "utf8");
  for (const client of ["DbReferenceAntiphonClient", "DbReferenceCatalogClient", "DbReferenceAntiphonRecommendationClient"]) assert.ok(panel.includes(client));
  assert.match(panel, /if \(changed\) setSongSearch\(""\)/, "actor/runtime context did not clear target query");
  const transport = await readFile(new URL("../src/application/reference-antiphon-recommendation-client.ts", import.meta.url), "utf8");
  assert.match(transport, /getReferenceAntiphonRecommendation/); assert.match(transport, /setReferenceAntiphonRecommendation/);
}

async function main() {
  stateMachineCoverage(); memoryZeroCallCoverage(); renderCoverage(); await integrationCoverage();
  console.log("Phase 31.10B behavioral and render integration tests: PASS");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
