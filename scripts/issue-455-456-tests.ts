import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Acceptance contract for Issues #455 and #456.
async function main() {
  const [client, adapter] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/application/planning-lifecycle/drizzle-repository-adapters.ts", "utf8"),
  ]);

  const finalBlockStart = client.indexOf("{!isCompletedRecordOpen && isFinalSetOpen && (");
  const completedBlockStart = client.indexOf("{isCompletedRecordOpen && presentationRole === \"admin\"", finalBlockStart);
  assert.ok(finalBlockStart >= 0 && completedBlockStart > finalBlockStart, "Final Plan action block must remain explicit.");
  const finalBlock = client.slice(finalBlockStart, completedBlockStart);
  assert.equal((finalBlock.match(/Leave Plan/g) ?? []).length, 1, "Opened Final Plan must expose exactly one Leave Plan action.");
  assert.match(finalBlock, /data-guide-hint="planning\.lifecycle\.leave-final"/);
  assert.match(finalBlock, /onClick=\{\(\) => \{ void startNewDbDraft\(\); \}\}/, "Leave Plan must reuse the existing new-draft reset path.");

  const resetStart = client.indexOf("async function startNewDbDraft()");
  const resetEnd = client.indexOf("\n  function guardedEditorUpdate", resetStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart, "New-draft reset function must remain available.");
  const resetBody = client.slice(resetStart, resetEnd);
  assert.match(resetBody, /setPersistedSet\(null\)/);
  assert.match(resetBody, /setCompletedRecord\(null\)/);
  assert.match(resetBody, /setServiceError\(null\)/);
  assert.match(resetBody, /setSaveState\("unsaved"\)/);
  assert.match(resetBody, /setWorkspace\(getWorkspaceAfterStartNewSet\(\)\)/);
  assert.equal(resetBody.includes("planningLifecycleService."), false, "Leave/new-draft reset must not invoke a persistence lifecycle action.");

  assert.match(adapter, /async function resolveCurrentCatalogPersonNames\(/, "DB-backed Planning reads must resolve canonical person names by stable ID.");
  assert.match(adapter, /async function mapServiceContextToUpdateValues\(/, "Lifecycle writes must preserve stored person-name snapshots while stable IDs are unchanged.");
  assert.match(adapter, /context\.priestId \? catalog\.findPersonById\(context\.priestId\) : undefined/);
  assert.match(adapter, /context\.organistId \? catalog\.findPersonById\(context\.organistId\) : undefined/);
  assert.match(adapter, /priest: priest \? \{ id: priest\.id, displayName: priest\.displayName \} : snapshot\.priest/);
  assert.match(adapter, /organist: organist \? \{ id: organist\.id, displayName: organist\.displayName \} : snapshot\.organist/);
  assert.match(adapter, /priestDisplayName: context\.priest\.displayName/, "Writes must retain the explicit persisted display-name snapshot.");
  assert.match(adapter, /organistDisplayName: context\.organist\.displayName/, "Writes must retain the explicit persisted display-name snapshot.");

  console.log("Issues 455/456 static acceptance: PASS");
}

void main().catch((error: unknown) => {
  console.error("Issues 455/456 static acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
});
