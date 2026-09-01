import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controls = readFileSync("app/protected-account-controls.tsx", "utf8");
const hintsSetting = readFileSync("app/guide-hints-setting.tsx", "utf8");
const guide = readFileSync("app/guide-workspace.tsx", "utf8");
const layer = readFileSync("app/guide-hint-layer.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const css = readFileSync("app/workspace-shell.css", "utf8");

const signRole = controls.indexOf("workspace-sign-role-menu");
const guideHints = controls.indexOf("<GuideHintsSetting");
const phone = controls.indexOf("<ProtectedWhatsAppPhoneSetting");
assert.ok(signRole >= 0 && signRole < guideHints && guideHints < phone, "Guide Hints must sit between Sign Role and Phone Setting.");

assert.match(hintsSetting, /role="switch"/);
assert.match(hintsSetting, /aria-checked=\{enabled\}/);
assert.match(hintsSetting, /GUIDE_HINTS_STORAGE_KEY/);
assert.match(hintsSetting, /!== "off"/, "Hints must default ON unless explicitly disabled.");

assert.doesNotMatch(guide, /Guide hints|Našeptávač/);
assert.match(guide, /aria-pressed=\{language === "en"\}/);
assert.match(guide, /aria-pressed=\{language === "cz"\}/);
assert.match(css, /\.guide-language button\[aria-pressed="true"\] \{[\s\S]*?background: var\(--foreground\);[\s\S]*?color: #fff;/);

assert.match(planning, /<fieldset className="field-group planning-service-context" data-guide-hint-scope="planning\.service-context">/);
assert.match(planning, /data-guide-hint-trigger="planning\.service-context"/);
assert.match(planning, /<fieldset className="planning-rows-panel" data-guide-hint-scope="planning\.rows">/);
assert.match(planning, /<legend>Rows<\/legend>/);
assert.match(planning, /data-guide-hint-trigger="planning\.rows"/);
assert.match(planning, />\s*Add row\s*<\/button>/);

assert.match(layer, /\\[data-guide-hint\\]/);
assert.match(layer, /onPointerOver/);
assert.match(layer, /onPointerOut/);
assert.match(layer, /onFocusIn/);
assert.match(layer, /onPointerDown/);
assert.match(layer, /suppressedFieldRef\.current = field/);
assert.doesNotMatch(layer, /Close hint|Zavřít nápovědu|guide-hint-heading/);

assert.doesNotMatch(css, /cursor: help/);
assert.doesNotMatch(css, /guide-hints-enabled \[data-guide-hint\]/);
assert.match(css, /\.planning-rows-panel \{[\s\S]*?border: 1px solid var\(--border\);[\s\S]*?border-radius: 1rem;/);
assert.match(css, /\.guide-scope-info \{[\s\S]*?position: absolute;/);
assert.match(css, /\.workspace-account-popover \.workspace-toggle-switch\[aria-checked="true"\] \{[\s\S]*?background: var\(--foreground\);/);

assert.match(css, /\.workspace-nav-about \{[\s\S]*?padding-bottom: 0;/);
assert.doesNotMatch(css, /\.workspace-nav-about \{[\s\S]*?border-bottom:/);
assert.match(css, /--workspace-nav-button-height: 2\.35rem;/);
assert.match(css, /--workspace-nav-half-button-height: 1\.175rem;/);
assert.match(css, /margin-top: calc\(0\.65rem \+ var\(--workspace-nav-half-button-height\)\);/);

console.log("Issue 379 Planning hint UX refinement acceptance passed.");
