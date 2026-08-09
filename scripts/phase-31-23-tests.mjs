import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/data-value-typography.css", "utf8");
const minimalCss = readFileSync("app/service-context-minimal.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");

assert.match(css, /--choice-value-font-weight:\s*700;/, "authoritative choice values must use weight 700");
assert.match(css, /--free-text-font-weight:\s*400;/, "free-text notes must use Regular 400");
assert.match(css, /--data-field-font-size:\s*1rem;/, "all data controls must share one 1rem value size");
assert.match(css, /--empty-field-font-weight:\s*400;/, "all empty-state strings must use one Regular cut");
assert.match(css, /--empty-field-color:\s*rgb\(95 107 122 \/ 62%\);/, "all empty-state strings must use one grey token");

assert.match(css, /\.field-group:has\(> \.service-antiphon-topic-row\) input,[\s\S]*?\.row-card textarea\s*\{[\s\S]*?font-size:\s*var\(--data-field-font-size\);/, "Service Context and Row controls must share one value size");
assert.match(css, /\.field-group:has\(> \.service-antiphon-topic-row\) input,[\s\S]*?\.field-group:has\(> \.service-antiphon-topic-row\) select\s*\{[\s\S]*?font-weight:\s*var\(--choice-value-font-weight\);/, "filled Service Context choice controls must use 700");
assert.match(css, /> \.note-field > textarea\s*\{[\s\S]*?font-weight:\s*var\(--free-text-font-weight\);/, "filled Service note must remain Regular 400");
assert.match(css, /\.row-card \.row-note-input\s*\{[\s\S]*?font-weight:\s*var\(--free-text-font-weight\);/, "filled Planning Row note must remain Regular 400");

assert.match(css, /\.service-antiphon-control input::placeholder,[\s\S]*?\.candidate-combobox > input::placeholder,[\s\S]*?\.row-note-input::placeholder\s*\{[\s\S]*?color:\s*var\(--empty-field-color\);[\s\S]*?font-size:\s*var\(--data-field-font-size\);[\s\S]*?font-weight:\s*var\(--empty-field-font-weight\);[\s\S]*?opacity:\s*1;/, "Antiphon, Topic, Song lookup and Row note empty prompts must share one visible empty-state token");
assert.match(css, /select:has\(> option\[value=""\]:checked\)\s*\{[\s\S]*?color:\s*var\(--empty-field-color\);[\s\S]*?font-size:\s*var\(--data-field-font-size\);[\s\S]*?font-weight:\s*var\(--empty-field-font-weight\);/, "native empty Priest/Organist selects must share the empty-state token");
assert.match(css, /> \.note-field:has\(> textarea:placeholder-shown\)::after\s*\{[\s\S]*?color:\s*var\(--empty-field-color\);[\s\S]*?font-size:\s*var\(--data-field-font-size\);[\s\S]*?font-weight:\s*var\(--empty-field-font-weight\);[\s\S]*?opacity:\s*1;/, "Add service note visible prompt must share the same empty-state token");
assert.match(minimalCss, /content:\s*"Add service note…";/, "Service note empty prompt must remain Add service note…");

assert.doesNotMatch(css, /\bbutton\b/, "the typography layer must not alter action-button hierarchy");
assert.doesNotMatch(css, /\blegend\b/, "the typography layer must not alter legend hierarchy");
assert.ok(layout.indexOf('import "./data-value-typography.css";') > layout.indexOf('import "./service-context-minimal.css";'), "typography must load after Service Context presentation styles");

console.log("Phase 31.23 typography hierarchy and unified empty-state: PASS");
