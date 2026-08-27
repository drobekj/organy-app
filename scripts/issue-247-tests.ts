import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const [accountControls, styles, planning] = await Promise.all([
    readFile("app/protected-account-controls.tsx", "utf8"),
    readFile("app/issue-238-workspace.css", "utf8"),
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
  ]);

  assert.match(accountControls, /const roleMenuRef = useRef<HTMLDetailsElement>\(null\)/, "role menu ref is missing");
  assert.match(accountControls, /function resetPasswordEditor\(\)[\s\S]*?setEditingPassword\(false\)[\s\S]*?setCurrentPassword\(""\)[\s\S]*?setNewPassword\(""\)[\s\S]*?setFeedback\(null\)/, "password editor reset is incomplete");
  assert.match(accountControls, /document\.addEventListener\("pointerdown", handlePointerDown, true\)/, "outside-click close handling is missing");
  assert.match(accountControls, /document\.addEventListener\("keydown", handleKeyDown\)/, "Escape close handling is missing");
  assert.match(accountControls, /if \(userMenuRef\.current\?\.contains\(target\)\)[\s\S]*?closeRoleMenu\(\)/, "User menu does not close the role menu");
  assert.match(accountControls, /if \(roleMenuRef\.current\?\.contains\(target\)\)[\s\S]*?closeUserMenu\(\)/, "Role menu does not close/reset the User menu");
  assert.match(accountControls, /onToggle=\{\(event\) => \{[\s\S]*?if \(event\.currentTarget\.open\) closeRoleMenu\(\);[\s\S]*?else resetPasswordEditor\(\);/, "closing User menu does not reset Change Password");
  assert.match(accountControls, /workspace-role-menu[\s\S]*?ref=\{roleMenuRef\}[\s\S]*?if \(event\.currentTarget\.open\) closeUserMenu\(\)/, "opening Role menu does not close/reset User menu");
  assert.match(accountControls, /\? "Saving…" : "Save"\}/, "Change Password primary action is not labeled Save");
  assert.match(accountControls, /onClick=\{resetPasswordEditor\}>Cancel<\/button>/, "Change Password Cancel does not reset the editor");
  assert.match(styles, /\.workspace-account-actions \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, "Save and Cancel are not kept on one row");

  assert.match(planning, /const candidateValidationConflict = rowCandidateUnavailable\(row\) \|\| \([\s\S]*?selectedCandidateAvailability\.byRow\[row\.id\] === "error"/, "candidate availability conflicts are not mapped back to their Planning row");
  assert.match(planning, /const planningAlertConflict = candidateValidationConflict \|\| emptyRowValidationConflict;/, "Planning alert conflicts are not consolidated");
  assert.match(planning, /planningAlertConflict \? " planning-alert-row" : ""/, "candidate validation row alert class is missing");
  assert.match(styles, /\.planning-alert-row \{[\s\S]*?background: #fef3f2;[\s\S]*?border: 3px solid var\(--danger\);/, "Planning validation row does not use the completed-conflict alert treatment");
  assert.match(planning, /"Every candidate must be available\."/);
  assert.match(planning, /"Candidate availability could not be checked\."/);

  const personSelectMatches = planning.match(/className="planning-person-select"/g) ?? [];
  assert.equal(personSelectMatches.length, 2, "Priest and Organist must both use the normal-text select class");
  assert.match(styles, /\.planning-person-select,[\s\S]*?\.planning-person-select option \{[\s\S]*?color: var\(--foreground\);/, "Planning person menu items are not normal foreground text");

  console.log("Issue 247 workspace menu and Planning alert acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
