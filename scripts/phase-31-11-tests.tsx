import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceContextReferenceAntiphonFieldView } from "../app/service-context-reference-antiphon-field";
import {
  ServiceContextReferenceAntiphonUiState,
  type ServiceContextAntiphonSearchIdentity,
} from "../src/application/service-context-reference-antiphon-ui-state";
import type { ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import type { ServiceAntiphonReference } from "../src/planning-lifecycle";

const identity: ServiceContextAntiphonSearchIdentity = { runtimeMode: "db", contextKey: "new:1", editable: true };
const record = (number: number): ReferenceAntiphonRecord => ({
  id: `czech:${number}`,
  language: "czech",
  canonicalNumber: number,
  displayNumber: String(number),
  title: `Antiphon ${number}`,
  sourceUrl: `https://www.evangelickykancional.cz/pisen/${number}/antiphon-${number}`,
});
const snapshot = (number: number): ServiceAntiphonReference => {
  const value = record(number);
  return { id: value.id, displayNumber: value.displayNumber, title: value.title, sourceUrl: value.sourceUrl };
};

function staleResponseCoverage() {
  const state = new ServiceContextReferenceAntiphonUiState(identity);
  const older = state.begin();
  const newer = state.begin();
  assert.equal(state.isCurrent(older), false, "older search survived a newer search");
  assert.equal(state.complete(older, [record(800)]), false);
  assert.equal(state.complete(newer, [record(801)]), true);
  assert.deepEqual(state.snapshot().records.map((item) => item.id), ["czech:801"]);

  const recordChange = state.begin();
  state.changeIdentity({ ...identity, contextKey: "set:2:working" });
  assert.equal(state.complete(recordChange, [record(802)]), false, "search survived opening another record");
  assert.deepEqual(state.snapshot().records, []);

  const runtimeChange = state.begin();
  state.changeIdentity({ runtimeMode: "memory", contextKey: "set:2:working", editable: true });
  assert.equal(state.complete(runtimeChange, [record(803)]), false, "DB search survived runtime change");

  state.changeIdentity({ runtimeMode: "db", contextKey: "set:2:working", editable: true });
  const lockChange = state.begin();
  state.changeIdentity({ runtimeMode: "db", contextKey: "set:2:final", editable: false });
  assert.equal(state.complete(lockChange, [record(804)]), false, "search survived read-only transition");

  state.changeIdentity(identity);
  const cleared = state.begin();
  state.cancel();
  assert.equal(state.complete(cleared, [record(805)]), false, "search survived clear/deselect");
  assert.equal(state.snapshot().loading, false);
  assert.equal(state.snapshot().error, null);
  assert.deepEqual(state.snapshot().records, []);

  const failed = state.begin();
  assert.equal(state.fail(failed, "failed"), true);
  assert.equal(state.snapshot().error, "failed");
  state.cancel();
  assert.equal(state.snapshot().error, null);
}

function renderCoverage() {
  const state = new ServiceContextReferenceAntiphonUiState(identity);
  const noops = { onQueryChange: (_: string) => undefined, onSelect: (_: ReferenceAntiphonRecord) => undefined, onRemove: () => undefined };
  const empty = renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView runtime="db" editable selected={undefined} query="" snapshot={state.snapshot()} {...noops} />);
  assert.match(empty, /<h3>Antiphon<\/h3>/);
  assert.match(empty, /No antiphon selected/);
  assert.match(empty, /Service Context antiphon search/);
  assert.doesNotMatch(empty, /Remove antiphon/);

  state.complete(state.begin(), [record(800)]);
  const results = renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView runtime="db" editable selected={undefined} query="800" snapshot={state.snapshot()} {...noops} />);
  assert.match(results, />800 · Antiphon 800</);

  const selected = renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView runtime="db" editable selected={snapshot(800)} query="" snapshot={state.snapshot()} {...noops} />);
  assert.match(selected, /800 · Antiphon 800/);
  assert.match(selected, /href="https:\/\/www\.evangelickykancional\.cz/);
  assert.match(selected, /Remove antiphon/);

  const readOnly = renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView runtime="db" editable={false} selected={snapshot(800)} query="" snapshot={state.snapshot()} {...noops} />);
  assert.match(readOnly, /800 · Antiphon 800/);
  assert.doesNotMatch(readOnly, /Service Context antiphon search/);
  assert.doesNotMatch(readOnly, /Remove antiphon/);

  const memoryEmpty = renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView runtime="memory" editable selected={undefined} query="" snapshot={state.snapshot()} {...noops} />);
  assert.match(memoryEmpty, /Authoritative antiphon selection is available only in DB runtime\./);
  assert.doesNotMatch(memoryEmpty, /Service Context antiphon search/);

  const memoryHistorical = renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView runtime="memory" editable={false} selected={snapshot(800)} query="" snapshot={state.snapshot()} {...noops} />);
  assert.match(memoryHistorical, /800 · Antiphon 800/);
  assert.doesNotMatch(memoryHistorical, /available only in DB runtime/);
}

async function staticBoundaryCoverage() {
  const [planning, model, migration, schema, candidateFlow, recommendationPanel] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/planning-lifecycle/model.ts", "utf8"),
    readFile("drizzle/0014_phase_31_11_service_context_reference_antiphon.sql", "utf8"),
    readFile("src/db/schema/index.ts", "utf8"),
    readFile("src/planning-lifecycle/candidate-flow.ts", "utf8"),
    readFile("app/reference-antiphon-recommendation-panel.tsx", "utf8"),
  ]);
  assert.equal((planning.match(/<ServiceContextReferenceAntiphonField/g) ?? []).length, 1, "selector must be rendered exactly once");
  assert.match(planning, /referenceAntiphon \? \{ referenceAntiphon:/);
  assert.match(planning, /referenceAntiphonId: (?:set|record)\.serviceContext\.referenceAntiphon\?\.id|referenceAntiphonId: referenceAntiphon\?\.id/);
  assert.match(planning, /Legacy synthetic\/demo candidate signal/);
  assert.match(model, /referenceAntiphon\?: ServiceAntiphonReference/);
  assert.match(migration, /reference_antiphon_id/);
  assert.doesNotMatch(migration, /REFERENCES\s+"reference_antiphons"/i, "historical snapshot must not have a foreign key");
  assert.match(schema, /serviceContexts_reference_antiphon|service_contexts_reference_antiphon/);
  assert.match(candidateFlow, /referenceAntiphonId\?: string/);
  assert.match(candidateFlow, /input\.referenceAntiphonId\?\.trim\(\)/);
  assert.match(candidateFlow, /input\.antiphonKey\?\.trim\(\)/);
  assert.doesNotMatch(candidateFlow, /\breferenceAntiphon\b/, "candidate flow must accept only the authoritative id, never the Service Context snapshot");
  assert.doesNotMatch(recommendationPanel, /ServiceContextReferenceAntiphonField/, "recommendation panel was coupled to Service Context selection");
}

async function main() {
  staleResponseCoverage();
  renderCoverage();
  await staticBoundaryCoverage();
  console.log("Phase 31.11 behavioral and render integration tests: PASS");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
