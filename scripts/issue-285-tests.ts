import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.match(catalog, /useState<ServiceLanguage>\(\(\) => getDefaultServiceLanguage\(getNearestSunday\(new Date\(\)\)\)\)/);
assert.match(catalog, /referenceSongControl=\{runtime === "db" && actor\.role === "admin" && antiphon && antiphonRecommendation \? \(/);
assert.match(catalog, /<ReferenceSongLookupField[\s\S]*?onSelect=\{\(record\) => void setAntiphonReferenceSong\(record\)\}/);
assert.match(catalog, /recommendationClient\.set\(antiphonId, record\?\.id \?\? null\)/);
assert.match(catalog, /await reloadCandidates\(\)/);
assert.match(catalog, /onAntiphonRecommendationChanged\?\.\(\)/);
assert.doesNotMatch(catalog, /catalog-antiphon-reference-editor/);

assert.match(antiphon, /className="candidate-inline-detail service-antiphon-detail-button"/);
assert.match(antiphon, />Detail<\/button>/);
assert.doesNotMatch(antiphon, /service-antiphon-reference/);
const closedControl = antiphon.slice(antiphon.indexOf("<div className={\`service-antiphon-control"), antiphon.indexOf("{props.open && <div id=\"service-antiphon-listbox\""));
assert.doesNotMatch(closedControl, /recommendedSong|service-antiphon-source/, "Closed selected Antiphon field must not expose Ref song or Source metadata.");

assert.match(antiphon, /className="service-antiphon-detail"/);
assert.match(antiphon, /<strong>\{props\.selected\.displayNumber\}<\/strong><span>\{props\.selected\.title\}<\/span>/);
assert.match(antiphon, /props\.selected\.sourceUrl && <div className="service-antiphon-detail-row">/);
assert.match(antiphon, /service-antiphon-detail-reference-row/);
assert.match(antiphon, /Ref song: \{props\.recommendationLoading \?/);
assert.match(antiphon, /props\.referenceSongControl \? <>/);
assert.ok(
  antiphon.indexOf("service-antiphon-detail-reference-row") > antiphon.indexOf("props.selected.sourceUrl"),
  "Ref song must be the final Antiphon Detail information row.",
);
assert.match(antiphon, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
assert.match(antiphon, /document\.addEventListener\("keydown", onKeyDown\)/);
assert.match(antiphon, /event\.key !== "Escape"/);

assert.match(planning, /recommendedSong=\{planningAntiphonRecommendation\?\.recommendedSong\}/);
assert.match(planning, /recommendationLoading=\{planningAntiphonRecommendationLoading\}/);
assert.match(planning, /recommendationError=\{planningAntiphonRecommendationError\}/);
assert.doesNotMatch(planning, /referenceSongControl=\{/, "Planning Antiphon Detail must stay read-only even for admin.");

assert.match(lookup, /pageSize: 200/);
assert.match(lookup, /<strong>none<\/strong>/);
assert.match(lookup, /choose\(record\)/);

assert.match(css, /\.service-antiphon-detail-button \{[\s\S]*?height: 2rem;[\s\S]*?min-width: 4\.7rem;/);
assert.match(css, /\.service-antiphon-detail \{[\s\S]*?position: absolute;[\s\S]*?right: 0;[\s\S]*?width: min\(82vw, 46rem\);/);
assert.match(css, /\.service-antiphon-detail-reference-control \{[\s\S]*?margin-left: auto;/);

console.log("Issue 285 corrective Antiphon Detail HUMAN checkpoint 4 coverage passed.");
