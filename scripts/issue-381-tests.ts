import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const css = readFileSync("app/workspace-shell.css", "utf8");

const rowsPanelStart = planning.indexOf('<fieldset className="planning-rows-panel" data-guide-hint-scope="planning.rows">');
assert.ok(rowsPanelStart >= 0, "Rows panel must exist.");

const rowsListStart = planning.indexOf('<div className="rows-list">', rowsPanelStart);
const addRowStart = planning.indexOf("Add row", rowsPanelStart);
assert.ok(rowsListStart >= 0 && addRowStart > rowsListStart, "Add row must be rendered after the Rows list, not above it.");

assert.match(
  planning.slice(rowsPanelStart, addRowStart + 200),
  /\{rows\.map\([\s\S]*?\}\)\}\s*<\/div>\s*<div className="rows-header">[\s\S]*?>\s*Add row\s*<\/button>/,
  "Add row must be the final control after the rendered row list."
);

assert.match(css, /\.planning-rows-panel > \.rows-header \{[\s\S]*?justify-content: flex-end;[\s\S]*?\}/);
assert.doesNotMatch(css, /\.planning-rows-panel > \.rows-header \{[\s\S]*?margin-top: -0\.45rem;/);

assert.match(css, /\.guide-scope-info \{[\s\S]*?box-shadow: 0 0 0 0\.24rem var\(--surface\);/);
assert.match(css, /\.guide-scope-info \{[\s\S]*?box-sizing: border-box;/);
assert.match(css, /\.guide-scope-info \{[\s\S]*?right: 1\.4rem;/);
assert.match(css, /\.guide-scope-info \{[\s\S]*?top: -0\.8rem;/);

assert.match(css, /--workspace-nav-button-height: 2\.35rem;/);
assert.match(css, /--workspace-nav-half-button-height: 1\.175rem;/);
const halfSpacingMatches = css.match(/margin-top: calc\(0\.65rem \+ var\(--workspace-nav-half-button-height\)\);/g) ?? [];
assert.equal(halfSpacingMatches.length, 2, "Desktop and mobile DrSoft separator spacing must both move up by half a Guide button height.");
assert.doesNotMatch(css, /margin-top: calc\(0\.65rem \+ var\(--workspace-nav-button-height\)\);/);

console.log("Issue 381 Planning rows and Guide footer corrective acceptance passed.");
