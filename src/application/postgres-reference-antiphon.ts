import type { Pool } from "pg";
import type {
  ReferenceAntiphonPage,
  ReferenceAntiphonProvider,
  ReferenceAntiphonQuery,
  ReferenceAntiphonRecord,
} from "./reference-antiphon-contract";

type Row = {
  id: string;
  language: "czech" | "polish";
  canonical_number: number;
  title: string;
  source_url: string;
};

function mapRecord(row: Row): ReferenceAntiphonRecord {
  return {
    id: row.id,
    language: row.language,
    canonicalNumber: row.canonical_number,
    displayNumber: String(row.canonical_number),
    title: row.title,
    sourceUrl: row.source_url,
  };
}

/** Read-only provider whose filtering, ordering, counts, and paging execute in PostgreSQL. */
export class PostgresReferenceAntiphonProvider implements ReferenceAntiphonProvider {
  constructor(private readonly pool: Pool) {}

  async list(input: ReferenceAntiphonQuery = {}): Promise<ReferenceAntiphonPage> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if ((input.language ?? "all") !== "all") {
      values.push(input.language);
      conditions.push(`language = $${values.length}`);
    }
    const search = input.search?.trim() ?? "";
    if (search) {
      values.push(/^\d+$/.test(search) ? Number(search) : `%${search}%`);
      conditions.push(/^\d+$/.test(search) ? `canonical_number = $${values.length}` : `title ILIKE $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = Number((await this.pool.query(`SELECT count(*)::int AS count FROM reference_antiphons ${where}`, values)).rows[0].count);
    const pageSize = input.pageSize ?? 50;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(input.page ?? 0, pageCount - 1);
    const pageValues = [...values, pageSize, page * pageSize];
    const rows = (await this.pool.query(
      `SELECT id, language, canonical_number, title, source_url FROM reference_antiphons ${where} ORDER BY canonical_number ASC LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    )).rows as Row[];
    return { records: rows.map(mapRecord), total, page, pageSize, pageCount, counts: await this.counts() };
  }

  async getById(id: string): Promise<ReferenceAntiphonRecord | undefined> {
    const row = (await this.pool.query(
      "SELECT id, language, canonical_number, title, source_url FROM reference_antiphons WHERE id = $1",
      [id],
    )).rows[0] as Row | undefined;
    return row ? mapRecord(row) : undefined;
  }

  private async counts(): Promise<ReferenceAntiphonPage["counts"]> {
    const row = (await this.pool.query(`SELECT
      count(*)::int AS all,
      count(*) FILTER (WHERE language = 'czech')::int AS czech,
      count(*) FILTER (WHERE language = 'polish')::int AS polish
      FROM reference_antiphons`)).rows[0];
    return { all: Number(row.all), czech: Number(row.czech), polish: Number(row.polish) };
  }
}
