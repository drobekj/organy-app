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

const identity: ServiceContextAntiphonSearchIdentity = {
  runtimeMode: "db",
  contextKey: "new:1",
  editable: true,
  serviceLanguage: "czech",
};
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
const noops = {
  onOpen: () => undefined,
  onQueryChange: (_: string) => undefined,
  onKeyDown: () => undefined,
  onSelect: (_: ReferenceAntiphonRecord) => undefined,
  onActiveIndexChange: (_: number) => undefined,
  onClear: () => undefined,
};

function staleResponseCoverage() {
  const state = new ServiceContextReferenceAntiphonUiState(identity);
  const older = state.begin();
  const newer = state.begin();
  assert.equal(state.isCurrent(older), false, "older search survived a newer search");
  assert.equal(state.complete(older, [record(800)]), false);
  assert.equal(state.complete(newer, [record(801)]), true);
  assert.deepEqual(state.snapshot().records.map((item) => item.id), ["czech:801"]);

  const languageChange = state.begin();
  state.changeIdentity({ ...identity, serviceLanguage: "polish" });
  assert.equal(state.complete(languageChange, [record(802)]), false, "search survived language change");
  assert.deepEqual(state.snapshot().records, []);

  const recordChange = state.begin();
  state.changeIdentity({ ...identity, contextKey: "set:2:working" });
  assert.equal(state.complete(recordChange, [record(803)]), false, "search survived opening another record");
  assert.deepEqual(state.snapshot().records, []);

  const runtimeChange = state.begin();
  state.changeIdentity({ ...identity, runtimeMode: "memory", contextKey: "set:2:working" });
  assert.equal(state.complete(runtimeChange, [record(804)]), false, "DB search survived runtime change");

  state.changeIdentity({ ...identity, contextKey: "set:2:working" });
  const lockChange = state.begin();
  state.changeIdentity({ ...identity, contextKey: "set:2:final", editable: false });
  assert.equal(state.complete(lockChange, [record(805)]), false, "search survived read-only transition");

  state.changeIdentity(identity);
  const cleared = state.begin();
  state.cancel();
  assert.equal(state.complete(cleared, [record(806)]), false, "search survived clear/deselect");
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
  const empty = renderToStaticMarkup(
    <ServiceContextReferenceAntiphonFieldView editable selected={undefined} open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops} />,
  );
  assert.match(empty, /placeholder="Select antiphon"/);
  assert.doesNotMatch(empty, /Find antiphon|No antiphon selected|Remove antiphon|<h3>/);
  assert.doesNotMatch(empty, /role="listbox"/);

  state.complete(state.begin(), [record(800)]);
  const results = renderToStaticMarkup(
    <ServiceContextReferenceAntiphonFieldView editable selected={undefined} open dirty query="80" snapshot={state.snapshot()} activeIndex={0} {...noops} />,
  );
  assert.match(results, /role="listbox"/);
  assert.match(results, />800</);
  assert.match(results, /Antiphon 800/);
  assert.match(results, /href="https:\/\/www\.evangelickykancional\.cz/);

  const selected = renderToStaticMarkup(
    <ServiceContextReferenceAntiphonFieldView editable selected={snapshot(800)} open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops} />,
  );
  assert.match(selected, /value="800 · Antiphon 800"/);
  assert.match(selected, />Detail<\/button>/);
  assert.doesNotMatch(selected, /href="https:\/\/www\.evangelickykancional\.cz/, "Selected Antiphon control keeps Source inside Detail.");
  assert.match(selected, /Clear antiphon/);

  const selectedDetail = renderToStaticMarkup(
    <ServiceContextReferenceAntiphonFieldView editable selected={snapshot(800)} open={false} detailOpen dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops} />,
  );
  assert.match(selectedDetail, /Antiphon detail for 800 Antiphon 800/);
  assert.match(selectedDetail, /href="https:\/\/www\.evangelickykancional\.cz/);
  assert.match(selectedDetail, /Ref song: none/);

  const readOnly = renderToStaticMarkup(
    <ServiceContextReferenceAntiphonFieldView editable={false} selected={snapshot(800)} open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops} />,
  );
  assert.match(readOnly, /value="800 · Antiphon 800"/);
  assert.match(readOnly, /readOnly=""/);
  assert.match(readOnly, />Detail<\/button>/);
  assert.doesNotMatch(readOnly, /Clear antiphon/);

  const invalid = renderToStaticMarkup(
    <ServiceContextReferenceAntiphonFieldView editable selected={snapshot(800)} invalid open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops} />,
  );
  assert.match(invalid, /aria-invalid="true"/);
  assert.match(invalid, /service-antiphon-control-invalid/);
}

async function staticBoundaryCoverage() {
  const [planning, model, originalMigration, bilingualMigration, schema, candidateFlow, recommendationPanel] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/planning-lifecycle/model.ts", "utf8"),
    readFile("drizzle/0014_phase_31_11_service_context_reference_antiphon.sql", "utf8"),
    readFile("drizzle/0016_phase_31_18_bilingual_antiphons.sql", "utf8"),
    readFile("src/db/schema/index.ts", "utf8"),
    readFile("src/planning-lifecycle/candidate-flow.ts", "utf8"),
    readFile("app/reference-antiphon-recommendation-panel.tsx", "utf8"),
  ]);
  assert.equal((planning.match(/<ServiceContextReferenceAntiphonField/g) ?? []).length, 1, "selector must be rendered exactly once");
  assert.match(planning, /referenceAntiphon \? \{ referenceAntiphon:/);
  assert.match(planning, /referenceAntiphonId: (?:set|record)\.serviceContext\.referenceAntiphon\?\.id|referenceAntiphonId: referenceAntiphon\?\.id/);
  assert.doesNotMatch(planning, />Candidate antiphon key</, "legacy synthetic antiphon key leaked into normal Service Context UI");
  assert.match(planning, /referenceAntiphons: new MemoryReferenceAntiphonProvider\(\)/, "memory Planning persistence lacks authoritative Antiphon validation");
  assert.match(planning, /Selected antiphon must match the service language\./);
  assert.match(model, /referenceAntiphon\?: ServiceAntiphonReference/);
  assert.match(model, /sourceUrl\?: string/);
  assert.match(originalMigration, /reference_antiphon_id/);
  assert.doesNotMatch(originalMigration, /REFERENCES\s+"reference_antiphons"/i, "historical snapshot must not have a foreign key");
  assert.match(bilingualMigration, /\(czech\|polish\)/);
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
