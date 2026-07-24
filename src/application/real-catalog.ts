import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import type { CatalogSong, CatalogSongImportRecord } from "./catalog";
import { validateCatalogSongImport } from "./catalog";

type FrozenCatalogRecord = {
  language: "czech" | "polish";
  number: number;
  title: string;
  source_id?: string;
  source_url: string | null;
};

export type RealCatalogSong = CatalogSong & { sourceUrl?: string };

const expectedCounts = { czech: 808, polish: 990 } as const;

export function displayCatalogNumber(number: number | string): string {
  const value = typeof number === "number" ? String(number) : number.trim();
  if (/^\d{4}$/.test(value)) {
    if (value.endsWith("0")) return `${Number(value.slice(0, 2))}/${Number(value.slice(2, 3))}`;
    return `${Number(value.slice(0, 3))}/${Number(value.slice(3))}`;
  }
  return value;
}

export async function loadFrozenCatalogs(root = process.cwd()): Promise<RealCatalogSong[]> {
  const [czech, polish] = await Promise.all([
    readFrozenFile(join(root, "data/catalog/catalog-czech-final.json"), "czech"),
    readFrozenFile(join(root, "data/catalog/catalog-polish-final.json"), "polish"),
  ]);
  return [...czech, ...polish];
}

async function readFrozenFile(path: string, expectedLanguage: "czech" | "polish"): Promise<RealCatalogSong[]> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as FrozenCatalogRecord[];
  if (!Array.isArray(parsed) || parsed.length !== expectedCounts[expectedLanguage]) throw new Error(`${expectedLanguage} catalog must contain ${expectedCounts[expectedLanguage]} records.`);
  const importRecords: CatalogSongImportRecord[] = parsed.map((record) => ({ language: record.language, number: displayCatalogNumber(record.number), title: record.title, active: true, sourceUrl: record.source_url }));
  const issues = validateCatalogSongImport(importRecords);
  if (issues.length) throw new Error(`Frozen ${expectedLanguage} catalog failed validation: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  return parsed.map((record) => ({
    songId: `real-${record.language}-${displayCatalogNumber(record.number).replace("/", "-")}`,
    language: record.language,
    number: displayCatalogNumber(record.number),
    title: record.title,
    active: true,
    sourceUrl: record.source_url ?? undefined,
  }));
}

export async function importRealCatalog(pool: Pool, songs: RealCatalogSong[]): Promise<void> {
  await pool.query("begin");
  try {
    await assertCleanOrExactCatalog(pool, songs);
    for (const song of songs) {
      await pool.query(
        `insert into catalog_songs (song_id, language, number, title, active, sheet_music_url, source_url, created_at, updated_at)
         values ($1, $2, $3, $4, true, null, $5, now(), now())
         on conflict (language, number) do update set
           song_id = excluded.song_id,
           title = excluded.title,
           active = true,
           sheet_music_url = null,
           source_url = excluded.source_url,
           updated_at = now()`,
        [song.songId, song.language, song.number, song.title, song.sourceUrl ?? null],
      );
    }
    await assertRuntimeCounts(pool);
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function assertCleanOrExactCatalog(pool: Pool, songs: RealCatalogSong[]) {
  const dirty = await pool.query(`
    select
      (select count(*)::int from catalog_persons) as people,
      (select count(*)::int from app_users) as users,
      (select count(*)::int from melody_equivalence_classes) as melody,
      (select count(*)::int from service_contexts) as lifecycle,
      (select count(*)::int from antiphon_mappings) as antiphons,
      (select count(*)::int from liturgical_season_mappings) as seasons`);
  const row = dirty.rows[0];
  if (row.people || row.users || row.melody || row.lifecycle || row.antiphons || row.seasons) throw new Error("Refusing real catalog import into dirty demo/synthetic or human acceptance state. Rebuild the local Docker Compose volume first.");
  const existing = await pool.query("select language, number, title, source_url from catalog_songs order by language, number");
  if (existing.rows.length === 0) return;
  if (existing.rows.length !== songs.length) throw new Error("Refusing real catalog import because catalog_songs is not empty and does not match the frozen catalog.");
  const expected = new Map(songs.map((song) => [`${song.language}:${song.number}`, song]));
  for (const record of existing.rows) {
    const song = expected.get(`${record.language}:${record.number}`);
    if (!song || song.title !== record.title || (song.sourceUrl ?? null) !== record.source_url) throw new Error("Refusing real catalog import because existing catalog_songs differs from the frozen catalog.");
  }
}

export async function assertRuntimeCounts(pool: Pool): Promise<void> {
  const { rows } = await pool.query("select language, count(*)::int count from catalog_songs group by language order by language");
  const counts = Object.fromEntries(rows.map((row) => [row.language, Number(row.count)]));
  if (counts.czech !== 808 || counts.polish !== 990) throw new Error(`Runtime catalog count mismatch: Czech ${counts.czech ?? 0}, Polish ${counts.polish ?? 0}.`);
}
