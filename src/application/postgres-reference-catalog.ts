import type { Pool } from "pg";
import { displayReferenceNumber, normalizeReferenceNumberQuery, type ReferenceCatalogPage, type ReferenceCatalogQuery, type ReferenceCatalogRecord } from "./reference-catalog-contract";

type DatabaseRow = { id: string; language: "czech" | "polish"; canonical_number: number; title: string; source_url: string | null };
const ORDER_BY_NATURAL_NUMBER = `
  CASE WHEN canonical_number < 1000 THEN canonical_number WHEN canonical_number % 10 <> 0 THEN canonical_number / 10 WHEN canonical_number % 100 <> 0 THEN canonical_number / 100 WHEN canonical_number % 1000 <> 0 THEN canonical_number / 1000 ELSE canonical_number END,
  CASE WHEN canonical_number < 1000 THEN 0 WHEN canonical_number % 10 <> 0 THEN canonical_number % 10 WHEN canonical_number % 100 <> 0 THEN (canonical_number / 10) % 10 WHEN canonical_number % 1000 <> 0 THEN (canonical_number / 100) % 10 ELSE 0 END,
  language, title, id`;

function numberPredicate(search: string, values: unknown[]): string {
  if (/^[1-9]\d{3,}$/.test(search)) { values.push(Number(search)); return `canonical_number = $${values.length}`; }
  const family = search.match(/^([1-9]\d*)\/?$/);
  if (family) {
    values.push(Number(family[1]));
    const base = `CASE WHEN canonical_number < 1000 THEN canonical_number WHEN canonical_number % 10 <> 0 THEN canonical_number / 10 WHEN canonical_number % 100 <> 0 THEN canonical_number / 100 WHEN canonical_number % 1000 <> 0 THEN canonical_number / 1000 ELSE canonical_number END`;
    const variant = `CASE WHEN canonical_number < 1000 THEN 0 WHEN canonical_number % 10 <> 0 THEN canonical_number % 10 WHEN canonical_number % 100 <> 0 THEN (canonical_number / 10) % 10 WHEN canonical_number % 1000 <> 0 THEN (canonical_number / 100) % 10 ELSE 0 END`;
    return `${base} = $${values.length}${search.endsWith("/") ? ` AND ${variant} > 0` : ""}`;
  }
  const canonical = normalizeReferenceNumberQuery(search);
  values.push(canonical ?? -1); return `canonical_number = $${values.length}`;
}

function mapRecord(row: DatabaseRow): ReferenceCatalogRecord {
  const expectedId = `${row.language}:${row.canonical_number}`;
  if (row.id !== expectedId) throw new Error("Persisted reference catalog stable ID is invalid.");
  return { id: row.id, language: row.language, canonicalNumber: row.canonical_number, displayNumber: displayReferenceNumber(row.canonical_number), title: row.title, ...(row.source_url ? { sourceUrl: row.source_url } : {}) };
}

/** Read-only provider whose filtering, ordering, counts and pagination execute in PostgreSQL. */
export class PostgresReferenceCatalogProvider {
  constructor(private readonly pool: Pool) {}

  async list(input: ReferenceCatalogQuery = {}): Promise<ReferenceCatalogPage> {
    const language = input.language ?? "all"; const search = input.search?.trim() ?? "";
    const pageSize = input.pageSize ?? 50;
    if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error("Reference catalog pageSize must be a positive integer.");
    const conditions: string[] = []; const values: unknown[] = [];
    if (language !== "all") { values.push(language); conditions.push(`language = $${values.length}`); }
    if (search) {
      if (/^[1-9]\d*(?:\/[1-8]?)?$/.test(search)) conditions.push(numberPredicate(search, values));
      else { values.push(`%${search}%`); conditions.push(`title ILIKE $${values.length}`); }
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = Number((await this.pool.query(`SELECT count(*)::integer AS count FROM reference_catalog_songs ${where}`, values)).rows[0]?.count ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize)); const page = Math.min(Math.max(input.page ?? 0, 0), pageCount - 1);
    const pageValues = [...values, pageSize, page * pageSize];
    const rows = (await this.pool.query(`SELECT id, language, canonical_number, title, source_url FROM reference_catalog_songs ${where} ORDER BY ${ORDER_BY_NATURAL_NUMBER} LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`, pageValues)).rows as DatabaseRow[];
    return { records: rows.map(mapRecord), total, page, pageSize, pageCount, counts: await this.counts() };
  }

  async getById(id: string): Promise<ReferenceCatalogRecord | undefined> {
    const rows = (await this.pool.query("SELECT id, language, canonical_number, title, source_url FROM reference_catalog_songs WHERE id = $1", [id])).rows as DatabaseRow[];
    return rows[0] ? mapRecord(rows[0]) : undefined;
  }

  async counts(): Promise<ReferenceCatalogPage["counts"]> {
    const rows = await this.pool.query("SELECT count(*)::integer AS all, count(*) FILTER (WHERE language = 'czech')::integer AS czech, count(*) FILTER (WHERE language = 'polish')::integer AS polish FROM reference_catalog_songs");
    return { all: Number(rows.rows[0]?.all), czech: Number(rows.rows[0]?.czech), polish: Number(rows.rows[0]?.polish) };
  }
}
