import type { CatalogSong } from "../src/application/catalog";
import type { CandidateQueryResult } from "../src/application/interaction-contracts";
import type { CompletedPlanInvalidationPreview } from "../src/application/completed-plan-conflict-preview";
import type { PersistedPlanningPlan } from "../src/application/planning-lifecycle";
import type { ConcreteSongLanguage, PlanningRow, ServiceLanguage } from "../src/planning-lifecycle";
import { formatPlanningSongField, rehydrateCandidateFromSelectedSong } from "../src/planning-lifecycle/candidate-flow";

export type EditableRow = {
  id: number;
  songSearch: string;
  selectedSong?: CatalogSong | { songId?: string; language: ConcreteSongLanguage; number: string; title?: string };
  selectedCandidate?: CandidateQueryResult;
  note: string;
  lookupOpen?: boolean;
};

export type SaveState = "unsaved" | "saved" | "finalized" | "completed" | "deleted" | "errors";
export type SelectedCandidateAvailability = "available" | "unavailable" | "error";
export type SelectedCandidateAvailabilitySnapshot = {
  key: string;
  byRow: Record<number, SelectedCandidateAvailability>;
};

export type WorkingSetSnapshot = {
  serviceDate: string;
  serviceTime: string;
  serviceLanguage: ServiceLanguage;
  priest: string;
  organist: string;
  rows: PlanningRow[];
};

export type PlanningExpansion =
  | { kind: "candidateList"; rowId: number; focusSongId?: string }
  | { kind: "candidateDetail"; rowId: number; songId: string; candidate: CandidateQueryResult; returnQuery: string }
  | { kind: "selectedSongDetail"; rowId: number; songId: string; candidate: CandidateQueryResult }
  | null;

export function createEmptyRow(id: number, _serviceLanguage: ServiceLanguage): EditableRow {
  return {
    id,
    songSearch: "",
    note: "",
  };
}

export function fromPlanningRow(row: PlanningRow, id: number): EditableRow {
  return {
    id,
    songSearch: row.song ? formatPlanningSongField(row.song) : "",
    selectedSong: row.song ? { ...row.song } : undefined,
    selectedCandidate: row.song ? rehydrateCandidateFromSelectedSong(row.song, row.note ?? "") : undefined,
    note: row.note ?? "",
  };
}

export function toPlanningRow(row: EditableRow): PlanningRow {
  const note = row.note.trim();
  return {
    ...(row.selectedSong
      ? {
          song: {
            ...(row.selectedSong.songId ? { songId: row.selectedSong.songId } : {}),
            language: row.selectedSong.language,
            number: row.selectedSong.number,
            ...(row.selectedSong.title ? { title: row.selectedSong.title } : {}),
          },
        }
      : {}),
    ...(note ? { note } : {}),
  };
}

export function candidateFromSelectedSong(song: {
  songId?: string;
  language: ConcreteSongLanguage;
  number: string;
  title?: string;
}): CandidateQueryResult {
  return {
    songId: song.songId ?? `historical:${song.language}:${song.number}`,
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
    orderKey: `${song.language}:${song.number}`,
  };
}

export function formatConflictPreviewPlanLabel(
  impact: CompletedPlanInvalidationPreview["newlyImpactedPlans"][number],
  plans: PersistedPlanningPlan[],
): string {
  const plan = plans.find((candidate) => candidate.id === impact.planId);
  const status = impact.planStatus === "final" ? "Final" : "Working";
  return plan ? `${status} ${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}` : `${status} plan`;
}

export function isFuturePragueDate(serviceDate: string): boolean {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return serviceDate > today;
}
