import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const account = readFileSync("app/protected-account-controls.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const css = readFileSync("app/issue-238-workspace.css", "utf8");

const signRoleIndex = account.indexOf("<span>Sign Role</span>");
const changePasswordIndex = account.indexOf(">Change Password</button>");
const signOutIndex = account.indexOf('"Signing Out…" : "Sign Out"');
assert.ok(signRoleIndex >= 0, "User menu must contain Sign Role");
assert.ok(signRoleIndex < changePasswordIndex && changePasswordIndex < signOutIndex, "User menu order must be Sign Role, Change Password, Sign Out");

assert.match(account, /className="workspace-sign-role-menu"/, "Sign Role must be a nested menu");
assert.match(account, /className="workspace-sign-role-arrow"[^>]*\/>/, "Sign Role menu must expose a chevron indicator");
assert.match(account, /const assignedRoles = roles\.filter\(isPlanningRole\);/, "Only assigned planning roles may be offered");
assert.match(account, /assignedRoles\.map\(\(role\) => \([\s\S]*?onClick=\{\(\) => selectSignedInRole\(role\)\}/, "Assigned roles must be selectable");
assert.match(account, /document\.cookie = serializeActiveRoleCookie\(role\);[\s\S]*?dispatchEvent\(new CustomEvent\(ACTIVE_ROLE_CHANGED_EVENT, \{ detail: role \}\)\)/, "Role choice must use the authoritative cookie + event contract");

assert.match(planning, /addEventListener\(ACTIVE_ROLE_CHANGED_EVENT, handleSignedInRoleChange\)/, "Planning must listen to account-menu role changes");
assert.match(planning, /isPlanningRole\(role\) && storedUser\.roles\.includes\(role\)[\s\S]*?setSelectedAssignedRole\(role\)/, "Planning must accept only roles owned by the signed-in user");
assert.equal((planning.match(/Assigned role/g) ?? []).length, 1, "Assigned role selector must remain only in memory-development controls");
assert.match(planning, /Authenticated user[\s\S]*?Role switching is available from the User menu\./, "DB Development must direct role switching to User menu");

assert.match(css, /\.workspace-sign-role-options \{[\s\S]*?max-height: 9rem;[\s\S]*?overflow-y: auto;/, "Role choices must be vertically scrollable");
assert.match(css, /\.workspace-sign-role-arrow \{[\s\S]*?border-bottom: 2px solid currentColor;[\s\S]*?border-right: 2px solid currentColor;[\s\S]*?transform: rotate\(45deg\);/, "Sign Role must use a select-style chevron");
assert.match(css, /\.workspace-sign-role-menu\[open\] > summary \.workspace-sign-role-arrow \{[\s\S]*?transform: rotate\(225deg\);/, "Sign Role chevron must indicate expanded state");

// Admin-specific role menu remains separate and unchanged.
assert.match(account, /workspace-role-menu/);
assert.match(account, />Manage Accounts<\/a>/);
assert.match(account, />Audit History<\/a>/);

console.log("Issue 304 User-menu Sign Role relocation coverage passed.");
