import type { CandidateQueryResult } from "../application/interaction-contracts";

export type CandidateViewMode = "songs" | "melodies";

type MelodyRepresentativeCandidate = CandidateQueryResult & {
  melodyRepresentative?: boolean;
};

export function isMelodyRepresentativeCandidate(candidate: CandidateQueryResult): boolean {
  if (candidate.songId.startsWith("historical-zero:")) return false;
  const explicit = (candidate as MelodyRepresentativeCandidate).melodyRepresentative;
  return typeof explicit === "boolean" ? explicit : true;
}

export function candidatesForView(
  candidates: CandidateQueryResult[],
  mode: CandidateViewMode,
): CandidateQueryResult[] {
  return mode === "songs"
    ? candidates
    : candidates.filter(isMelodyRepresentativeCandidate);
}
