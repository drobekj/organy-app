import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import type { ConcreteSongLanguage } from "../planning-lifecycle";

export const realCatalogArtifacts = [
  { language: "czech", file: "catalog-czech-final.json", expectedHash: "5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9", expectedCount: 808 },
  { language: "polish", file: "catalog-polish-final.json", expectedHash: "b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9", expectedCount: 990 },
] as const;

export type RealCatalogRecord = { language: ConcreteSongLanguage; number: number | string; title: string; source_url?: string; source_id?: string };
export type RealCatalogImportOptions = { failAfterRows?: number };
export type RealCatalogImportResult = { imported: number; byLanguage: Record<ConcreteSongLanguage, number>; fingerprint: string };

export function stableCatalogSongId(language: ConcreteSongLanguage, number: string): string { return `catalog:${language}:${number}`; }
export function encodeCatalogNumber(value: string | number): string { const encoded = String(value).trim(); if (!/^\d+$/.test(encoded)) throw new Error(`Catalog number must be digit-only after encoding: ${value}`); return encoded; }
export function sha256(bytes: Buffer | string): string { return createHash("sha256").update(bytes).digest("hex"); }

export async function loadFrozenCatalogs(root = process.cwd()): Promise<RealCatalogRecord[]> {
  const records: RealCatalogRecord[] = [];
  for (const artifact of realCatalogArtifacts) {
    const bytes = await readFile(join(root, "data/catalog", artifact.file));
    const actualHash = sha256(bytes);
    if (actualHash !== artifact.expectedHash) throw new Error(`${artifact.file} SHA-256 mismatch: expected ${artifact.expectedHash}, got ${actualHash}`);
    const parsed = JSON.parse(bytes.toString("utf8")) as RealCatalogRecord[];
    if (!Array.isArray(parsed) || parsed.length !== artifact.expectedCount) throw new Error(`${artifact.file} expected ${artifact.expectedCount} records.`);
    for (const record of parsed) {
      if (record.language !== artifact.language) throw new Error(`${artifact.file} contains unexpected language ${record.language}`);
      encodeCatalogNumber(record.number);
      if (!record.title.trim()) throw new Error(`${artifact.file} contains an empty title.`);
    }
    records.push(...parsed);
  }
  return records;
}

export async function assertNoDirtyCatalogState(client: Pick<PoolClient, "query">): Promise<void> {
  const { rows } = await client.query("select song_id, number, title from catalog_songs where song_id !~ '^catalog:(czech|polish):[0-9]+$' or number !~ '^[0-9]+$' or title ilike '%demo%' or title ilike '%synthetic%' limit 1");
  if (rows.length) throw new Error(`Dirty demo/synthetic catalog state refused: ${JSON.stringify(rows[0])}`);
}

export async function catalogFingerprint(client: Pick<PoolClient, "query">): Promise<string> {
  const { rows } = await client.query("select song_id, language::text as language, number, title, coalesce(source_url, '') as source_url, active from catalog_songs order by language, number::int, song_id");
  return sha256(JSON.stringify(rows));
}

export async function importRealCatalog(pool: Pool, options: RealCatalogImportOptions = {}): Promise<RealCatalogImportResult> {
  const records = await loadFrozenCatalogs();
  const client = await pool.connect();
  let imported = 0;
  try {
    await client.query("begin");
    await assertNoDirtyCatalogState(client);
    for (const record of records) {
      const number = encodeCatalogNumber(record.number);
      const songId = stableCatalogSongId(record.language, number);
      await client.query(
        "insert into catalog_songs (song_id, language, number, title, active, source_url, created_at, updated_at) values ($1, $2, $3, $4, true, $5, now(), now()) on conflict (song_id) do update set title = excluded.title, active = true, source_url = excluded.source_url, updated_at = now()",
        [songId, record.language, number, record.title.trim(), record.source_url ?? null],
      );
      imported += 1;
      if (options.failAfterRows && imported >= options.failAfterRows) throw new Error(`Deliberate transactional failure after ${imported} rows.`);
    }
    const counts = await client.query("select language::text, count(*)::int as count from catalog_songs where song_id like 'catalog:%' group by language");
    const byLanguage = { czech: 0, polish: 0 };
    for (const row of counts.rows) byLanguage[row.language as ConcreteSongLanguage] = Number(row.count);
    if (byLanguage.czech !== 808 || byLanguage.polish !== 990) throw new Error(`Unexpected real catalog counts: ${JSON.stringify(byLanguage)}`);
    const fingerprint = await catalogFingerprint(client);
    await client.query("commit");
    return { imported, byLanguage, fingerprint };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
