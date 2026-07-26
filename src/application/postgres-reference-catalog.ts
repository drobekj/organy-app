import type { Pool } from "pg";
import { createReferenceCatalogRecords, InMemoryReferenceCatalogProvider, type ReferenceCatalogPage, type ReferenceCatalogQuery, type ReferenceCatalogRecord } from "./reference-catalog";

type DatabaseRow = { id: unknown; language: unknown; canonical_number: unknown; title: unknown; source_url: unknown };

/** Read-only provider for the persisted snapshot. It intentionally has no mutation API. */
export class PostgresReferenceCatalogProvider {
  constructor(private readonly pool: Pool) {}

  private async records(): Promise<ReferenceCatalogRecord[]> {
    const result = await this.pool.query("SELECT id, language, canonical_number, title, source_url FROM reference_catalog_songs");
    return createReferenceCatalogRecords((result.rows as DatabaseRow[]).map((row) => ({ language: row.language, number: Number(row.canonical_number), title: row.title, source_url: row.source_url }))).map((record) => {
      const databaseId = String((result.rows as DatabaseRow[]).find((row) => row.language === record.language && Number(row.canonical_number) === record.canonicalNumber)?.id);
      if (databaseId !== record.id) throw new Error("Persisted reference catalog stable ID is invalid.");
      return record;
    });
  }

  async list(input: ReferenceCatalogQuery = {}): Promise<ReferenceCatalogPage> {
    return new InMemoryReferenceCatalogProvider(await this.records()).list(input);
  }

  async getById(id: string): Promise<ReferenceCatalogRecord | undefined> {
    return (await this.records()).find((record) => record.id === id);
  }

  async counts(): Promise<ReferenceCatalogPage["counts"]> {
    return new InMemoryReferenceCatalogProvider(await this.records()).counts;
  }
}
