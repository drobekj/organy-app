import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const [planning, styles] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("app/workspace-shell.css", "utf8"),
  ]);

  assert.match(
    planning,
    /const hasEmptyRowValidation = !isCompletedRecordOpen && validationResults\.some\(\(result\) => result\.issues\.some\(\(issue\) => issue\.path === "row"\)\);/,
    "global empty-row validation message is missing",
  );
  assert.match(
    planning,
    /"Every row must include either a complete song reference or a non-empty textual note\."/,
    "empty-row Planning alert text is missing",
  );
  assert.match(
    planning,
    /const emptyRowValidationConflict = !isCompletedRecordOpen[\s\S]*?validationResults\[index\]\?\.issues\.some\(\(issue\) => issue\.path === "row"\)/,
    "row-level validation is not mapped back to the responsible Planning row",
  );
  assert.match(
    planning,
    /const planningAlertConflict = candidateValidationConflict \|\| emptyRowValidationConflict;/,
    "empty-row validation is not included in the shared Planning alert outline",
  );
  assert.match(
    planning,
    /planningAlertConflict \? " planning-alert-row" : ""/,
    "shared Planning alert row class is missing",
  );
  assert.match(
    styles,
    /\.planning-alert-row \{[\s\S]*?background: #fef3f2;[\s\S]*?border: 3px solid var\(--danger\);/,
    "empty-row alert does not reuse the conflict-change alert treatment",
  );

  assert.match(
    planning,
    /className="row-icon-button row-icon-remove" aria-label="Remove row"/,
    "remove-row control is missing",
  );
  assert.match(
    styles,
    /\.row-icon-remove \{\s*color: var\(--foreground\);\s*\}/,
    "remove-row icon is not normalized to the standard foreground color",
  );

  console.log("Issue 249 empty-row alert and remove-icon acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
