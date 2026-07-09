import type {
  CompletedServiceRow,
  ConcreteSongLanguage,
  ServiceSetRow,
  SongReference,
} from './model';

export type PlanningLifecycleValidationIssue =
  | 'concreteSongLanguageMustNotBeMixed'
  | 'songNumberMustBeNonEmpty'
  | 'rowRequiresCompleteSongReferenceOrNonEmptyNote';

type RowWithContent = ServiceSetRow | CompletedServiceRow;

const concreteSongLanguages: readonly ConcreteSongLanguage[] = ['czech', 'polish'];

export function isConcreteSongLanguage(
  language: string,
): language is ConcreteSongLanguage {
  return concreteSongLanguages.includes(language as ConcreteSongLanguage);
}

export function hasNonEmptyText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateSongReference(
  song: SongReference | { language?: string; number?: string } | undefined,
): PlanningLifecycleValidationIssue[] {
  if (song === undefined) {
    return [];
  }

  const issues: PlanningLifecycleValidationIssue[] = [];

  if (!song.language || !isConcreteSongLanguage(song.language)) {
    issues.push('concreteSongLanguageMustNotBeMixed');
  }

  if (!hasNonEmptyText(song.number)) {
    issues.push('songNumberMustBeNonEmpty');
  }

  return issues;
}

export function hasCompleteSongReference(row: RowWithContent): boolean {
  return validateSongReference(row.song).length === 0 && row.song !== undefined;
}

export function validatePlanningRow(
  row: RowWithContent,
): PlanningLifecycleValidationIssue[] {
  const issues = validateSongReference(row.song);

  if (!hasCompleteSongReference(row) && !hasNonEmptyText(row.note)) {
    issues.push('rowRequiresCompleteSongReferenceOrNonEmptyNote');
  }

  return issues;
}
