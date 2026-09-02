import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const topic = readFileSync("app/service-context-reference-topic-field.tsx", "utf8");
const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");

// Clearing is a first-row None choice, never an inline × button.
assert.match(antiphon, /id="service-antiphon-option-none"[\s\S]*?>None<\/span>/);
assert.match(topic, /id="service-topic-option-none"[\s\S]*?>None<\/span>/);
assert.match(antiphon, /const selectNone = \(\) => \{[\s\S]*?onChange\(undefined\)/);
assert.match(topic, /const selectNone = \(\) => \{ onChange\(undefined\); closeRestore\(\); \}/);
assert.doesNotMatch(antiphon, /service-antiphon-clear|Clear antiphon/);
assert.doesNotMatch(topic, /service-antiphon-clear|Clear topic/);
assert.match(antiphon, /placeholder="Select antiphon"/);
assert.match(topic, /placeholder="Select topic"/);

// Every Antiphon list row exposes Detail, not Source, and row Detail does not select the row.
const listStart = antiphon.indexOf('{props.open && <div id="service-antiphon-listbox"');
const detailStart = antiphon.indexOf('{props.detail && <section', listStart);
const listMarkup = antiphon.slice(listStart, detailStart);
assert.match(listMarkup, /props\.snapshot\.records\.map/);
assert.match(listMarkup, /props\.onOpenDetail\(recordSnapshot\(record\), "list"\)/);
assert.match(listMarkup, /event\.stopPropagation\(\)/);
assert.match(listMarkup, />Detail<\/button>/);
assert.doesNotMatch(listMarkup, /href=|>Source</);

// Detail has exactly two semantic rows, no close button, Source is only the link on row 1.
const detailMarkup = antiphon.slice(detailStart, antiphon.indexOf("const defaultClientFactory", detailStart));
assert.match(detailMarkup, /service-antiphon-detail-main-row/);
assert.match(detailMarkup, /<strong>\{props\.detail\.antiphon\.displayNumber\}<\/strong>/);
assert.match(detailMarkup, /service-antiphon-detail-title/);
assert.match(detailMarkup, /href=\{props\.detail\.antiphon\.sourceUrl\}[\s\S]*?>Source<\/a>/);
assert.match(detailMarkup, /service-antiphon-detail-reference-row/);
assert.equal((detailMarkup.match(/className="service-antiphon-detail-row/g) ?? []).length, 2);
assert.doesNotMatch(detailMarkup, /Close antiphon detail/);
assert.match(detailMarkup, /className="service-antiphon-detail-reference-label">Ref song<\/strong>/);

// Read-only details load authoritative recommendation; Catalog admin alone can mutate it.
assert.match(antiphon, /recommendationClient\.get\(detail\.antiphon\.id\)/);
assert.match(antiphon, /recommendationClient\.set\(detailId, record\?\.id \?\? null\)/);
assert.match(antiphon, /editableRecommendation: Boolean\(canEditRecommendation && recommendationClient\?\.set\)/);
assert.match(antiphon, /<ReferenceSongLookupField/);
assert.match(lookup, /<strong>none<\/strong>/);
assert.match(catalog, /recommendationClient=\{recommendationClient \?\? undefined\}/);
assert.match(catalog, /canEditRecommendation=\{!readOnlyDemo && runtime === "db" && actor\.role === "admin"\}/);
assert.match(catalog, /onRecommendationChanged=\{async \(value\) => \{/);
assert.match(catalog, /await reloadCandidates\(\)/);
assert.match(catalog, /onAntiphonRecommendationChanged\?\.\(\)/);
assert.match(planning, /recommendationClient=\{planningAntiphonRecommendationClient \?\? undefined\}/);
assert.doesNotMatch(planning, /canEditRecommendation=/);

// Standard candidate-detail dismissal rules: outside pointer + Escape, no explicit close affordance.
assert.match(antiphon, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
assert.match(antiphon, /document\.addEventListener\("keydown", onKeyDown, true\)/);
assert.match(antiphon, /if \(event\.key !== "Escape"\) return/);

// Desktop overlay spans to the Topic edge while leaving a left strip of Antiphon numbers visible.
assert.match(css, /\.service-antiphon-topic-row \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
assert.match(css, /\.service-antiphon-detail \{[\s\S]*?left: 3\.25rem;[\s\S]*?right: calc\(-100% - 0\.75rem\);[\s\S]*?z-index: 65;/);
assert.match(css, /\.service-antiphon-listbox \{[\s\S]*?z-index: 60;/);
assert.match(catalog, /className="service-antiphon-topic-row catalog-antiphon-topic-row"/);

// Keyboard model includes None as index zero.
assert.match(antiphon, /moveAntiphonActiveIndex\(index, snapshot\.records\.length \+ 1/);
assert.match(topic, /moveTopicActiveIndex\(index, snapshot\.records\.length \+ 1/);
assert.match(antiphon, /if \(activeIndex === 0\)[\s\S]*?selectNone\(\)/);
assert.match(topic, /if \(activeIndex === 0\)[\s\S]*?selectNone\(\)/);

console.log("Issue 287 second corrective HUMAN checkpoint 4 coverage passed.");
