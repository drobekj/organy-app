import type {
  ConcreteSongLanguage,
  PlanningRow,
  PlanningSet,
  ServiceLanguage,
  ServiceSetStatus,
  SongReference,
} from "./model";

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

const serviceLanguages: readonly ServiceLanguage[] = ["czech", "polish", "mixed"];
const serviceSetStatuses: readonly ServiceSetStatus[] = ["working", "final"];

export function validatePlanningSet(set: PlanningSet): PlanningValidationResult {
  const issues: PlanningValidationIssue[] = [];

  if (!serviceSetStatuses.includes(set.status)) {
    issues.push({ path: "status", message: "Planning set status must be either working or final." });
  }

  if (!serviceLanguages.includes(set.language)) {
    issues.push({ path: "language", message: "Planning set language must be czech, polish, or mixed." });
  }

  if (!Array.isArray(set.rows)) {
    issues.push({ path: "rows", message: "Planning set rows must be an array." });
  } else {
    set.rows.forEach((row, index) => {
      const rowValidation = validatePlanningRow(row);
      rowValidation.issues.forEach((issue) => {
        issues.push({
          path: `rows.${index}.${issue.path}`,
          message: issue.message,
        });
      });
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
