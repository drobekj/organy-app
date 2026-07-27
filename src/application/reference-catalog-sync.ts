import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";

type InputRecord = { source_id?: unknown; language: unknown; number: unknown; title: unknown; source_url: unknown };
export type PersistedReferenceCatalogRecord = { id: string; language: "czech" | "polish"; canonicalNumber: number; sourceId: string; title: string; sourceUrl: string | null };

async function readFinalCatalog(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
}

export async function loadAndValidateReferenceCatalog(): Promise<PersistedReferenceCatalogRecord[]> {
  const inputs = await Promise.all([
    readFinalCatalog("data/catalog/catalog-czech-final.json"),
    readFinalCatalog("data/catalog/catalog-polish-final.json"),
  ]);
  if (!inputs.every(Array.isArray)) throw new Error("Authoritative reference catalogs must be JSON arrays.");
  const ids = new Set<string>(); const numbers = new Set<string>(); const sources = new Set<string>();
  const records = (inputs.flat() as InputRecord[]).map((raw) => {
    if ((raw.language !== "czech" && raw.language !== "polish") || !Number.isInteger(raw.number) || Number(raw.number) <= 0 || typeof raw.title !== "string" || !raw.title.trim() || (raw.source_url !== null && (typeof raw.source_url !== "string" || !raw.source_url.trim()))) throw new Error("Invalid authoritative reference catalog record.");
    const language = raw.language as "czech" | "polish"; const canonicalNumber = Number(raw.number); const id = `${language}:${canonicalNumber}`;
    let sourceId: string;
    if (language === "czech") {
      if (raw.source_id !== null && (typeof raw.source_id !== "string" || !raw.source_id.trim())) throw new Error("Czech reference source_id must be non-empty when supplied.");
      // Seven accepted Czech records have no upstream identity; their accepted catalog number is the only stable source token.
      sourceId = typeof raw.source_id === "string" ? raw.source_id : String(canonicalNumber);
    } else {
      if (typeof raw.source_url !== "string") throw new Error("Polish reference records require a Hymnary source URL.");
      const match = raw.source_url.match(/^https:\/\/hymnary\.org\/hymn\/SE2002\/([^/?#]+)$/);
      if (!match?.[1]) throw new Error("Polish reference source_id must be derived from the terminal Hymnary URL token.");
      sourceId = match[1];
    }
    const numberKey = `${language}:${canonicalNumber}`; const sourceKey = `${language}:${sourceId}`;
    if (ids.has(id) || numbers.has(numberKey) || sources.has(sourceKey)) throw new Error("Duplicate authoritative reference catalog identity.");
    ids.add(id); numbers.add(numberKey); sources.add(sourceKey);
    return { id, language, canonicalNumber, sourceId, title: raw.title, sourceUrl: raw.source_url as string | null };
  });
  const czech = records.filter((record) => record.language === "czech").length;
  const polish = records.filter((record) => record.language === "polish").length;
  if (czech !== 808 || polish !== 990 || records.length !== 1798) throw new Error(`Unexpected authoritative reference catalog counts: ${czech} / ${polish} / ${records.length}.`);
  return records;
}

export async function synchronizeReferenceCatalog(pool: Pool, options: { failBeforeCommit?: boolean } = {}): Promise<{ czech: number; polish: number; total: number }> {
  const records = await loadAndValidateReferenceCatalog();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM reference_catalog_songs");
    const values: unknown[] = []; const tuples: string[] = [];
    for (const record of records) {
      const offset = values.length;
      values.push(record.id, record.language, record.canonicalNumber, record.sourceId, record.title, record.sourceUrl);
      tuples.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
    }
    await client.query(`INSERT INTO reference_catalog_songs (id, language, canonical_number, source_id, title, source_url) VALUES ${tuples.join(",")}`, values);
    if (options.failBeforeCommit) throw new Error("Injected reference catalog synchronization failure.");
    const counts = await databaseReferenceCatalogCounts(client);
    if (counts.czech !== 808 || counts.polish !== 990 || counts.total !== 1798) throw new Error("Synchronized reference catalog counts are invalid.");
    await client.query("COMMIT");
    return counts;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

export async function databaseReferenceCatalogCounts(client: Pick<PoolClient, "query">): Promise<{ czech: number; polish: number; total: number }> {
  const result = await client.query("SELECT language, count(*)::integer AS count FROM reference_catalog_songs GROUP BY language");
  const count = (language: string) => Number(result.rows.find((row) => row.language === language)?.count ?? 0);
  const czech = count("czech"); const polish = count("polish");
  return { czech, polish, total: czech + polish };
}
