import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { ReferenceAntiphonRecommendationPanel } from "../app/reference-antiphon-recommendation-panel";
import { ReferenceAntiphonRecommendationUiState, type RecommendationUiScope } from "../src/application/reference-antiphon-recommendation-ui-state";

const antiphon = (id: string) => ({ id, language: "czech" as const, canonicalNumber: Number(id.split(":")[1]), displayNumber: id.split(":")[1], title: `Antiphon ${id}`, sourceUrl: "https://example.test" });
const song = (id: string) => ({ id, language: "czech" as const, canonicalNumber: Number(id.split(":")[1]), displayNumber: id.split(":")[1], title: `Song ${id}` });

function staleResponseCoverage() {
  const scopes: RecommendationUiScope[] = ["antiphonSearch", "recommendationRead", "songSearch", "mutation"];
  for (const scope of scopes) {
    const state = new ReferenceAntiphonRecommendationUiState(); const old = state.begin(scope); const current = state.begin(scope);
    assert.equal(state.isCurrent(old), false, `${scope} accepted an older response`); assert.equal(state.isCurrent(current), true);
  }
  const independent = new ReferenceAntiphonRecommendationUiState(); const read = independent.begin("recommendationRead"); independent.begin("songSearch"); assert.equal(independent.isCurrent(read), true, "independent search invalidated read");
  for (const context of ["actor", "role", "runtime"] as const) { const state = new ReferenceAntiphonRecommendationUiState(); const tokens = scopes.map((scope) => state.begin(scope)); state.contextChanged(); for (const token of tokens) assert.equal(state.isCurrent(token), false, `${context} retained ${token.scope}`); }
  const selection = new ReferenceAntiphonRecommendationUiState(); const antiphonSearch = selection.begin("antiphonSearch"); const readBefore = selection.begin("recommendationRead"); const songSearch = selection.begin("songSearch"); const mutation = selection.begin("mutation"); selection.selectAntiphon(antiphon("czech:858")); assert.equal(selection.isCurrent(antiphonSearch), true); for (const token of [readBefore, songSearch, mutation]) assert.equal(selection.isCurrent(token), false, `antiphon selection retained ${token.scope}`);
  const target = new ReferenceAntiphonRecommendationUiState(); const pendingMutation = target.begin("mutation"); target.selectSong(song("czech:1")); assert.equal(target.isCurrent(pendingMutation), false, "song selection retained mutation");
  const completion = new ReferenceAntiphonRecommendationUiState(); const old = completion.begin("antiphonSearch"); const current = completion.begin("antiphonSearch"); assert.equal(completion.complete(current, { antiphons: [antiphon("czech:859")] }), true); assert.equal(completion.complete(old, { antiphons: [antiphon("czech:858")] }), false); assert.equal(completion.snapshot().antiphons[0].id, "czech:859");
}

async function renderIntegrationCoverage() {
  const memory = renderToStaticMarkup(<ReferenceAntiphonRecommendationPanel runtime="memory" actor={{ userId: "demo", role: "priest" }} />);
  assert.match(memory, /Antiphon recommendation/); assert.match(memory, /Recommendations are available only in DB runtime\./); assert.doesNotMatch(memory, /Find antiphon/);
  const planning = await readFile(new URL("../app/planning-lifecycle-client.tsx", import.meta.url), "utf8");
  assert.equal((planning.match(/<ReferenceAntiphonRecommendationPanel\b/g) ?? []).length, 1, "panel must render exactly once");
  assert.match(planning, /<ReferenceAntiphonRecommendationPanel runtime=\{runtimeMode\} actor=\{activeActor\} \/>/);
  const panel = await readFile(new URL("../app/reference-antiphon-recommendation-panel.tsx", import.meta.url), "utf8");
  for (const text of ["Loading antiphons…", "No antiphons match this search.", "Loading recommendation…", "No recommendation.", "Loading Reference songs…", "No Reference songs match this search.", "Set", "Replace", "Remove", "Saving…", "Saved.", "Recommendation unavailable:"]) assert.ok(panel.includes(text), `missing exact UI state: ${text}`);
  for (const client of ["DbReferenceAntiphonClient", "MemoryReferenceAntiphonClient", "DbReferenceCatalogClient", "MemoryReferenceCatalogClient", "DbReferenceAntiphonRecommendationClient"]) assert.ok(panel.includes(client));
  assert.doesNotMatch(planning, /DbReferenceAntiphonRecommendationClient|ReferenceAntiphonRecommendationUiState/, "planning component owns recommendation behavior");
}

async function main() {
  staleResponseCoverage();
  await renderIntegrationCoverage();
  console.log("Phase 31.10B behavioral and render integration tests: PASS");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
