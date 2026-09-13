import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const client = await readFile("app/planning-lifecycle-client.tsx", "utf8");

  const workingBlockStart = client.indexOf("{!isCompletedRecordOpen && !isFinalSetOpen && (");
  const finalBlockStart = client.indexOf("{!isCompletedRecordOpen && isFinalSetOpen && (", workingBlockStart);
  const completedBlockStart = client.indexOf("{isCompletedRecordOpen && presentationRole === \"admin\"", finalBlockStart);

  assert.ok(workingBlockStart >= 0, "Working Plan action block must remain explicit.");
  assert.ok(finalBlockStart > workingBlockStart, "Final Plan action block must follow the Working Plan action block.");
  assert.ok(completedBlockStart > finalBlockStart, "Completed-plan action block must follow the Final Plan action block.");

  const workingBlock = client.slice(workingBlockStart, finalBlockStart);
  const finalBlock = client.slice(finalBlockStart, completedBlockStart);

  const leaveButtonPattern = /<button type="button" data-guide-hint="planning\.lifecycle\.leave-final" onClick=\{\(\) => \{ void startNewDbDraft\(\); \}\}>\s*Leave Plan\s*<\/button>/g;
  const workingLeaveButtons = workingBlock.match(leaveButtonPattern) ?? [];
  const finalLeaveButtons = finalBlock.match(leaveButtonPattern) ?? [];

  assert.equal(workingLeaveButtons.length, 1, "Opened Working Plan must expose exactly one Leave Plan action.");
  assert.equal(finalLeaveButtons.length, 1, "Opened Final Plan must continue to expose exactly one Leave Plan action.");
  assert.equal(
    workingLeaveButtons[0].replace(/\s+/g, " ").trim(),
    finalLeaveButtons[0].replace(/\s+/g, " ").trim(),
    "Working and Final Leave Plan buttons must have identical markup and behavior.",
  );

  assert.match(
    workingBlock,
    /\{persistedSet\?\.status === "working" && \(\s*<button type="button" data-guide-hint="planning\.lifecycle\.leave-final" onClick=\{\(\) => \{ void startNewDbDraft\(\); \}\}>/,
    "Working Leave Plan must only appear for an opened persisted Working Plan, not a fresh draft.",
  );

  const leaveIndex = workingBlock.indexOf("Leave Plan");
  const saveIndex = workingBlock.indexOf("Save working plan");
  const finalizeIndex = workingBlock.indexOf("Finalize plan");
  assert.ok(leaveIndex >= 0 && saveIndex > leaveIndex, "Working Leave Plan must be the first lifecycle action, before Save working plan.");
  assert.ok(finalizeIndex > saveIndex, "Existing Working Plan action ordering after Leave Plan must remain Save then Finalize.");

  const resetStart = client.indexOf("async function startNewDbDraft()");
  const resetEnd = client.indexOf("\n  function guardedEditorUpdate", resetStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart, "Shared Leave Plan reset path must remain available.");
  const resetBody = client.slice(resetStart, resetEnd);
  assert.equal(resetBody.includes("planningLifecycleService."), false, "Leave Plan must remain non-mutating and must not call Planning persistence.");
  assert.match(resetBody, /setPersistedSet\(null\)/);
  assert.match(resetBody, /setCompletedRecord\(null\)/);
  assert.match(resetBody, /setSaveState\("unsaved"\)/);
  assert.match(resetBody, /setWorkspace\(getWorkspaceAfterStartNewSet\(\)\)/);

  console.log("Issue 460 Working Leave Plan acceptance: PASS");
}

void main().catch((error: unknown) => {
  console.error("Issue 460 Working Leave Plan acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
});
