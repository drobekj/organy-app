import type { CandidateQueryResult } from "../application/interaction-contracts";

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
