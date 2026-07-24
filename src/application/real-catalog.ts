import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import type { CatalogSong, CatalogSongImportRecord } from "./catalog";
import { validateCatalogSongImport } from "./catalog";
import { decodeCatalogNumberForDisplay } from "./catalog-number";

type FrozenCatalogRecord = {
  language: "czech" | "polish";
  number: number;
  title: string;
  source_id?: string | null;
  source_url: string | null;
};

type ValidationArtifact = {
  validation_passed: boolean;
  expected_records: number;
  actual_records: number;
  checks?: { duplicate_language_number_keys?: unknown[]; empty_titles?: unknown[]; invalid_source_urls?: unknown[] };
};

export type RealCatalogSong = CatalogSong & { sourceUrl?: string; sourceExternalId?: string };
export type RealCatalogFingerprint = { total: number; czech: number; polish: number; keyHash: string; contentHash: string; lifecycle: number };

const artifacts = {
  czech: {
    catalogFile: "data/catalog/catalog-czech-final.json",
    validationFile: "data/catalog/catalog-czech-validation.json",
    catalogSha256: "5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9",
    validationSha256: "e47da19e263f1ba962cb8e2699c6e94125499438a3ff74ccf78bdb29517cab40",
    records: 808,
  },
  polish: {
    catalogFile: "data/catalog/catalog-polish-final.json",
    validationFile: "data/catalog/catalog-polish-validation.json",
    catalogSha256: "b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9",
    validationSha256: "49a0accd4392ff9167707e2677d9edab9b5ed9ceb7d0d023a2251dfbca1b5559",
    records: 990,
  },
} as const;

export async function loadFrozenCatalogs(root = process.cwd()): Promise<RealCatalogSong[]> {
  const [czech, polish] = await Promise.all([readFrozenFile(root, "czech"), readFrozenFile(root, "polish")]);
  const songs = [...czech, ...polish];
  assertUniqueLanguageNumbers(songs);
  return songs;
}

async function readFrozenFile(root: string, language: keyof typeof artifacts): Promise<RealCatalogSong[]> {
  const artifact = artifacts[language];
  const [catalogBytes, validationBytes] = await Promise.all([
    readFile(join(root, artifact.catalogFile)),
    readFile(join(root, artifact.validationFile)),
  ]);
  assertSha256(`${language} catalog`, catalogBytes, artifact.catalogSha256);
  assertSha256(`${language} validation`, validationBytes, artifact.validationSha256);
  const parsed = JSON.parse(catalogBytes.toString("utf8")) as FrozenCatalogRecord[];
  const validation = JSON.parse(validationBytes.toString("utf8")) as ValidationArtifact;
  validateValidationArtifact(language, validation);
  if (!Array.isArray(parsed) || parsed.length !== artifact.records) throw new Error(`${language} catalog must contain ${artifact.records} records.`);
  const importRecords: CatalogSongImportRecord[] = parsed.map((record) => ({ language: record.language, number: String(record.number), title: record.title, active: true, sourceUrl: record.source_url }));
  const issues = validateCatalogSongImport(importRecords);
  if (issues.length) throw new Error(`Frozen ${language} catalog failed validation: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  return parsed.map((record) => ({
    songId: stableSongId(record.language, record.number),
    language: record.language,
    number: String(record.number),
    title: record.title,
    active: true,
    sourceUrl: record.source_url ?? undefined,
    sourceExternalId: record.source_id ?? undefined,
  }));
}

export async function importRealCatalog(pool: Pool, songs?: RealCatalogSong[]): Promise<void> {
  const catalogSongs = songs ?? await loadFrozenCatalogs();
  const client = await pool.connect();
  try {
    await importRealCatalogWithClient(client, catalogSongs);
  } finally {
    client.release();
  }
}

export async function importRealCatalogWithClient(client: PoolClient, songs: RealCatalogSong[]): Promise<void> {
  assertUniqueLanguageNumbers(songs);
  await client.query("begin");
  try {
    await assertCleanOrExactCatalog(client, songs);
    for (const song of songs) {
      const existing = await client.query("select song_id from catalog_songs where language = $1 and number = $2", [song.language, song.number]);
      if (existing.rows[0] && existing.rows[0].song_id !== song.songId) throw new Error(`Refusing real catalog import because ${song.language}:${song.number} already has conflicting song_id ${existing.rows[0].song_id}.`);
      await client.query(
        `insert into catalog_songs (song_id, language, number, title, active, sheet_music_url, source_url, created_at, updated_at)
         values ($1, $2, $3, $4, true, null, $5, now(), now())
         on conflict (language, number) do update set
           title = excluded.title,
           active = true,
           sheet_music_url = null,
           source_url = excluded.source_url,
           updated_at = now()`,
        [song.songId, song.language, song.number, song.title, song.sourceUrl ?? null],
      );
    }
    await assertRuntimeCounts(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function assertCleanOrExactCatalog(client: PoolClient, songs: RealCatalogSong[]) {
  const dirty = await client.query(`
    select
      (select count(*)::int from catalog_persons) as people,
      (select count(*)::int from app_users) as users,
      (select count(*)::int from melody_equivalence_classes) as melody,
      (select count(*)::int from service_contexts) as lifecycle,
      (select count(*)::int from antiphon_mappings) as antiphons,
      (select count(*)::int from liturgical_season_mappings) as seasons`);
  const row = dirty.rows[0];
  if (row.people || row.users || row.melody || row.lifecycle || row.antiphons || row.seasons) throw new Error("Refusing real catalog import into dirty demo/synthetic or human acceptance state. Run the destructive local-only reset command first.");
  const existing = await client.query("select language, number, song_id from catalog_songs order by language, number");
  if (existing.rows.length === 0) return;
  if (existing.rows.length !== songs.length) throw new Error("Refusing real catalog import because catalog_songs is not empty and does not match the frozen catalog key set.");
  const expected = new Map(songs.map((song) => [`${song.language}:${song.number}`, song]));
  for (const record of existing.rows) {
    const song = expected.get(`${record.language}:${record.number}`);
    if (!song || song.songId !== record.song_id) throw new Error("Refusing real catalog import because existing catalog_songs differs from the frozen catalog identity set.");
  }
}

export async function assertRuntimeCounts(client: Pick<PoolClient, "query">): Promise<void> {
  const { rows } = await client.query("select language, count(*)::int count from catalog_songs group by language order by language");
  const counts = Object.fromEntries(rows.map((row) => [row.language, Number(row.count)]));
  if (counts.czech !== 808 || counts.polish !== 990) throw new Error(`Runtime catalog count mismatch: Czech ${counts.czech ?? 0}, Polish ${counts.polish ?? 0}.`);
}

export async function getRealCatalogFingerprint(client: Pick<PoolClient, "query">): Promise<RealCatalogFingerprint> {
  const { rows } = await client.query(`
    select
      count(*)::int as total,
      count(*) filter (where language = 'czech')::int as czech,
      count(*) filter (where language = 'polish')::int as polish,
      md5(coalesce(string_agg(language || ':' || number, ',' order by language, number::int), '')) as key_hash,
      md5(coalesce(string_agg(language || ':' || number || ':' || song_id || ':' || title || ':' || coalesce(source_url, ''), ',' order by language, number::int), '')) as content_hash,
      (select count(*)::int from service_contexts) as lifecycle
    from catalog_songs`);
  const row = rows[0];
  return { total: Number(row.total), czech: Number(row.czech), polish: Number(row.polish), keyHash: String(row.key_hash), contentHash: String(row.content_hash), lifecycle: Number(row.lifecycle) };
}

function stableSongId(language: "czech" | "polish", number: number | string): string {
  return `real-${language}-${number}`;
}

function assertUniqueLanguageNumbers(songs: RealCatalogSong[]) {
  const seen = new Set<string>();
  for (const song of songs) {
    const key = `${song.language}:${song.number}`;
    if (seen.has(key)) throw new Error(`Duplicate language/number in real catalog: ${key}.`);
    seen.add(key);
  }
}

function validateValidationArtifact(language: keyof typeof artifacts, validation: ValidationArtifact) {
  const artifact = artifacts[language];
  if (!validation.validation_passed || validation.expected_records !== artifact.records || validation.actual_records !== artifact.records) throw new Error(`${language} validation artifact does not approve ${artifact.records} records.`);
  if (validation.checks?.duplicate_language_number_keys?.length || validation.checks?.empty_titles?.length || validation.checks?.invalid_source_urls?.length) throw new Error(`${language} validation artifact contains blocking checks.`);
}

function assertSha256(name: string, bytes: Buffer, expected: string) {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`${name}: SHA-256 mismatch; expected ${expected}, got ${actual}.`);
}
