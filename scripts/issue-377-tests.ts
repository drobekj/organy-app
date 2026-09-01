import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GUIDE_HINTS_CHANGED_EVENT,
  GUIDE_HINTS_STORAGE_KEY,
  GUIDE_LANGUAGE_CHANGED_EVENT,
  guideHintCopy,
  guideHints,
  isGuideHintKey,
} from "../app/guide-content";

assert.equal(GUIDE_HINTS_STORAGE_KEY, "organy-guide-hints");
assert.equal(GUIDE_HINTS_CHANGED_EVENT, "organy:guide-hints-changed");
assert.equal(GUIDE_LANGUAGE_CHANGED_EVENT, "organy:guide-language-changed");
assert.equal(isGuideHintKey("planning.service-context"), true);
assert.equal(isGuideHintKey("planning.rows"), true);
assert.match(guideHintCopy("planning.service-context", "en", "priest").copy, /service/i);
assert.match(guideHintCopy("planning.rows", "cz", "organist").copy, /řádek/i);
assert.ok(Object.keys(guideHints).length >= 2);

const setting = readFileSync("app/guide-hints-setting.tsx", "utf8");
assert.match(setting, /localStorage\.getItem\(GUIDE_HINTS_STORAGE_KEY\) !== "off"/);
assert.match(setting, /role="switch"/);
assert.match(setting, /aria-checked=\{enabled\}/);
assert.match(setting, /Guide Hints/);

const guide = readFileSync("app/guide-workspace.tsx", "utf8");
assert.doesNotMatch(guide, /GUIDE_HINTS_STORAGE_KEY/);
assert.doesNotMatch(guide, /Guide hints|Našeptávač/);

const layer = readFileSync("app/guide-hint-layer.tsx", "utf8");
assert.match(layer, /GUIDE_FIELD_SELECTOR/);
assert.match(layer, /data-guide-hint-scope/);
assert.match(layer, /data-guide-hint-trigger/);
assert.match(layer, /pointerover/);
assert.match(layer, /pointerout/);
assert.match(layer, /focusin/);
assert.match(layer, /focusout/);
assert.match(layer, /suppressedFieldRef/);
assert.match(layer, /pointerdown/);
assert.doesNotMatch(layer, /guide-hint-heading/);
assert.doesNotMatch(layer, /Close hint|Zavřít nápovědu/);
assert.doesNotMatch(layer, /preventDefault\(/);

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
assert.match(planning, /data-guide-hint-scope="planning\.service-context"/);
assert.match(planning, /data-guide-hint-trigger="planning\.service-context"/);
assert.match(planning, /data-guide-hint-scope="planning\.rows"/);
assert.match(planning, /data-guide-hint-trigger="planning\.rows"/);
assert.match(planning, /<GuideHintLayer activeRole=\{selectedRole\} \/>/);

const css = readFileSync("app/workspace-shell.css", "utf8");
assert.doesNotMatch(css, /guide-hints-enabled \[data-guide-hint\]/);
assert.match(css, /\.guide-hint-popover/);
assert.match(css, /\.guide-hint-mobile/);

console.log("Issue 377 contextual Guide hints evolved acceptance passed.");
