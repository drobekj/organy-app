import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const editor = readFileSync("app/reference-melody-edge-editor.tsx", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

// Candidates is a contour legend, with both switch groups sharing one stable internal header row.
assert.match(catalog, /<fieldset className="field-group catalog-candidate-panel" aria-label="Catalog candidates"[^>]*>/);
assert.match(catalog, /<legend>Candidates<\/legend>/);
const candidateStart = catalog.indexOf('<fieldset className="field-group catalog-candidate-panel"');
const candidateEnd = catalog.indexOf('</fieldset>', candidateStart);
assert.ok(candidateStart >= 0 && candidateEnd > candidateStart);
const candidatePanel = catalog.slice(candidateStart, candidateEnd);
const headerStart = candidatePanel.indexOf('className="catalog-candidate-header"');
const availabilityStart = candidatePanel.indexOf('className="catalog-availability-switch"');
const viewStart = candidatePanel.indexOf('className="workspace-nav catalog-view-switch"');
assert.ok(headerStart >= 0 && availabilityStart > headerStart && viewStart > availabilityStart);
assert.match(candidatePanel, />\s*Available\s*<\/button>/);
assert.match(candidatePanel, />\s*Unavailable\s*<\/button>/);
assert.match(candidatePanel, />Songs<\/button>/);
assert.match(candidatePanel, />Melodies<\/button>/);
assert.doesNotMatch(catalog.slice(0, candidateStart), /className="catalog-availability-switch"/);

// Both language selectors default to Czech and selected values are bold only inside Melody Edges.
assert.equal((editor.match(/useState<SongLanguage>\("czech"\)/g) ?? []).length, 2);
assert.doesNotMatch(editor, /useState<SongLanguage>\("polish"\)/);
assert.match(css, /\.catalog-melody-edge-language-row > select \{[\s\S]*?font-weight: 700;/);
assert.match(css, /\.melody-edge-selected-value \{\s*font-weight: 700;/);
assert.match(editor, /selectedValueClassName="melody-edge-selected-value"/);
assert.match(lookup, /selectedValueClassName\?: string/);
assert.match(lookup, /className=\{selected && !\(open && dirty\) \? selectedValueClassName : undefined\}/);

// Contextual melody-class gray-out is symmetric.
assert.match(editor, /getMelodyClass\(firstSong\.id\)/);
assert.match(editor, /getMelodyClass\(secondSong\.id\)/);
assert.match(editor, /secondClassMemberIds/);
assert.match(editor, /isOutsideReferenceMelodyClass\(record\.id, secondSong\?\.id, secondClassMemberIds\)/);
assert.match(editor, /isOutsideReferenceMelodyClass\(record\.id, firstSong\?\.id, firstClassMemberIds\)/);

// Recompute refresh updates both selected sides before exposing the next editor state.
assert.match(editor, /const \[nextFirstClass, nextSecondClass, nextEdge\] = await Promise\.all\(\[/);
assert.match(editor, /getMelodyClass\(firstSong\.id\),\s*getMelodyClass\(secondSong\.id\),\s*getMelodyEdge\(firstSong\.id, secondSong\.id\)/);

// Gray-out remains visual only, not a selection restriction.
assert.match(css, /\.reference-song-option-outside-melody \{[\s\S]*?color: var\(--muted\);/);
assert.doesNotMatch(lookup, /disabled=\{[^}]*getOptionClassName/);

console.log("Issue 298 Stage 6 Candidates and symmetric Melody Edges refinement coverage passed.");
