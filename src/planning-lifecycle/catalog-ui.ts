import type { CatalogRepository, CatalogSong } from "../application/catalog";
import type { PlanningRow, ServiceLanguage } from "./model";

export type CatalogEditableSong = CatalogSong | { songId?: string; language: "czech" | "polish"; number: string; title?: string };
export type CatalogEditableRow = { selectedSong?: CatalogEditableSong; songSearch: string; note: string };

export type CatalogLookupRequestToken = { scope: string; generation: number; query: string };

export class CatalogLookupRequestTracker {
  private generation = 0;
  private readonly activeGenerations = new Map<string, number>();

  begin(scope: string, query: string): CatalogLookupRequestToken {
    const generation = ++this.generation;
    this.activeGenerations.set(scope, generation);
    return { scope, generation, query };
  }

  invalidate(scope: string): void {
    this.activeGenerations.set(scope, ++this.generation);
  }

  invalidatePrefix(prefix: string): void {
    for (const scope of this.activeGenerations.keys()) {
      if (scope.startsWith(prefix)) this.invalidate(scope);
    }
  }

  isCurrent(token: CatalogLookupRequestToken, query: string): boolean {
    return token.query === query && this.activeGenerations.get(token.scope) === token.generation;
  }
}

export function getPersonLookupScope(role: string): string {
  return `person:${role}`;
}

export function getSongLookupScope(rowId: number): string {
  return `song:${rowId}`;
}

export function confirmLanguageDeviationSave(rows: PlanningRow[], serviceLanguage: ServiceLanguage, confirm: (message: string) => boolean): { allowLanguageDeviations: boolean; cancelled: boolean; deviationRows: number[] } {
  const deviationRows = getCatalogLanguageDeviationRowNumbers(rows, serviceLanguage);
  if (deviationRows.length === 0) return { allowLanguageDeviations: false, cancelled: false, deviationRows };
  const confirmed = confirm(`Rows ${deviationRows.join(", ")} do not match the ${serviceLanguage} service language. Save this combination?`);
  return { allowLanguageDeviations: confirmed, cancelled: !confirmed, deviationRows };
}

export function preserveRowsOnServiceLanguageChange<TRow extends CatalogEditableRow>(rows: TRow[], _serviceLanguage: ServiceLanguage): TRow[] {
  return rows.map((row) => row.selectedSong ? { ...row, selectedSong: { ...row.selectedSong } } : { ...row });
}

export function clearSongLookupResultsOnServiceLanguageChange(): Record<number, CatalogSong[]> {
  return {};
}

export function getCatalogLanguageDeviationRowNumbers(rows: PlanningRow[], serviceLanguage: ServiceLanguage): number[] {
  if (serviceLanguage === "mixed") return [];
  return rows.flatMap((row, index) => row.song && row.song.language !== serviceLanguage ? [index + 1] : []);
}

export async function enrichSongSnapshotWithSheetMusic<TSong extends CatalogEditableSong>(song: TSong, catalog: Pick<CatalogRepository, "findSongById">): Promise<TSong> {
  if (!song.songId) return song;
  const current = await catalog.findSongById(song.songId);
  return current?.sheetMusicUrl ? { ...song, sheetMusicUrl: current.sheetMusicUrl } as TSong : song;
}

export async function enrichRowsWithCurrentSheetMusic<TRow extends CatalogEditableRow>(rows: TRow[], catalog: Pick<CatalogRepository, "findSongById">): Promise<TRow[]> {
  return Promise.all(rows.map(async (row) => ({ ...row, selectedSong: row.selectedSong ? await enrichSongSnapshotWithSheetMusic(row.selectedSong, catalog) : undefined })));
}
