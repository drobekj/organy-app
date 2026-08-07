import type { CandidateQueryInput, CandidateQueryResult } from "../application/interaction-contracts";
import type { ConcreteSongLanguage, ServiceLanguage } from "./model";

export const PHASE_30_1_PREFERENCE_THRESHOLD = 0;

export type PlanningCandidateEditableRow = {
  id: number;
  songSearch: string;
  selectedSong?: {
    songId?: string;
    language: ConcreteSongLanguage;
    number: string;
    title?: string;
  };
  selectedCandidate?: CandidateQueryResult;
  note: string;
  lookupOpen: boolean;
};

export type PlanningCandidateRowAction =
  | { type: "lookupOpened" }
  | { type: "lookupChanged"; text: string }
  | { type: "candidateSelected"; song: NonNullable<PlanningCandidateEditableRow["selectedSong"]>; candidate: CandidateQueryResult }
  | { type: "lookupCancelled" }
  | { type: "rowDeactivated" }
  | { type: "songCleared" }
  | { type: "rowCleared" }
  | { type: "noteChanged"; note: string };

export type CandidateQueryContextInput = {
  serviceDate: string;
  serviceLanguage: ServiceLanguage;
  organistPersonId?: string;
  referenceAntiphonId?: string;
  antiphonKey?: string;
  liturgicalSeasonKey?: string;
  queryText?: string;
  preferenceThreshold?: number;
  currentPlanId?: number;
  candidateUsages?: CandidateQueryInput["candidateUsages"];
};

export function buildCanonicalCandidateUsages(rows: Array<{ rowId: number; selectedCandidate?: CandidateQueryResult }>, excludedRowId?: number): NonNullable<CandidateQueryInput["candidateUsages"]> {
  return rows
    .filter((row) => row.rowId !== excludedRowId && row.selectedCandidate)
    .map((row) => ({ rowId: row.rowId, melodyClassId: row.selectedCandidate!.melodyClassId, songId: row.selectedCandidate!.songId, label: `Row ${row.rowId}` }));
}

export function buildCandidateQueryInput(input: CandidateQueryContextInput): CandidateQueryInput {
  return {
    serviceDate: input.serviceDate,
    serviceLanguage: input.serviceLanguage,
    ...(input.organistPersonId ? { organistPersonId: input.organistPersonId } : {}),
    ...(input.referenceAntiphonId?.trim() ? { referenceAntiphonId: input.referenceAntiphonId.trim() } : {}),
    ...(input.antiphonKey?.trim() ? { antiphonKey: input.antiphonKey.trim() } : {}),
    ...(input.liturgicalSeasonKey?.trim() ? { liturgicalSeasonKey: input.liturgicalSeasonKey.trim() } : {}),
    ...(input.queryText?.trim() ? { queryText: input.queryText.trim() } : {}),
    preferenceThreshold: typeof input.preferenceThreshold === "number" ? input.preferenceThreshold : PHASE_30_1_PREFERENCE_THRESHOLD,
    ...(input.currentPlanId ? { currentPlanId: input.currentPlanId } : {}),
    candidateUsages: input.candidateUsages ?? [],
  };
}

export function planningCandidateRowReducer(row: PlanningCandidateEditableRow, action: PlanningCandidateRowAction): PlanningCandidateEditableRow {
  switch (action.type) {
    case "lookupOpened":
      return { ...row, songSearch: row.selectedSong ? formatPlanningSongField(row.selectedSong) : "", lookupOpen: true };
    case "lookupChanged":
      return { ...row, songSearch: action.text, lookupOpen: true };
    case "candidateSelected":
      return { ...row, songSearch: formatPlanningSongField(action.song), selectedSong: action.song, selectedCandidate: action.candidate, lookupOpen: false };
    case "lookupCancelled":
    case "rowDeactivated":
      return restoreConfirmedCandidate(row);
    case "songCleared":
      return { ...row, songSearch: "", selectedSong: undefined, selectedCandidate: undefined, lookupOpen: false };
    case "rowCleared":
      return { ...row, songSearch: "", selectedSong: undefined, selectedCandidate: undefined, note: "", lookupOpen: false };
    case "noteChanged":
      return { ...row, note: action.note };
  }
}

export function restoreConfirmedCandidate<T extends PlanningCandidateEditableRow>(row: T): T {
  return { ...row, lookupOpen: false, songSearch: row.selectedSong ? formatPlanningSongField(row.selectedSong) : "" };
}

export function restoreRowsExceptActive<T extends PlanningCandidateEditableRow>(rows: T[], targetRowId: number): T[] {
  return rows.map((row) => row.id === targetRowId ? row : row.lookupOpen ? restoreConfirmedCandidate(row) : row);
}

export function openSingleCandidateRow<T extends PlanningCandidateEditableRow>(rows: T[], targetRowId: number): T[] {
  return rows.map((row) => row.id === targetRowId
    ? planningCandidateRowReducer(row, { type: "lookupOpened" }) as T
    : row.lookupOpen ? restoreConfirmedCandidate(row) : row);
}

export function formatPlanningSongField(song: { number: string; title?: string }): string {
  return `${song.number}${song.title ? ` · ${song.title}` : ""}`;
}

export function formatSongLabel(song: { language: ConcreteSongLanguage; number: string; title?: string }): string {
  return `${song.language} ${song.number}${song.title ? ` — ${song.title}` : ""}`;
}

export function rehydrateCandidateFromSelectedSong(song: { songId?: string; language: ConcreteSongLanguage; number: string; title?: string }, _note = ""): CandidateQueryResult {
  const songId = song.songId ?? `historical:${song.language}:${song.number}`;
  return {
    songId,
    language: song.language,
    number: song.number,
    title: song.title ?? "Untitled snapshot",
    equivalentNumbers: [],
    aggregatePreferenceScore: 0,
    antiphonMatch: false,
    seasonMatch: false,
    signal: "none",
    preferenceShade: "none",
    repertoire: false,
    availability: { kind: "available" },
    suppressedByMelodyWindow: false,
    orderKey: `rehydrated:${song.language}:${song.number}:${songId}`,
  };
}

export function candidateToSelectedSong(candidate: CandidateQueryResult): { songId: string; language: ConcreteSongLanguage; number: string; title: string } {
  return { songId: candidate.songId, language: candidate.language, number: candidate.number, title: candidate.title };
}
