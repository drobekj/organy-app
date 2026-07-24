import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import type { ConcreteSongLanguage } from "../planning-lifecycle";

export const realCatalogArtifacts = [
  { language: "czech", file: "catalog-czech-final.json", expectedHash: "5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9", expectedCount: 808 },
  { language: "polish", file: "catalog-polish-final.json", expectedHash: "b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9", expectedCount: 990 },
] as const;
export const realCatalogValidationArtifacts = [
  { file: "catalog-czech-validation.json", expectedHash: "e47da19e263f1ba962cb8e2699c6e94125499438a3ff74ccf78bdb29517cab40", expectedCount: 808 },
  { file: "catalog-polish-validation.json", expectedHash: "49a0accd4392ff9167707e2677d9edab9b5ed9ceb7d0d023a2251dfbca1b5559", expectedCount: 990 },
] as const;

type Queryable = Pick<PoolClient, "query">;
export type RealCatalogRecord = { language: ConcreteSongLanguage; number: number; title: string; source_url?: string | null; source_id?: string | null };
export type RealCatalogImportOptions = { failAfterRows?: number };
export type RealCatalogImportResult = { processed: number; inserted: number; updated: number; byLanguage: Record<ConcreteSongLanguage, number>; fingerprint: string };

export function stableCatalogSongId(language: ConcreteSongLanguage, number: number | string): string { return `catalog:${language}:${encodeCatalogNumber(number)}`; }
export function encodeCatalogNumber(value: string | number): string { const encoded = String(value).trim(); if (!/^\d+$/.test(encoded)) throw new Error(`Catalog number must be digit-only after encoding: ${value}`); return encoded; }
export function sha256(bytes: Buffer | string): string { return createHash("sha256").update(bytes).digest("hex"); }

export async function validateFrozenArtifacts(root = process.cwd()): Promise<RealCatalogRecord[]> {
  for (const artifact of realCatalogValidationArtifacts) {
    const bytes = await readFile(join(root, "data/catalog", artifact.file));
    const actual = sha256(bytes);
    if (actual !== artifact.expectedHash) throw new Error(`${artifact.file} SHA-256 mismatch: expected ${artifact.expectedHash}, got ${actual}`);
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (parsed?.validation_passed !== true || parsed?.expected_records !== artifact.expectedCount || parsed?.actual_records !== artifact.expectedCount) throw new Error(`${artifact.file} validation summary mismatch.`);
  }
  const records: RealCatalogRecord[] = [];
  const seen = new Set<string>();
  for (const artifact of realCatalogArtifacts) {
    const bytes = await readFile(join(root, "data/catalog", artifact.file));
    const actual = sha256(bytes);
    if (actual !== artifact.expectedHash) throw new Error(`${artifact.file} SHA-256 mismatch: expected ${artifact.expectedHash}, got ${actual}`);
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== artifact.expectedCount) throw new Error(`${artifact.file} expected ${artifact.expectedCount} records.`);
    for (const [index, record] of parsed.entries()) {
      if (record?.language !== artifact.language || (record.language !== "czech" && record.language !== "polish")) throw new Error(`${artifact.file}[${index}] unsupported language.`);
      if (!Number.isInteger(record.number)) throw new Error(`${artifact.file}[${index}] number must be an integer JSON number.`);
      encodeCatalogNumber(record.number);
      if (typeof record.title !== "string" || !record.title.trim()) throw new Error(`${artifact.file}[${index}] title is empty.`);
      if (record.source_url !== null && record.source_url !== undefined && (typeof record.source_url !== "string" || !/^https?:\/\//.test(record.source_url))) throw new Error(`${artifact.file}[${index}] source_url must be nullable or HTTP(S).`);
      const key = `${record.language}:${record.number}`;
      if (seen.has(key)) throw new Error(`Duplicate canonical catalog key ${key}.`);
      seen.add(key);
      records.push(record as RealCatalogRecord);
    }
  }
  if (records.filter((r) => r.language === "polish" && r.source_url).length !== 990) throw new Error("Expected 990 Polish source URLs.");
  if (records.filter((r) => r.language === "czech" && (r.source_url === null || r.source_url === undefined)).length !== 7) throw new Error("Expected exactly seven Czech null source URLs.");
  return records;
}

export async function assertCleanOperationalState(client: Queryable): Promise<void> {
  const checks = [
    ["dirty catalog songs", "select count(*)::int as count from catalog_songs where song_id !~ '^catalog:(czech|polish):[0-9]+$' or number !~ '^[0-9]+$' or title ilike '%demo%' or title ilike '%synthetic%'"],
    ["dirty catalog people", "select count(*)::int as count from catalog_persons"],
    ["dirty users", "select count(*)::int as count from app_users"],
    ["dirty roles", "select count(*)::int as count from app_user_roles"],
    ["dirty lifecycle", "select (select count(*) from service_contexts)+(select count(*) from service_sets)+(select count(*) from service_set_rows)+(select count(*) from completed_services)+(select count(*) from completed_service_rows)::int as count"],
    ["dirty preferences", "select (select count(*) from preference_profiles)+(select count(*) from song_preferences)+(select count(*) from organist_repertoire)::int as count"],
    ["dirty knowledge", "select (select count(*) from melody_equivalence_classes)+(select count(*) from song_melody_equivalence)+(select count(*) from antiphon_mappings)+(select count(*) from liturgical_season_mappings)::int as count"],
  ] as const;
  for (const [label, sql] of checks) {
    const { rows } = await client.query(sql);
    if (Number(rows[0].count) > 0) throw new Error(`Dirty ${label} state refused.`);
  }
}

export async function catalogFingerprint(client: Queryable): Promise<string> {
  const { rows } = await client.query("select song_id, language::text as language, number, title, coalesce(source_url, '') as source_url, coalesce(sheet_music_url, '') as sheet_music_url, active from catalog_songs order by language, number::int, song_id");
  return sha256(JSON.stringify(rows));
}

export async function importRealCatalog(pool: Pool, options: RealCatalogImportOptions = {}): Promise<RealCatalogImportResult> {
  const records = await validateFrozenArtifacts();
  const client = await pool.connect();
  let processed = 0, inserted = 0, updated = 0;
  try {
    await client.query("begin");
    await assertCleanOperationalState(client);
    for (const record of records) {
      const number = encodeCatalogNumber(record.number);
      const songId = stableCatalogSongId(record.language, number);
      const existing = await client.query("select song_id, title, source_url from catalog_songs where language = $1 and number = $2", [record.language, number]);
      if (existing.rows.length > 1) throw new Error(`Duplicate stored canonical key ${record.language}:${number}.`);
      if (existing.rows[0] && existing.rows[0].song_id !== songId) throw new Error(`Conflicting songId for ${record.language}:${number}: ${existing.rows[0].song_id}`);
      if (existing.rows[0]) {
        await client.query("update catalog_songs set title = $3, active = true, source_url = $4, updated_at = now() where language = $1 and number = $2", [record.language, number, record.title.trim(), record.source_url ?? null]);
        if (existing.rows[0].title !== record.title.trim() || (existing.rows[0].source_url ?? null) !== (record.source_url ?? null)) updated += 1;
      } else {
        await client.query("insert into catalog_songs (song_id, language, number, title, active, source_url, created_at, updated_at) values ($1, $2, $3, $4, true, $5, now(), now())", [songId, record.language, number, record.title.trim(), record.source_url ?? null]);
        inserted += 1;
      }
      processed += 1;
      if (options.failAfterRows && processed >= options.failAfterRows) throw new Error(`Deliberate transactional failure after ${processed} rows.`);
    }
    const byLanguage = await realCatalogCounts(client);
    if (byLanguage.czech !== 808 || byLanguage.polish !== 990) throw new Error(`Unexpected real catalog counts: ${JSON.stringify(byLanguage)}`);
    const fingerprint = await catalogFingerprint(client);
    await client.query("commit");
    return { processed, inserted, updated, byLanguage, fingerprint };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

export async function realCatalogCounts(client: Queryable): Promise<Record<ConcreteSongLanguage, number>> {
  const counts = { czech: 0, polish: 0 };
  const { rows } = await client.query("select language::text, count(*)::int as count from catalog_songs group by language");
  for (const row of rows) counts[row.language as ConcreteSongLanguage] = Number(row.count);
  return counts;
}
