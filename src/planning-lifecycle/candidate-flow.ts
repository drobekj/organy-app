export const PHASE_30_1_PREFERENCE_THRESHOLD = 1;

import type { CatalogSong } from "../application/catalog";
import type { CandidateQueryInput, CandidateQueryResult, CandidateUsage } from "../application/interaction-contracts";
import type { ConcreteSongLanguage, ServiceLanguage } from "./model";

export type CandidatePopupAction = "select" | "cancel";

export type CandidatePopupRow = Pick<
  CandidateQueryResult,
  "songId" | "language" | "number" | "title" | "signal" | "preferenceShade" | "repertoire" | "aggregatePreferenceScore"
> & {
  actions: CandidatePopupAction[];
};

export type SelectedSongCandidateLine = Pick<
  CandidateQueryResult,
  "songId" | "language" | "number" | "title" | "signal" | "preferenceShade" | "repertoire" | "aggregatePreferenceScore"
> & {
  kind: "candidate";
  detailAction: true;
};

export type SelectedSongNoteLine = {
  kind: "note";
  text: string;
};

export type SelectedSongPresentation = {
  lines: [SelectedSongCandidateLine, SelectedSongNoteLine];
};

export type PlanningLookupState =
  | { status: "idle"; detailNavigation?: DetailNavigation }
  | { status: "lookupActive"; text: string; detailNavigation?: DetailNavigation }
  | { status: "selected"; presentation: SelectedSongPresentation; detailNavigation?: DetailNavigation };

export type DetailNavigation = { songId: string; returnRowId: number };

export type PlanningLookupAction =
  | { type: "lookupChanged"; text: string }
  | { type: "candidateSelected"; candidate: CandidateQueryResult; note: string }
  | { type: "lookupCancelled" }
  | { type: "detailOpened"; songId: string; returnRowId: number }
  | { type: "detailReturned" };

export type PlanningCandidateEditableRow = {
  id: number;
  songSearch: string;
  selectedSong?: CatalogSong | { songId?: string; language: ConcreteSongLanguage; number: string; title?: string };
  selectedCandidate?: CandidateQueryResult;
  note: string;
  lookupOpen?: boolean;
};

export type PlanningCandidateRowAction =
  | { type: "lookupChanged"; text: string }
  | { type: "candidateSelected"; song: CatalogSong | { songId?: string; language: ConcreteSongLanguage; number: string; title?: string }; candidate?: CandidateQueryResult }
  | { type: "lookupCancelled" }
  | { type: "rowDeactivated" }
  | { type: "songCleared" }
  | { type: "noteChanged"; note: string };

export type CandidateQueryContextInput = {
  serviceDate: string;
  serviceLanguage: ServiceLanguage;
  organistPersonId?: string;
  antiphonKey?: string;
  liturgicalSeasonKey?: string;
  candidateUsages?: CandidateUsage[];
  currentPlanId?: string;
  queryText?: string;
  preferenceThreshold?: number;
};

export function getCandidatePopupRows(candidates: CandidateQueryResult[]): CandidatePopupRow[] {
  return candidates.filter((candidate) => !candidate.suppressedByMelodyWindow).map((candidate) => ({
    songId: candidate.songId,
    language: candidate.language,
    number: candidate.number,
    title: candidate.title,
    signal: candidate.signal,
    preferenceShade: candidate.preferenceShade,
    repertoire: candidate.repertoire,
    aggregatePreferenceScore: candidate.aggregatePreferenceScore,
    actions: ["select"],
  }));
}

export function getSelectedSongPresentation(candidate: CandidateQueryResult, note: string): SelectedSongPresentation {
  return {
    lines: [
      {
        kind: "candidate",
        songId: candidate.songId,
        language: candidate.language,
        number: candidate.number,
        title: candidate.title,
        signal: candidate.signal,
        preferenceShade: candidate.preferenceShade,
        repertoire: candidate.repertoire,
        aggregatePreferenceScore: candidate.aggregatePreferenceScore,
        detailAction: true,
      },
      { kind: "note", text: note },
    ],
  };
}

export function planningLookupReducer(state: PlanningLookupState, action: PlanningLookupAction): PlanningLookupState {
  switch (action.type) {
    case "lookupChanged":
      return action.text.trim() ? { status: "lookupActive", text: action.text, detailNavigation: state.detailNavigation } : { status: "idle", detailNavigation: state.detailNavigation };
    case "candidateSelected":
      return { status: "selected", presentation: getSelectedSongPresentation(action.candidate, action.note), detailNavigation: state.detailNavigation };
    case "lookupCancelled":
      return { status: "idle", detailNavigation: state.detailNavigation };
    case "detailOpened":
      return { ...state, detailNavigation: { songId: action.songId, returnRowId: action.returnRowId } };
    case "detailReturned": {
      const { detailNavigation: _detailNavigation, ...rest } = state;
      return rest;
    }
  }
}

export function buildCandidateQueryInput(input: CandidateQueryContextInput): CandidateQueryInput {
  return {
    serviceDate: input.serviceDate,
    serviceLanguage: input.serviceLanguage,
    ...(input.organistPersonId ? { organistPersonId: input.organistPersonId } : {}),
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
    case "lookupChanged":
      return { ...row, songSearch: action.text, lookupOpen: Boolean(action.text.trim()) };
    case "candidateSelected":
      return { ...row, songSearch: formatSongLabel(action.song), selectedSong: action.song, selectedCandidate: action.candidate, lookupOpen: false };
    case "lookupCancelled":
    case "rowDeactivated":
      return restoreConfirmedCandidate(row);
    case "songCleared":
      return { ...row, songSearch: "", selectedSong: undefined, selectedCandidate: undefined, lookupOpen: false };
    case "noteChanged":
      return { ...row, note: action.note };
  }
}

export function restoreConfirmedCandidate<T extends PlanningCandidateEditableRow>(row: T): T {
  return { ...row, lookupOpen: false, songSearch: row.selectedSong ? formatSongLabel(row.selectedSong) : "" };
}

export function restoreRowsExceptActive<T extends PlanningCandidateEditableRow>(rows: T[], targetRowId: number): T[] {
  return rows.map((row) => row.id === targetRowId ? row : row.lookupOpen ? restoreConfirmedCandidate(row) : row);
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
    suppressedByMelodyWindow: false,
    orderKey: `rehydrated:${song.language}:${song.number}:${songId}`,
  };
}

export function candidateToSelectedSong(candidate: CandidateQueryResult): { songId: string; language: ConcreteSongLanguage; number: string; title: string } {
  return { songId: candidate.songId, language: candidate.language, number: candidate.number, title: candidate.title };
}

export type CanonicalUsageInput = {
  currentPlanId?: string;
  serviceDate: string;
  completedRecords?: { id: string; serviceDate: string; rows: { songId?: string }[] }[];
  plans?: { id: string; status: "working" | "final"; serviceDate: string; rows: { songId?: string }[] }[];
  currentRows?: { rowId: number; songId?: string }[];
  activeRowId?: number;
};

export function buildCanonicalCandidateUsages(input: CanonicalUsageInput): CandidateUsage[] {
  const usages: CandidateUsage[] = [];
  for (const record of input.completedRecords ?? []) {
    for (const row of record.rows) if (row.songId) usages.push({ songId: row.songId, serviceDate: record.serviceDate, source: "completed", planId: record.id });
  }
  for (const plan of input.plans ?? []) {
    if (plan.id === input.currentPlanId) continue;
    for (const row of plan.rows) if (row.songId) usages.push({ songId: row.songId, serviceDate: plan.serviceDate, source: plan.status, planId: plan.id });
  }
  for (const row of input.currentRows ?? []) {
    if (row.rowId === input.activeRowId) continue;
    if (row.songId) usages.push({ songId: row.songId, serviceDate: input.serviceDate, source: "current", rowId: row.rowId });
  }
  return usages;
}
