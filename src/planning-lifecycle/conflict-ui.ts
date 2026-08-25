export type PlanningDraftConflictPreviewState = {
  key: string;
  conflictingRowIndexes: number[];
};

export function resolvePlanningDraftConflictRow(input: {
  persistedConflict: boolean;
  persistedSongId?: string;
  draftSongId?: string;
  selectedCandidateSuppressedByMelodyWindow?: boolean;
  currentPreviewKey: string;
  preview?: PlanningDraftConflictPreviewState | null;
  rowIndex: number;
}): boolean {
  if (input.preview && input.preview.key === input.currentPreviewKey) {
    return input.preview.conflictingRowIndexes.includes(input.rowIndex);
  }

  if (input.draftSongId !== input.persistedSongId) {
    // Working candidate selection already rejects unavailable/non-repetition conflicts.
    // A changed accepted candidate therefore clears the persisted alarm immediately;
    // only a current authoritative preview may re-apply one for concurrent DB truth.
    return false;
  }

  return input.persistedConflict;
}
