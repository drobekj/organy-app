import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/service-context-minimal.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const topic = readFileSync("app/service-context-reference-topic-field.tsx", "utf8");

assert.match(layout, /import "\.\/globals\.css";\s*import "\.\/service-context-minimal\.css";/, "minimal Service Context CSS must load after globals");
assert.match(css, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/, "desktop Service Context must use six equal tracks");

for (const index of [1, 2, 3]) {
  assert.match(css, new RegExp(`label:nth-of-type\\(${index}\\)[\\s\\S]*?grid-column: span 2`, "m"), `field ${index} must occupy one third of the row`);
}
for (const index of [4, 5]) {
  assert.match(css, new RegExp(`label:nth-of-type\\(${index}\\)[\\s\\S]*?grid-column: span 3`, "m"), `field ${index} must occupy one half of the row`);
}
assert.match(css, /> \.service-antiphon-topic-row\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?order:\s*3;/, "Antiphon/Topic row must span the full width before Service note");
assert.match(css, /> \.note-field\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?order:\s*4;/, "Service note must span the final full-width row");
assert.match(css, /> \.note-field\s*\{[\s\S]*?font-size:\s*0;[\s\S]*?gap:\s*0;/, "Service note visible label must be suppressed");
assert.match(css, /> \.note-field > textarea\s*\{[\s\S]*?font-size:\s*1rem;[\s\S]*?height:\s*2\.65rem;[\s\S]*?min-height:\s*2\.65rem;[\s\S]*?resize:\s*none;/, "Service note must remain a normal-height one-line control");

assert.match(css, /content:\s*"Date";/, "visible Date label must be compact");
assert.match(css, /content:\s*"Time";/, "visible Time label must be compact");
assert.match(css, /content:\s*"Language";/, "visible Language label must be compact");
assert.match(css, /> label > \.field-help\s*\{\s*display:\s*none;/, "persistent Service Context helper prose must be hidden");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/, "narrow Service Context must collapse to one column");

const serviceContextStart = planning.indexOf("<legend>Service context</legend>");
const rowsStart = planning.indexOf('<div className="rows-header">', serviceContextStart);
assert.ok(serviceContextStart >= 0 && rowsStart > serviceContextStart, "Service Context block must remain present");
const serviceContext = planning.slice(serviceContextStart, rowsStart);
for (const required of ["Service date", "Service time", "Service language", "Priest", "Organist", "Service note", "service-antiphon-topic-row"]) {
  assert.ok(serviceContext.includes(required), `Service Context must retain ${required}`);
}
assert.ok(serviceContext.includes('placeholder="Gospel readings, links, or planning information"'), "Service note placeholder must remain available inside the field");
assert.ok(!serviceContext.includes("Candidate antiphon key"), "legacy Candidate antiphon key must stay out of normal Service Context UI");
assert.ok(!serviceContext.includes("Candidate season key"), "legacy Candidate season key must stay out of normal Service Context UI");
assert.match(antiphon, /placeholder="Select antiphon"/, "Antiphon keeps its light optional placeholder");
assert.match(topic, /placeholder="Select topic"/, "Topic keeps its light optional placeholder");

console.log("Phase 31.21 minimal Service Context layout: PASS");
