import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");

// Regression guard: protection width is applied exactly once.
// The grid track owns the target width; the slot fills that track.
assert.match(css, /\.planning-context-header \{[\s\S]*?--planning-protection-width: calc\(33\.333333% \+ 0\.066667rem \+ 1\.333333px\);[\s\S]*?grid-template-columns: minmax\(0, 1fr\) var\(--planning-protection-width\);[\s\S]*?width: 100%;/);
assert.match(css, /\.planning-melody-protection-slot \{[\s\S]*?justify-self: stretch;[\s\S]*?width: 100%;/);
assert.doesNotMatch(css, /\.planning-melody-protection-slot \{[\s\S]*?width: var\(--planning-protection-width\);/);

// Header and Service Context share the same outer width/right edge.
assert.match(css, /\.planning-service-context \{[\s\S]*?min-width: 0;[\s\S]*?width: 100%;/);

// The panel fills the corrected track and its inner select fills the panel content box.
assert.match(css, /\.melody-protection-panel \{[\s\S]*?width: 100%;/);
assert.match(css, /\.melody-protection-control select \{[\s\S]*?width: 100%;/);

// Correct width must keep the legend on one line.
assert.match(css, /\.melody-protection-panel legend \{[\s\S]*?white-space: nowrap;/);

console.log("Issue 302 Melody Protection width/alignment coverage passed.");
