import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isOutsideReferenceMelodyClass,
  resolveReferenceMelodyEdgeEditorMode,
} from "../src/application/reference-melody-edge-editor";

assert.equal(resolveReferenceMelodyEdgeEditorMode(undefined, undefined, undefined), "incomplete");
assert.equal(resolveReferenceMelodyEdgeEditorMode("czech:1", undefined, undefined), "incomplete");
assert.equal(resolveReferenceMelodyEdgeEditorMode("czech:1", "czech:1", undefined), "self");
assert.equal(resolveReferenceMelodyEdgeEditorMode("czech:1", "polish:1", undefined), "checking");
assert.equal(resolveReferenceMelodyEdgeEditorMode("czech:1", "polish:1", false), "add");
assert.equal(resolveReferenceMelodyEdgeEditorMode("czech:1", "polish:1", true), "remove");

const firstClass = new Set(["czech:1", "polish:1"]);
assert.equal(isOutsideReferenceMelodyClass("polish:1", "czech:1", firstClass), false);
assert.equal(isOutsideReferenceMelodyClass("polish:2", "czech:1", firstClass), true);
assert.equal(isOutsideReferenceMelodyClass("polish:2", undefined, firstClass), false);
assert.equal(isOutsideReferenceMelodyClass("polish:2", "czech:1", undefined), false);

const editor = readFileSync("app/reference-melody-edge-editor.tsx", "utf8");
const lookup = readFileSync("app/reference-song-lookup-field.tsx", "utf8");
const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const melody = readFileSync("src/application/reference-melody.ts", "utf8");
const route = readFileSync("app/api/interaction/route.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const journal = readFileSync("drizzle/meta/_journal.json", "utf8");

assert.equal((editor.match(/useState<SongLanguage>\("czech"\)/g) ?? []).length, 2, "Both Melody Edges languages default to Czech.");
assert.match(editor, /side="first"/);
assert.match(editor, /side="second"/);
assert.match(editor, /melody-edge-\$\{side\}-song-listbox/);
assert.match(editor, /setFirstLanguage\(event\.target\.value as SongLanguage\);\s*setFirstSong\(null\)/);
assert.match(editor, /setSecondLanguage\(event\.target\.value as SongLanguage\);\s*setSecondSong\(null\)/);

assert.match(editor, /getMelodyClass\(firstSong\.id\)/);
assert.match(editor, /getMelodyClass\(secondSong\.id\)/);
assert.match(editor, /isOutsideReferenceMelodyClass\(record\.id, firstSong\?\.id, firstClassMemberIds\)/);
assert.match(editor, /isOutsideReferenceMelodyClass\(record\.id, secondSong\?\.id, secondClassMemberIds\)/);
assert.match(editor, /reference-song-option-outside-melody/);
assert.match(lookup, /getOptionClassName\?: \(record: ReferenceCatalogRecord\) => string \| undefined/);
assert.match(lookup, /selectedValueClassName\?: string/);
assert.match(lookup, /getOptionClassName\?\.\(record\)/);
assert.match(editor, /selectedValueClassName="melody-edge-selected-value"/);
assert.doesNotMatch(lookup, /disabled=\{[^}]*getOptionClassName/);

assert.match(editor, /disabled=\{saving \|\| edgeLoading \|\| mode !== "add"\}[\s\S]*?mutate\("add"\)[\s\S]*?>Add<\/button>/);
assert.match(editor, /disabled=\{saving \|\| edgeLoading \|\| mode !== "remove"\}[\s\S]*?mutate\("remove"\)[\s\S]*?>Remove<\/button>/);
assert.equal((editor.match(/>Add<\/button>/g) ?? []).length, 1, "Add must have one stable rendered position.");
assert.equal((editor.match(/>Remove<\/button>/g) ?? []).length, 1, "Remove must have one stable rendered position.");
assert.match(editor, /cannot connect a song to itself/);

assert.match(editor, /await Promise\.all\(\[refreshEditorState\(\), onChanged\(\)\]\)/);
assert.match(catalog, /runtime === "db" && actor\.role === "admin" && <ReferenceMelodyEdgeEditor/);
assert.match(catalog, /await reloadCandidates\(\);\s*onMelodyStructureChanged\?\.\(\)/);

const planningRefreshStart = planning.indexOf("onMelodyStructureChanged={() => {");
assert.ok(planningRefreshStart >= 0, "Planning melody-structure invalidation callback is missing.");
const planningRefresh = planning.slice(planningRefreshStart, planning.indexOf("}}", planningRefreshStart) + 2);
assert.match(planningRefresh, /lookupTracker\.invalidatePrefix\("song:"\)/);
assert.match(planningRefresh, /setCandidateResults\(\{\}\)/);
assert.match(planningRefresh, /setCandidateLoading\(\{\}\)/);
assert.match(planningRefresh, /setCandidateErrors\(\{\}\)/);
assert.match(planningRefresh, /setSelectedCandidateAvailability\(\{ key: "", byRow: \{\} \}\)/);
assert.match(planningRefresh, /resetDetailEligibility\(\)/);
assert.match(planningRefresh, /setPlanningExpansion\(null\)/);
assert.match(planningRefresh, /setCandidateRefreshGeneration/);

assert.match(melody, /if \(actor\.role !== "admin"\) return fail\("permissionDenied", "Only admin may add Reference melody edges\."/);
assert.match(melody, /if \(actor\.role !== "admin"\) return fail\("permissionDenied", "Only admin may remove Reference melody edges\."/);
assert.match(route, /case "getReferenceMelodyEdge"/);
assert.match(route, /case "addReferenceMelodyEdge"/);
assert.match(route, /case "removeReferenceMelodyEdge"/);

assert.match(css, /\.reference-song-option-outside-melody \{[\s\S]*?color: var\(--muted\);/);
assert.match(css, /\.catalog-melody-edge-language-row,[\s\S]*?\.catalog-melody-edge-song-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
assert.match(css, /\.catalog-melody-edge-actions \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?justify-content: flex-start;/);

assert.match(journal, /"tag": "0020_reference_melody_edges"/);
assert.doesNotMatch(journal, /"tag": "[0-9]+_issue_293/);

assert.doesNotMatch(planning, /syntheticScaleSongs|createSyntheticScaleSongs\(1600\)/);
assert.doesNotMatch(planning, /selectedCatalogTab|selectedReferenceId|referenceMelodySearch/);
assert.match(planning, /<CatalogWorkspace/);
assert.match(planning, /onMelodyStructureChanged=\{\(\) => \{/);

console.log("Issue 293 Stage 6 Catalog melody edge editor coverage passed.");
