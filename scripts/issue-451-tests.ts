import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("app/workspace-shell.css", "utf8");
const guideSetting = readFileSync("app/guide-hints-setting.tsx", "utf8");
const accountControls = readFileSync("app/protected-account-controls.tsx", "utf8");

// The account popover's full-width action-button contract must explicitly exclude
// compact switches. Otherwise the descendant selector has greater specificity than
// `.workspace-toggle-switch` and turns the Guide Hints switch into a full-width bar.
assert.match(
  shell,
  /\.workspace-account-popover a,\s*\.workspace-account-popover button:not\(\.workspace-toggle-switch\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?\}/,
);
assert.doesNotMatch(
  shell,
  /\.workspace-account-popover button\s*\{[\s\S]*?width:\s*100%;/,
  "Account popover must not apply full-width action geometry to every descendant button.",
);

const toggleRule = shell.match(/\.workspace-toggle-switch\s*\{([\s\S]*?)\}/)?.[1] ?? "";
for (const required of [
  /display:\s*flex;/,
  /flex:\s*0 0 auto;/,
  /height:\s*1\.4rem;/,
  /min-height:\s*1\.4rem;/,
  /width:\s*2\.6rem;/,
  /border-radius:\s*999px;/,
]) {
  assert.match(toggleRule, required, `Guide Hints switch geometry lost: ${required}`);
}

const settingRule = shell.match(/\.workspace-guide-hints-setting\s*\{([\s\S]*?)\}/)?.[1] ?? "";
assert.match(settingRule, /display:\s*flex;/);
assert.match(settingRule, /justify-content:\s*space-between;/);
assert.match(settingRule, /min-width:\s*0;/);
assert.match(shell, /\.workspace-guide-hints-setting > span\s*\{[\s\S]*?white-space:\s*nowrap;/);

// Preserve semantic switch behavior and the exact component placement in the User menu.
assert.match(guideSetting, /className="workspace-toggle-switch"/);
assert.match(guideSetting, /role="switch"/);
assert.match(guideSetting, /aria-checked=\{enabled\}/);
assert.match(accountControls, /<GuideHintsSetting \/>/);

// Audit the other current nested account-menu controls. They intentionally keep
// the full-width action contract and must remain present after narrowing the selector.
for (const expected of [
  "workspace-sign-role-options",
  "ProtectedWhatsAppPhoneSetting",
  "Change Password",
  "Sign Out",
  "workspace-account-actions",
  "Verify DB",
]) {
  assert.ok(accountControls.includes(expected), `Account-menu regression audit lost: ${expected}`);
}

console.log("Issue 451 account-menu nested-control regression acceptance passed.");
