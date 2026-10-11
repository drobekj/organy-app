import type { CandidateQueryResult } from "../application/interaction-contracts";

export type CatalogCandidateJumpCandidate = Pick<CandidateQueryResult, "songId" | "number" | "title">;

export function normalizeCatalogCandidateJumpText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .trim();
}

export function findCatalogCandidateJumpMatch<T extends CatalogCandidateJumpCandidate>(
  candidates: T[],
  rawQuery: string,
): T | undefined {
  const query = normalizeCatalogCandidateJumpText(rawQuery);
  if (!query) return undefined;

  const exactNumber = candidates.find(
    (candidate) => normalizeCatalogCandidateJumpText(candidate.number) === query,
  );
  if (exactNumber) return exactNumber;

  return candidates.find((candidate) => normalizeCatalogCandidateJumpText(
    `${candidate.number} ${candidate.title}`,
  ).includes(query));
}
