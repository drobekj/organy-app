import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const account = readFileSync("app/protected-account-controls.tsx", "utf8");
const workspaceCss = readFileSync("app/workspace-shell.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

assert.match(account, /className="workspace-sign-role-arrow"[^>]*\/>/, "Sign Role must use a CSS chevron indicator rather than a text glyph");
assert.match(workspaceCss, /\.workspace-sign-role-arrow \{[\s\S]*?border-bottom: 2px solid currentColor;[\s\S]*?border-right: 2px solid currentColor;[\s\S]*?transform: rotate\(45deg\);/, "Sign Role closed indicator must be a down chevron");
assert.match(workspaceCss, /\.workspace-sign-role-options \{[\s\S]*?direction: rtl;[\s\S]*?scrollbar-gutter: stable;/, "Sign Role scroll gutter must stay on the left so option buttons align to the right edge");
assert.match(workspaceCss, /\.workspace-sign-role-options button \{[\s\S]*?direction: ltr;[\s\S]*?text-align: left;/, "Sign Role role labels must remain left-aligned");
assert.match(workspaceCss, /\.workspace-sign-role-options \{[\s\S]*?max-height: 9rem;[\s\S]*?overflow-y: auto;/, "Sign Role role list must remain scrollable");

assert.match(globals, /\.planning-context-header \{[\s\S]*?--planning-protection-height: 4\.75rem;/, "Melody Protection reserved height must be compact");
assert.match(globals, /\.planning-context-header \{[\s\S]*?--planning-protection-width: calc\(33\.333333% \+ 0\.066667rem \+ 1\.333333px\);/, "Melody Protection corrected width must stay unchanged");
assert.match(globals, /\.planning-melody-protection-slot \{[\s\S]*?height: var\(--planning-protection-height\);[\s\S]*?width: 100%;/, "Melody Protection slot must keep fixed reserved geometry");
assert.match(globals, /\.melody-protection-panel \{[\s\S]*?gap: 0\.25rem;[\s\S]*?height: 100%;[\s\S]*?padding: 0\.45rem 0\.7rem;[\s\S]*?width: 100%;/, "Melody Protection contour must tightly and symmetrically frame its control");
assert.match(globals, /\.melody-protection-control select \{[\s\S]*?min-height: 2\.55rem;[\s\S]*?width: 100%;/, "Melody Protection select geometry must stay unchanged");

console.log("Issue 306 Sign Role and Melody Protection visual polish coverage passed.");
