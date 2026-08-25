import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolvePlanningDraftConflictRow } from "../src/planning-lifecycle/conflict-ui";

async function main() {
  const cssSource = await readFile("app/globals.css", "utf8");
  const clientSource = await readFile("app/planning-lifecycle-client.tsx", "utf8");
  const routeSource = await readFile("app/api/planning-lifecycle/route.ts", "utf8");

  const rowAlarmRule = cssSource.match(/\.needs-revision-row\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(rowAlarmRule, /border:\s*3px solid var\(--danger\)/);
  assert.doesNotMatch(rowAlarmRule, /outline:/);
  const recordAlarmRule = cssSource.match(/\.saved-set-list button\.needs-revision-record\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(recordAlarmRule, /border:\s*3px solid var\(--danger\)/);
  assert.doesNotMatch(recordAlarmRule, /outline:/);

  assert.match(clientSource, /previewPlanningSetConflict/);
  assert.match(clientSource, /planningDraftConflictPreviewRequest/);
  assert.match(clientSource, /resolvePlanningDraftConflictRow/);
  assert.match(routeSource, /findCompletedPlanConflicts/);
  assert.match(routeSource, /previewPlanningSetConflict/);

  const persistedConflict = {
    persistedConflict: true,
    persistedSongId: "song:conflict",
    currentPreviewKey: "new-key",
    rowIndex: 0,
  } as const;

  assert.equal(resolvePlanningDraftConflictRow({
    ...persistedConflict,
    draftSongId: "song:conflict",
    selectedCandidateSuppressedByMelodyWindow: true,
    preview: null,
  }), true, "unchanged conflicted Working row keeps the persisted alarm while preview is pending");

  assert.equal(resolvePlanningDraftConflictRow({
    ...persistedConflict,
    draftSongId: "song:safe",
    selectedCandidateSuppressedByMelodyWindow: false,
    preview: { key: "old-key", conflictingRowIndexes: [0] },
  }), false, "changed non-conflicting candidate clears the alarm immediately and ignores stale preview state");

  assert.equal(resolvePlanningDraftConflictRow({
    ...persistedConflict,
    draftSongId: "song:other-conflict",
    selectedCandidateSuppressedByMelodyWindow: true,
    preview: { key: "old-key", conflictingRowIndexes: [] },
  }), true, "changed conflicting candidate keeps the alarm immediately while authoritative preview is pending");

  assert.equal(resolvePlanningDraftConflictRow({
    ...persistedConflict,
    draftSongId: "song:safe",
    selectedCandidateSuppressedByMelodyWindow: false,
    preview: { key: "new-key", conflictingRowIndexes: [] },
  }), false, "current authoritative preview confirms the cleared conflict");

  assert.equal(resolvePlanningDraftConflictRow({
    ...persistedConflict,
    draftSongId: "song:safe",
    selectedCandidateSuppressedByMelodyWindow: false,
    preview: { key: "new-key", conflictingRowIndexes: [0] },
  }), true, "current authoritative preview overrides optimistic state when DB truth still conflicts");

  console.log("Issue #233 alarm geometry and live Working conflict acceptance passed.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
