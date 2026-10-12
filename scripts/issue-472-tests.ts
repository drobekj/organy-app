import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const permissions = readFileSync("src/planning-lifecycle/permissions.ts", "utf8");
const ui = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.match(
  permissions,
  /const finalSetRoles: readonly PlanningRole\[\] = \["priest", "admin"\]/,
  "Organist must not gain Finalize permission",
);

assert.match(
  ui,
  /\{canToggleWorkingReview \? \([\s\S]*?planning-reviewed-setting[\s\S]*?\) : canFinalizeSet \? \([\s\S]*?Finalize plan[\s\S]*?\) : null\}/,
  "Reviewed must occupy the same role-specific action slot as Finalize",
);

const actionRowStart = ui.indexOf('<div className="form-actions">');
assert.notEqual(actionRowStart, -1);
const workingActions = ui.slice(actionRowStart, actionRowStart + 7000);
const saveIndex = workingActions.indexOf("Save working plan");
const reviewedIndex = workingActions.indexOf("planning-reviewed-setting");
const finalizeIndex = workingActions.indexOf("Finalize plan");
const deleteIndex = workingActions.indexOf("Delete saved plan");
assert.ok(saveIndex >= 0 && reviewedIndex > saveIndex && finalizeIndex > reviewedIndex && deleteIndex > finalizeIndex);

const reviewedLabelBlock = css.match(/\.planning-reviewed-setting > span \{([^}]*)\}/)?.[1] ?? "";
assert.match(
  reviewedLabelBlock,
  /font: inherit;/,
  "Reviewed label must inherit the same font sizing/family as action buttons",
);
assert.match(reviewedLabelBlock, /font-weight: 700;/);
assert.doesNotMatch(
  reviewedLabelBlock,
  /font-size:/,
  "Reviewed label must not override action-button font size",
);

assert.match(
  ui,
  /className="workspace-toggle-switch"[\s\S]*?<span className="workspace-toggle-thumb" aria-hidden="true" \/>/,
  "Reviewed must use the same ball-style toggle classes as Guide Hints",
);
assert.doesNotMatch(
  css,
  /\.planning-reviewed-setting\s+\.workspace-toggle-switch\s*\{/,
  "Reviewed must not override the shared Guide Hints switch geometry",
);

console.log("Issue #472 Reviewed/Finalize action-slot acceptance: PASS");
