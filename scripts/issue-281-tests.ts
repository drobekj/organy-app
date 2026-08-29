import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("app/catalog-workspace.tsx", "utf8");
const detail = readFileSync("src/planning-lifecycle/melody-detail.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.doesNotMatch(workspace, /CatalogPreferencePanel/, "Standalone Catalog preference panel must be removed.");
for (const obsolete of ["Aggregate preference:", "My current:", "Profile:", "Allowed range:", "Draft value", "Save preference"]) {
  assert.ok(!workspace.includes(obsolete), `Catalog must not duplicate preference UI: ${obsolete}`);
}

assert.match(detail, /member\.songId === props\.candidate\.songId && props\.personalPreference/);
assert.ok(detail.includes("<span>Personal preference</span>"));
assert.match(detail, /aria-label=\{\`Personal preference for \$\{member\.number\} \$\{member\.title\}\`\}/);
assert.match(workspace, /actor\.role !== "organist" && actor\.role !== "priest"/);
assert.match(workspace, /Array\.from\(\{ length: ownPreference\.limit \+ 1 \}, \(_, value\) => value\)/);

assert.match(workspace, /async function persistPreferenceOnDetailExit/);
assert.match(workspace, /preference\.score === score/);
assert.match(workspace, /saveOwnPreference\(candidate\.songId, score\)/);
assert.match(workspace, /function leaveDetail\(\)/);
for (const exit of ["onBack={leaveDetail}", "onClose={leaveDetail}", "onEscape={leaveDetail}", "dismissOnOutsidePointer"]) {
  assert.ok(workspace.includes(exit), `Catalog detail exit must autosave through: ${exit}`);
}
assert.match(detail, /props\.mode !== "selected" && !props\.dismissOnOutsidePointer/);
assert.match(detail, /document\.addEventListener\("pointerdown", dismissSelectedDetailOnOutsidePointer, true\)/);

assert.match(css, /\.catalog-candidate-row \{[\s\S]*?position: relative;/);
assert.match(css, /\.catalog-candidate-row > \.melody-detail-candidate \{[\s\S]*?position: absolute !important;[\s\S]*?right: 0;[\s\S]*?width: min\(82%, 46rem\) !important;/);
assert.match(css, /\.melody-personal-preference \{[\s\S]*?margin-left: auto;[\s\S]*?width: 13rem;/);
assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 3\.25rem;/);

console.log("Issue 281 compact Catalog personal preference detail coverage passed.");
