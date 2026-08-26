import type { CandidateQueryResult } from "../application/interaction-contracts";

export type CandidateViewMode = "songs" | "melodies";

type MelodyRepresentativeCandidate = CandidateQueryResult & {
  songsEligible?: boolean;
  melodyRepresentative?: boolean;
};

function isSongsEligibleCandidate(candidate: CandidateQueryResult): boolean {
  return (candidate as MelodyRepresentativeCandidate).songsEligible !== false;
}

export function isMelodyRepresentativeCandidate(candidate: CandidateQueryResult): boolean {
  if (candidate.songId.startsWith("historical-zero:")) return false;
  const explicit = (candidate as MelodyRepresentativeCandidate).melodyRepresentative;
  return typeof explicit === "boolean" ? explicit : true;
}

export function candidatesForView<T extends CandidateQueryResult>(
  candidates: T[],
  mode: CandidateViewMode,
): T[] {
  if (mode === "melodies") return candidates.filter(isMelodyRepresentativeCandidate);
  return candidates.some((candidate) => !isSongsEligibleCandidate(candidate))
    ? candidates.filter(isSongsEligibleCandidate)
    : candidates;
}
