import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const editor = readFileSync("app/reference-melody-edge-editor.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const serviceContextCss = readFileSync("app/service-context-minimal.css", "utf8");

// Catalog context owns its labels/layout; Planning pseudo-label rules must not leak into it.
assert.match(serviceContextCss, /\.field-group:not\(\.catalog-context\):has\(> \.service-antiphon-topic-row\)/);
assert.doesNotMatch(serviceContextCss, /\.field-group:has\(> \.service-antiphon-topic-row\)/);
assert.match(serviceContextCss, /content: "Date"/);
assert.match(serviceContextCss, /content: "Time"/);

const firstRow = catalog.indexOf('className="catalog-organist-language-row"');
const secondRow = catalog.indexOf('className="service-antiphon-topic-row catalog-antiphon-topic-row"');
assert.ok(firstRow >= 0 && secondRow > firstRow, "Catalog context must render Organist/Language before Antiphon/Topic.");
const firstRowSection = catalog.slice(firstRow, secondRow);
assert.match(firstRowSection, />Organist<\/span>/);
assert.match(firstRowSection, />Language<\/span>/);
assert.doesNotMatch(firstRowSection, />Date<|>Time</);

assert.match(css, /\.catalog-organist-language-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);

// Remove redundant Catalog workspace header/helper.
assert.doesNotMatch(catalog, /<h2>Catalog<\/h2>/);
assert.doesNotMatch(catalog, /Candidate and repertoire workspace/);

// Stable vertical Catalog order.
const contextIndex = catalog.indexOf('<fieldset className="field-group catalog-context"');
const candidateIndex = catalog.indexOf('<fieldset className="field-group catalog-candidate-panel"');
const availabilityIndex = catalog.indexOf('className="catalog-availability-switch"', candidateIndex);
const melodyIndex = catalog.indexOf('<ReferenceMelodyEdgeEditor');
assert.ok(contextIndex >= 0 && contextIndex < candidateIndex && candidateIndex < availabilityIndex && availabilityIndex < melodyIndex);

// Candidate viewport is intentionally compact: approximately seven rows.
assert.match(css, /\.catalog-candidate-scroll \{[\s\S]*?max-height: 18rem;/);

// Melody Edges uses the same contour/legend language as Catalog context.
assert.match(editor, /<fieldset className="field-group catalog-melody-edge-editor" aria-label="Melody edge editor"[^>]*>/);
assert.match(editor, /<legend>Melody edges<\/legend>/);
assert.doesNotMatch(editor, />Admin</);
assert.doesNotMatch(editor, /<span>Language<\/span>/);

// Fixed three-row geometry: languages, equal song lookups, then actions.
const languages = editor.indexOf('className="catalog-melody-edge-language-row"');
const songs = editor.indexOf('className="catalog-melody-edge-song-row"');
const actions = editor.indexOf('className="catalog-melody-edge-actions"');
assert.ok(languages >= 0 && languages < songs && songs < actions);
assert.match(css, /\.catalog-melody-edge-language-row,[\s\S]*?\.catalog-melody-edge-song-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
assert.match(css, /\.catalog-melody-edge-actions \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?justify-content: flex-start;/);

// Both controls always occupy one stable position; mode only changes disabled state.
assert.equal((editor.match(/>Add<\/button>/g) ?? []).length, 1);
assert.equal((editor.match(/>Remove<\/button>/g) ?? []).length, 1);
assert.match(editor, /disabled=\{saving \|\| edgeLoading \|\| mode !== "add"\}/);
assert.match(editor, /disabled=\{saving \|\| edgeLoading \|\| mode !== "remove"\}/);

console.log("Issue 296 Stage 6 Catalog layout refinement coverage passed.");
