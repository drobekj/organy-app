import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const [accountControls, layout, styles, planning] = await Promise.all([
    readFile("app/protected-account-controls.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
    readFile("app/workspace-shell.css", "utf8"),
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
  ]);

  assert.match(layout, /import "\.\/issue-238-workspace\.css";/, "Issue 238 workspace styles are not loaded");

  assert.match(accountControls, /createPortal/, "account controls are not portaled into the workspace header");
  assert.match(accountControls, /document\.querySelector<HTMLElement>\("\.app-header"\)/, "workspace header portal target is missing");
  assert.match(accountControls, /header\.tabIndex = 0/, "workspace helper is not keyboard-focusable");
  assert.match(accountControls, /aria-describedby/, "workspace helper copy is not exposed as a description");
  assert.match(accountControls, /titleArea\.addEventListener\("click", titleTapHandler\)/, "workspace helper is not touch\/tap accessible");

  assert.match(accountControls, /<details[\s\S]*?className="workspace-account-menu"/, "User menu is not a native keyboard\/touch details menu");
  assert.match(accountControls, />Change Password<\/button>/, "User menu is missing Change Password");
  assert.match(accountControls, /"Signing Out…" : "Sign Out"/, "User menu is missing pending-aware Sign Out");
  assert.match(accountControls, /Role <strong>Admin<\/strong>/, "Admin role menu label is missing");
  assert.match(accountControls, />Manage Accounts<\/a>/, "Admin role menu is missing Manage Accounts");
  assert.match(accountControls, />Audit History<\/a>/, "Admin role menu is missing Audit History");
  assert.match(accountControls, /activeAdmin \? \(/, "Role-specific menu is not conditional on the active Admin role");
  assert.match(accountControls, /workspace-role-label/, "roles without actions do not fall back to a plain role label");

  assert.match(accountControls, /window\.fetch = trackedFetch/, "DB-backed workspace action pending guard is missing");
  assert.match(accountControls, /button\.disabled = true/, "pending workspace actions do not prevent double-submit");
  assert.match(accountControls, /button\.setAttribute\("aria-busy", "true"\)/, "pending workspace actions do not expose aria-busy");
  assert.match(accountControls, /workspace-action-pending/, "pending workspace actions lack a visual processing state");
  assert.match(accountControls, /pendingAction === "changePassword"/, "password action pending state is missing");

  assert.match(styles, /\.planning-card > \.eyebrow,[\s\S]*?display: none !important;/, "persistent eyebrow helper copy is still visible");
  assert.match(styles, /\.role-pill[\s\S]*?display: none !important;/, "old simulated-user role pill is still visible");
  assert.match(styles, /\.app-header h1 \{[\s\S]*?font-size: clamp\(1\.75rem, 4vw, 2\.6rem\);/, "workspace section heading is not compact");
  assert.match(styles, /\.app-header \.lede \{[\s\S]*?background: #fffbeb;[\s\S]*?opacity: 0;/, "helper copy is not a hidden light-yellow helper surface");
  assert.match(styles, /\.app-header > div:first-child:hover \.lede,[\s\S]*?\.app-header:focus \.lede/, "helper copy is not exposed on hover and keyboard focus");

  assert.ok(planning.includes('className={`status status-${saveState}`}'), "existing persistence status semantics were removed");
  assert.ok(planning.includes('className="saved-summary"'), "existing opened-service summary semantics were removed");
  assert.match(styles, /\.planning-card > \.status \{[\s\S]*?order: -30;/, "persistence status is not moved under the title");
  assert.match(styles, /\.planning-card > \.saved-summary \{[\s\S]*?order: -29;/, "opened-service summary is not consolidated under the title");
  assert.match(styles, /\.status,[\s\S]*?\.saved-summary \{[\s\S]*?font-size: 0\.82rem;/, "status block is not compact");

  assert.match(styles, /@media \(max-width: 899px\)/, "notebook-width responsive coverage is missing");
  assert.match(styles, /max-width: calc\(100vw - 2rem\)/, "account popover lacks narrow-width overflow protection");

  console.log("Issue 238 compact workspace acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
