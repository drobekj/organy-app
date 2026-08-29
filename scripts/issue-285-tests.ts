import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.match(catalog, /useState<ServiceLanguage>\(\(\) => getDefaultServiceLanguage\(getNearestSunday\(new Date\(\)\)\)\)/);
assert.match(catalog, /className="service-antiphon-topic-row catalog-antiphon-topic-row"/);
assert.match(catalog, /recommendationClient=\{recommendationClient \?\? undefined\}/);
assert.match(catalog, /canEditRecommendation=\{runtime === "db" && actor\.role === "admin"\}/);

const closedStart = antiphon.indexOf('<div className={\`service-antiphon-control');
const listStart = antiphon.indexOf('{props.open && <div id="service-antiphon-listbox"');
const closedControl = antiphon.slice(closedStart, listStart);
assert.match(closedControl, />Detail<\/button>/);
assert.doesNotMatch(closedControl, /service-antiphon-source|Clear antiphon/);

assert.match(antiphon, /id="service-antiphon-option-none"/);
assert.match(antiphon, />None<\/span>/);
assert.match(antiphon, /props\.onOpenDetail\(recordSnapshot\(record\), "list"\)/);
assert.match(antiphon, /className="service-antiphon-detail-row service-antiphon-detail-main-row"/);
assert.match(antiphon, /className="service-antiphon-detail-row service-antiphon-detail-reference-row"/);
assert.match(antiphon, /href=\{props\.detail\.antiphon\.sourceUrl\}/);
assert.doesNotMatch(antiphon, /Close antiphon detail|Ref song:/);
assert.match(antiphon, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
assert.match(antiphon, /document\.addEventListener\("keydown", onKeyDown, true\)/);

assert.match(planning, /recommendationClient=\{planningAntiphonRecommendationClient \?\? undefined\}/);
assert.doesNotMatch(planning, /canEditRecommendation=/);

assert.match(lookup, /pageSize: 200/);
assert.match(lookup, /<strong>none<\/strong>/);

assert.match(css, /\.service-antiphon-detail \{[\s\S]*?left: 3\.25rem;[\s\S]*?right: calc\(-100% - 0\.75rem\);/);
assert.match(css, /\.service-antiphon-topic-row \{[\s\S]*?grid-column: 1 \/ -1;/);

console.log("Issue 285 corrective Antiphon Detail HUMAN checkpoint 4 coverage passed.");
