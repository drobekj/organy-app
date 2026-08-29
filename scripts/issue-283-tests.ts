import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");
const route = readFileSync("app/api/interaction/route.ts", "utf8");

assert.match(catalog, /recommendationClient=\{recommendationClient \?\? undefined\}/);
assert.match(catalog, /canEditRecommendation=\{runtime === "db" && actor\.role === "admin"\}/);
assert.match(catalog, /onRecommendationChanged=\{async \(value\) => \{/);
assert.match(catalog, /await reloadCandidates\(\)/);
assert.match(catalog, /onAntiphonRecommendationChanged\?\.\(\)/);

assert.match(antiphon, /<ReferenceSongLookupField/);
assert.match(antiphon, /recommendationClient\.set\(detailId, record\?\.id \?\? null\)/);
assert.match(antiphon, /onRecommendationChanged\?\.\(result\.value\)/);

assert.ok(lookup.includes("<strong>none</strong>"), "Reference song lookup must expose none as the first option.");
assert.ok(lookup.indexOf("<strong>none</strong>") < lookup.indexOf("records.map"), "none must appear before song records.");
assert.match(lookup, /pageSize: 200/);
assert.doesNotMatch(lookup, />Songs<|>Melodies</);

assert.match(planning, /recommendationClient=\{planningAntiphonRecommendationClient \?\? undefined\}/);
assert.doesNotMatch(planning, /canEditRecommendation=/, "Planning Antiphon Detail must stay read-only.");
assert.match(planning, /onAntiphonRecommendationChanged=\{\(\) => \{/);

assert.match(route, /case "getReferenceAntiphonRecommendation"/);
assert.match(route, /case "setReferenceAntiphonRecommendation"/);
assert.match(route, /referenceAntiphonRecommendation\.set\(actor, input\.antiphonId, input\.referenceSongId!\)/);

console.log("Issue 283 Catalog Antiphon → Ref song Stage 4 coverage passed.");
