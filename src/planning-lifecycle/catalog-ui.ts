import type { CatalogRepository, CatalogSong } from "../application/catalog";
import type { PlanningRow, ServiceLanguage } from "./model";

export type CatalogEditableSong = CatalogSong | { songId?: string; language: "czech" | "polish"; number: string; title?: string };
export type CatalogEditableRow = { selectedSong?: CatalogEditableSong; songSearch: string; note: string };

export function preserveRowsOnServiceLanguageChange<TRow extends CatalogEditableRow>(rows: TRow[], _serviceLanguage: ServiceLanguage): TRow[] {
  return rows.map((row) => ({ ...row, selectedSong: row.selectedSong ? { ...row.selectedSong } : undefined }));
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
