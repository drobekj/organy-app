import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function main(): void {
  const signInPage = readFileSync("app/sign-in/page.tsx", "utf8");
  const signInForm = readFileSync("app/sign-in/protected-sign-in-form.tsx", "utf8");
  const congregationPage = readFileSync("app/congregation-preferences/page.tsx", "utf8");
  const guideLayer = readFileSync("app/guide-hint-layer.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  const modeSource = readFileSync("src/application/congregation-voter-mode.ts", "utf8");
  const docs = readFileSync("docs/congregation-voter-temporary-mode.md", "utf8");

  assert.match(signInPage, /congregationVoterMode\(\)/);
  assert.match(signInPage, /ProtectedSignInForm congregationVoterMode=/);

  assert.match(signInForm, /<section className="auth-card">/);
  assert.doesNotMatch(signInForm, /<form className="auth-card"/);
  assert.match(signInForm, /Sign In/);
  assert.match(signInForm, /Vote for Songs/);
  assert.match(signInForm, /For priest, organist, or admin\./);
  assert.match(signInForm, /Vote without signing in\. Your votes stay linked to this browser\./);
  assert.match(signInForm, /name="action" value="startTemporaryVoting"/);
  assert.match(signInForm, /congregationVoterMode === "temporaryBrowser"/);
  assert.match(signInForm, /href="\/congregation-preferences\?entry=1"/);
  assert.match(signInForm, /data-auth-entry-info-trigger/);
  assert.match(signInForm, /data-auth-entry-info-panel/);
  assert.match(signInForm, /isInteractiveTarget/);

  assert.match(congregationPage, /if \(temporaryMode\) redirect\("\/sign-in"\)/);
  assert.match(congregationPage, /TEMPORARY_ACCOUNT_PREFIX/);
  assert.doesNotMatch(congregationPage, /temporaryEntryPanel/);
  assert.doesNotMatch(congregationPage, /Start voting/);
  assert.doesNotMatch(congregationPage, /Temporary test mode:/);
  assert.match(congregationPage, /function registrationPanel/);
  assert.match(congregationPage, /function recoveryPanel/);
  assert.match(congregationPage, /view === "register"/);
  assert.match(congregationPage, /view === "recover"/);

  assert.match(guideLayer, /function insideInfoPopover/);
  assert.match(guideLayer, /function interactiveTarget/);
  assert.match(guideLayer, /insideInfoPopover\(event\.target\) \|\| interactiveTarget\(event\.target\)/);
  assert.match(guideLayer, /current\?\.mode === "info" \? null : current/);

  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /\.auth-entry-info-button/);
  assert.match(css, /@media \(max-width: 700px\), \(pointer: coarse\)/);

  assert.match(modeSource, /return "temporaryBrowser"/);
  assert.match(modeSource, /registered-email implementation remains dormant/);

  assert.match(docs, /engagement and preference signal, not a guaranteed unique-person vote count/i);
  assert.match(docs, /No device fingerprinting, IP-based deduplication, anti-abuse identity matching/i);
  assert.match(docs, /registered-email implementation, database shape and registration\/recovery UI remain/i);

  console.log("Issue #462 congregation entry and info dismissal acceptance: PASS");
}

main();
