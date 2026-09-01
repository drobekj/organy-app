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

const expectedKeys = [
  "planning.service-context",
  "planning.rows",
  "planning.lifecycle",
  "planning.melody-protection",
  "plans.records",
  "history.records",
  "catalog.context",
  "catalog.candidates",
  "catalog.preference",
  "development.runtime",
] as const;

assert.equal(GUIDE_HINTS_STORAGE_KEY, "organy-guide-hints");
assert.equal(GUIDE_HINTS_CHANGED_EVENT, "organy:guide-hints-changed");
assert.equal(GUIDE_LANGUAGE_CHANGED_EVENT, "organy:guide-language-changed");
assert.deepEqual(Object.keys(guideHints), expectedKeys);
for (const key of expectedKeys) {
  assert.equal(isGuideHintKey(key), true);
  assert.ok(guideHints[key].title.en.trim());
  assert.ok(guideHints[key].title.cz.trim());
  assert.ok(guideHints[key].copy.en.trim());
  assert.ok(guideHints[key].copy.cz.trim());
}
assert.equal(isGuideHintKey("unknown.hint"), false);

const priestPreference = guideHintCopy("catalog.preference", "en", "priest");
const organistPreference = guideHintCopy("catalog.preference", "cz", "organist");
assert.match(priestPreference.roleCopy ?? "", /0–3/);
assert.match(organistPreference.roleCopy ?? "", /0–2/);
assert.match(guideHintCopy("planning.lifecycle", "en", "organist").roleCopy ?? "", /cannot finalize/i);

const guide = readFileSync("app/guide-workspace.tsx", "utf8");
assert.match(guide, /GUIDE_HINTS_STORAGE_KEY/);
assert.match(guide, /localStorage\.setItem\(GUIDE_HINTS_STORAGE_KEY, enabled \? "on" : "off"\)/);
assert.match(guide, /GUIDE_HINTS_CHANGED_EVENT/);
assert.match(guide, /Guide hints/);
assert.match(guide, /Našeptávač/);

const layer = readFileSync("app/guide-hint-layer.tsx", "utf8");
assert.match(layer, /pointerover/);
assert.match(layer, /focusin/);
assert.match(layer, /event\.pointerType !== "touch"/);
assert.match(layer, /guide-hint-mobile/);
assert.match(layer, /role="tooltip"/);
assert.doesNotMatch(layer, /preventDefault\(/, "Hint layer must not consume underlying control activation");

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
for (const key of ["planning.service-context", "planning.rows", "planning.lifecycle", "development.runtime"]) {
  assert.ok(planning.includes(`data-guide-hint="${key}"`), `Missing ${key} marker`);
}
assert.match(planning, /<GuideHintLayer activeRole=\{selectedRole\} \/>/);

const nonRepetition = readFileSync("app/non-repetition-period-panel.tsx", "utf8");
assert.match(nonRepetition, /data-guide-hint="planning\.melody-protection"/);

const records = readFileSync("app/plan-history-record-lists.tsx", "utf8");
assert.match(records, /data-guide-hint="plans\.records"/);
assert.match(records, /data-guide-hint="history\.records"/);

const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
assert.match(catalog, /data-guide-hint="catalog\.context"/);
assert.match(catalog, /data-guide-hint="catalog\.candidates"/);

const detail = readFileSync("src/planning-lifecycle/melody-detail.tsx", "utf8");
assert.match(detail, /data-guide-hint="catalog\.preference"/);

const css = readFileSync("app/workspace-shell.css", "utf8");
assert.match(css, /\.guide-hints-enabled \[data-guide-hint\]/);
assert.match(css, /\.guide-hint-popover/);
assert.match(css, /\.guide-hint-mobile \{[\s\S]*?bottom:/);

console.log("Issue 377 contextual Guide hints acceptance passed.");
