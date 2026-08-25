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
    return Boolean(input.draftSongId && input.selectedCandidateSuppressedByMelodyWindow);
  }

  return input.persistedConflict;
}
