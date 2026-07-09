import type { ConcreteSongLanguage, PlanningRow, SongReference } from "./model";

export type PlanningValidationIssue = {
  path: string;
  message: string;
};

export type PlanningValidationResult = {
  valid: boolean;
  issues: PlanningValidationIssue[];
};

const concreteSongLanguages: readonly ConcreteSongLanguage[] = ["czech", "polish"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isConcreteSongLanguage(value: unknown): value is ConcreteSongLanguage {
  return concreteSongLanguages.includes(value as ConcreteSongLanguage);
}

export function validateSongReference(song: Partial<SongReference> | undefined): PlanningValidationIssue[] {
  const issues: PlanningValidationIssue[] = [];

  if (!song) {
    issues.push({ path: "song", message: "Song reference is required." });
    return issues;
  }

  if (!isNonEmptyString(song.number)) {
    issues.push({ path: "song.number", message: "Song number must be a non-empty string." });
  }

  if (!isConcreteSongLanguage(song.language)) {
    issues.push({
      path: "song.language",
      message: "Song language must be either czech or polish.",
    });
  }

  return issues;
}

export function validatePlanningRow(row: PlanningRow): PlanningValidationResult {
  const issues: PlanningValidationIssue[] = [];
  const hasSongValue = row.song !== undefined;
  const hasTextualNote = isNonEmptyString(row.note);

  if (hasSongValue) {
    issues.push(...validateSongReference(row.song));
  }

  if (!hasSongValue && !hasTextualNote) {
    issues.push({
      path: "row",
      message: "Row must include either a complete song reference or a non-empty textual note.",
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
