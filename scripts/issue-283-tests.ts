import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const antiphonField = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");
const route = readFileSync("app/api/interaction/route.ts", "utf8");

for (const required of [
  'referenceSongControl={runtime === "db" && actor.role === "admin" && antiphon && antiphonRecommendation ? (',
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

const sourceIndex = antiphonField.indexOf('className="service-antiphon-detail-row"');
const referenceIndex = antiphonField.indexOf('service-antiphon-detail-reference-row');
assert.ok(sourceIndex >= 0 && referenceIndex > sourceIndex, "Antiphon Detail must keep Ref song as the final information row after Source.");
assert.ok(antiphonField.includes('Ref song: {props.recommendationLoading ?'), "Shared Antiphon Detail must render read-only Ref song information.");
assert.ok(antiphonField.includes(': "none"'), "Shared Antiphon Detail must visibly represent no reference.");
assert.doesNotMatch(antiphonField, /Catalog \{props\.recommendedSong/, "Antiphon fields must use Ref song rather than Catalog.");

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
