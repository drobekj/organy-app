import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceContextReferenceAntiphonFieldView } from "../app/service-context-reference-antiphon-field";
import { ServiceContextReferenceAntiphonUiState, type ServiceContextAntiphonSearchIdentity } from "../src/application/service-context-reference-antiphon-ui-state";
import type { ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import type { ServiceAntiphonReference } from "../src/planning-lifecycle";

const identity: ServiceContextAntiphonSearchIdentity = { runtimeMode: "db", contextKey: "new:1", editable: true, serviceLanguage: "czech" };
const record = (number: number): ReferenceAntiphonRecord => ({ id: `czech:${number}`, language: "czech", canonicalNumber: number, displayNumber: String(number), title: `Antiphon ${number}`, sourceUrl: `https://www.evangelickykancional.cz/pisen/${number}/antiphon-${number}` });
const snapshot = (number: number): ServiceAntiphonReference => { const value=record(number); return { id:value.id,displayNumber:value.displayNumber,title:value.title,sourceUrl:value.sourceUrl }; };
const noops = { onOpen:()=>undefined,onQueryChange:(_:string)=>undefined,onKeyDown:()=>undefined,onSelect:(_:ReferenceAntiphonRecord)=>undefined,onActiveIndexChange:(_:number)=>undefined,onClear:()=>undefined };

function staleResponseCoverage() {
  const state = new ServiceContextReferenceAntiphonUiState(identity); const older=state.begin(),newer=state.begin(); assert.equal(state.complete(older,[record(800)]),false);assert.equal(state.complete(newer,[record(801)]),true);
  const language=state.begin();state.changeIdentity({...identity,serviceLanguage:"polish"});assert.equal(state.complete(language,[record(802)]),false);assert.deepEqual(state.snapshot().records,[]);
  const context=state.begin();state.changeIdentity({...identity,contextKey:"set:2"});assert.equal(state.complete(context,[record(803)]),false);
}
function renderCoverage() {
  const state=new ServiceContextReferenceAntiphonUiState(identity);
  const empty=renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView editable selected={undefined} open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops}/>);assert.match(empty,/placeholder="Select antiphon"/);assert.doesNotMatch(empty,/Find antiphon|No antiphon selected|Remove antiphon|<h3>/);
  state.complete(state.begin(),[record(800)]);
  const open=renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView editable selected={undefined} open dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops}/>);assert.match(open,/role="listbox"/);assert.match(open,/800/);assert.match(open,/Source/);
  const selected=renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView editable selected={snapshot(800)} open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops}/>);assert.match(selected,/value="800 · Antiphon 800"/);assert.match(selected,/Clear antiphon/);
}
async function staticCoverage(){const [planning,model,migration]=await Promise.all([readFile("app/planning-lifecycle-client.tsx","utf8"),readFile("src/planning-lifecycle/model.ts","utf8"),readFile("drizzle/0016_phase_31_18_bilingual_antiphons.sql","utf8")]);assert.equal((planning.match(/<ServiceContextReferenceAntiphonField/g)??[]).length,1);assert.doesNotMatch(planning,/>Candidate antiphon key</);assert.match(model,/sourceUrl\?: string/);assert.match(migration,/\(czech\|polish\)/);}
async function main(){staleResponseCoverage();renderCoverage();await staticCoverage();console.log("Phase 31.11 behavioral and render integration tests: PASS");}
void main().catch((error)=>{console.error(error);process.exitCode=1;});
