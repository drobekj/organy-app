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
  assert.equal(independent.isCurrent(read), true); assert.equal(independent.snapshot().requests.recommendationRead.loading, true); assert.equal(independent.snapshot().requests.songSearch.loading, false);

  const context = new ReferenceAntiphonRecommendationUiState(identity);
  const beforeSelection = scopes.map((scope) => context.begin(scope));
  context.selectAntiphon(antiphon());
  for (const token of beforeSelection) assert.equal(context.isCurrent(token), false, `${token.scope} survived selection context`);
  const lateRead = context.begin("recommendationRead"); const lateSearch = context.begin("antiphonSearch");
  context.selectAntiphon(null);
  assert.equal(context.isCurrent(lateRead), false); assert.equal(context.isCurrent(lateSearch), false);

  context.selectAntiphon(antiphon());
  const actorRead = context.begin("recommendationRead"); const selectedBeforeActor = context.snapshot().selectedAntiphon;
  context.changeRuntimeActor("db", "priest-1", "priest");
  assert.equal(context.isCurrent(actorRead), false); assert.equal(context.snapshot().selectedAntiphon?.id, selectedBeforeActor?.id);
  const runtimeRead = context.begin("recommendationRead"); context.changeRuntimeActor("memory", "priest-1", "priest");
  assert.equal(context.isCurrent(runtimeRead), false); assert.equal(context.snapshot().selectedAntiphon, null);

  const mutation = new ReferenceAntiphonRecommendationUiState(identity);
  mutation.selectAntiphon(antiphon());
  const readToken = mutation.begin("recommendationRead"); mutation.complete(readToken, { recommendation: recommendation("czech:1") });
  mutation.selectSong(song("polish:1"));
  const failed = mutation.begin("mutation"); mutation.fail(failed, "save failed");
  assert.equal(mutation.snapshot().recommendation?.recommendedSong?.referenceSongId, "czech:1");
  assert.equal(mutation.snapshot().selectedSong?.id, "polish:1"); assert.equal(mutation.snapshot().saved, false);
  const success = mutation.begin("mutation"); const serverResult = recommendation("polish:1"); mutation.mutationSucceeded(success, serverResult);
  assert.deepEqual(mutation.snapshot().recommendation, serverResult); assert.equal(mutation.snapshot().selectedSong, null); assert.equal(mutation.snapshot().songs.length, 0); assert.equal(mutation.snapshot().saved, true);
}

function memoryZeroCallCoverage() {
  let calls = 0;
  const factories = { antiphons: () => { calls++; return {} as never; }, catalog: () => { calls++; return {} as never; }, recommendations: () => { calls++; return {} as never; } };
  assert.equal(createRecommendationPanelClients("memory", { userId: "x", role: "priest" }, factories), null);
  assert.equal(calls, 0);
}

function render(runtime: "memory" | "db", role: "priest" | "organist" | "admin" | "congregationMember", snapshot: RecommendationUiSnapshot, antiphonSearch = "", songSearch = "") {
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
  const nullToken = initial.begin("recommendationRead"); initial.complete(nullToken, { recommendation: recommendation(null) });
  assert.match(render("db", "priest", initial.snapshot()), /No recommended song/);

  const existing = initial.begin("recommendationRead"); initial.complete(existing, { recommendation: recommendation("czech:1") });
  const readOnly = render("db", "priest", initial.snapshot());
  for (const text of ["1 · Song czech:1", "language", "czech", "canonicalNumber", "referenceSongId", "czech:1"]) assert.match(readOnly, new RegExp(text));
  assert.doesNotMatch(readOnly, /Set recommendation|Replace recommendation|Remove recommendation/);

  const admin = new ReferenceAntiphonRecommendationUiState(identity); admin.selectAntiphon(antiphon());
  admin.complete(admin.begin("recommendationRead"), { recommendation: recommendation(null) });
  let markup = render("db", "admin", admin.snapshot());
  assert.match(markup, /Set recommendation/); assert.match(markup, /disabled=""[^>]*>Set recommendation/);
  admin.selectSong(song("czech:1")); markup = render("db", "admin", admin.snapshot()); assert.doesNotMatch(markup, /disabled=""[^>]*>Set recommendation/);
  admin.complete(admin.begin("recommendationRead"), { recommendation: recommendation("czech:1") });
  markup = render("db", "admin", admin.snapshot()); assert.match(markup, /disabled=""[^>]*>Replace recommendation/); assert.match(markup, /Remove recommendation/);
  admin.selectSong(song("polish:1")); markup = render("db", "admin", admin.snapshot()); assert.doesNotMatch(markup, /disabled=""[^>]*>Replace recommendation/);
  admin.begin("mutation"); markup = render("db", "admin", admin.snapshot()); assert.match(markup, /disabled=""[^>]*>Replace recommendation/); assert.match(markup, /disabled=""[^>]*>Remove recommendation/);
}

async function integrationCoverage() {
  const planning = await readFile(new URL("../app/planning-lifecycle-client.tsx", import.meta.url), "utf8");
  assert.equal((planning.match(/<ReferenceAntiphonRecommendationPanel\b/g) ?? []).length, 1);
  assert.match(planning, /<ReferenceAntiphonRecommendationPanel runtime=\{runtimeMode\} actor=\{activeActor\} \/>/);
  assert.doesNotMatch(planning, /DbReferenceAntiphonRecommendationClient|ReferenceAntiphonRecommendationUiState/);
  const panel = await readFile(new URL("../app/reference-antiphon-recommendation-panel.tsx", import.meta.url), "utf8");
  for (const client of ["DbReferenceAntiphonClient", "DbReferenceCatalogClient", "DbReferenceAntiphonRecommendationClient"]) assert.ok(panel.includes(client));
  const transport = await readFile(new URL("../src/application/reference-antiphon-recommendation-client.ts", import.meta.url), "utf8");
  assert.match(transport, /getReferenceAntiphonRecommendation/); assert.match(transport, /setReferenceAntiphonRecommendation/);
}

async function main() {
  stateMachineCoverage(); memoryZeroCallCoverage(); renderCoverage(); await integrationCoverage();
  console.log("Phase 31.10B behavioral and render integration tests: PASS");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
