import type { ServiceSetRow, SongReference } from "./model";

export type ValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export const validateSongReference = (
  song: SongReference | undefined,
  path: string,
): readonly ValidationIssue[] => {
  if (song === undefined) {
    return [];
  }

  const issues: ValidationIssue[] = [];

  if (song.language.trim() === "") {
    issues.push({ path: `${path}.language`, message: "Song language is required." });
  }

  if (song.number.trim() === "") {
    issues.push({ path: `${path}.number`, message: "Song number is required." });
  }

  return issues;
};

export const validateServiceSetRows = (
  rows: readonly ServiceSetRow[],
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const positions = new Set<number>();

  rows.forEach((row, index) => {
    const path = `rows.${index}`;

    if (row.id.trim() === "") {
      issues.push({ path: `${path}.id`, message: "Row id is required." });
    }

    if (!Number.isInteger(row.position) || row.position < 1) {
      issues.push({ path: `${path}.position`, message: "Row position must be a positive integer." });
    } else if (positions.has(row.position)) {
      issues.push({ path: `${path}.position`, message: "Row position must be unique." });
    } else {
      positions.add(row.position);
    }

    issues.push(...validateSongReference(row.song, `${path}.song`));

    if (row.song === undefined && (row.note === undefined || row.note.trim() === "")) {
      issues.push({ path: `${path}.note`, message: "Rows without a song require a note." });
    }
  });

  return issues;
};
