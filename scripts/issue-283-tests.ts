import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const antiphonField = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");
const route = readFileSync("app/api/interaction/route.ts", "utf8");

for (const required of [
  'actor.role === "admin" && antiphon',
  '<span className="catalog-context-label">Ref song</span>',
  '<ReferenceSongLookupField',
  'recommendationClient.set(antiphonId, record?.id ?? null)',
  'await reloadCandidates()',
  'onAntiphonRecommendationChanged?.()',
]) {
  assert.ok(catalog.includes(required), `Catalog Stage 4 missing: ${required}`);
}

assert.ok(lookup.includes('<strong>none</strong>'), "Reference song lookup must expose none as the first option.");
assert.ok(lookup.indexOf('<strong>none</strong>') < lookup.indexOf('records.map'), "none must appear before song records.");
assert.match(lookup, /listAll\(client, language, dirty \? query\.trim\(\) : ""\)/);
assert.match(lookup, /pageSize: 200/);
assert.doesNotMatch(lookup, />Songs<|>Melodies</, "Ref song lookup must not expose Songs/Melodies modes.");
assert.match(lookup, /onPointerDown=\{\(event\) => \{ event\.preventDefault\(\); choose\(null\); \}\}/);

const referenceIndex = antiphonField.indexOf('className="service-antiphon-reference"');
const sourceIndex = antiphonField.indexOf('className="service-antiphon-source"');
assert.ok(referenceIndex >= 0 && sourceIndex > referenceIndex, "Catalog Reference song must render before Source.");
assert.ok(antiphonField.includes('Catalog {props.recommendedSong ?'), "Shared Antiphon lookup must render the Catalog reference.");
assert.ok(antiphonField.includes(': "none"'), "Shared Antiphon lookup must visibly represent no reference.");

assert.match(planning, /planningAntiphonRecommendationClient\.get\(referenceAntiphon\.id\)/);
assert.match(planning, /recommendedSong=\{planningAntiphonRecommendation\?\.recommendedSong\}/);
assert.match(planning, /onAntiphonRecommendationChanged=\{\(\) => \{/);
assert.match(planning, /setAntiphonRecommendationGeneration\(\(generation\) => generation \+ 1\)/);
assert.match(planning, /setCandidateRefreshGeneration\(\(generation\) => generation \+ 1\)/);
assert.doesNotMatch(planning, /<ReferenceAntiphonRecommendationPanel\b/);

assert.match(route, /case "getReferenceAntiphonRecommendation"/);
assert.match(route, /case "setReferenceAntiphonRecommendation"/);
assert.match(route, /referenceAntiphonRecommendation\.set\(actor, input\.antiphonId, input\.referenceSongId!\)/);

console.log("Issue 283 Catalog Antiphon → Ref song Stage 4 coverage passed.");
