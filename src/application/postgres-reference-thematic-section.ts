import type { Pool } from "pg";
import { referenceNumberParts } from "./reference-catalog-contract";
import type {
  ReferenceThematicLanguage,
  ReferenceThematicRange,
  ReferenceThematicSection,
  ReferenceThematicSectionProvider,
} from "./reference-thematic-section-contract";

type SectionRow = {
  id: string;
  theme_key: string;
  language: ReferenceThematicLanguage;
  title: string;
  parent_id: string;
  section_order: number;
  source_scan_page: number;
  source_printed_page: number;
};

type RangeRow = {
  section_id: string;
  range_order: number;
  from_number: number;
  to_number: number;
};

export class PostgresReferenceThematicSectionProvider implements ReferenceThematicSectionProvider {
  constructor(private readonly pool: Pool) {}

  async listSections(language: ReferenceThematicLanguage): Promise<ReferenceThematicSection[]> {
    assertLanguage(language);
    const rows = (await this.pool.query(
      `SELECT id,theme_key,language,title,parent_id,section_order,source_scan_page,source_printed_page
       FROM reference_thematic_sections
       WHERE language=$1
       ORDER BY section_order,id`,
      [language],
    )).rows as SectionRow[];
    return this.withRanges(rows);
  }

  async getSectionById(id: string): Promise<ReferenceThematicSection | undefined> {
    const row = (await this.pool.query(
      `SELECT id,theme_key,language,title,parent_id,section_order,source_scan_page,source_printed_page
       FROM reference_thematic_sections
       WHERE id=$1`,
      [id],
    )).rows[0] as SectionRow | undefined;
    if (!row) return undefined;
    return (await this.withRanges([row]))[0];
  }

  async resolveSection(
    language: ReferenceThematicLanguage,
    canonicalSongNumber: number,
  ): Promise<ReferenceThematicSection | undefined> {
    assertLanguage(language);
    const baseNumber = referenceNumberParts(canonicalSongNumber).base;
    const rows = (await this.pool.query(
      `SELECT DISTINCT s.id,s.theme_key,s.language,s.title,s.parent_id,s.section_order,s.source_scan_page,s.source_printed_page
       FROM reference_thematic_sections s
       JOIN reference_thematic_ranges r ON r.section_id=s.id
       WHERE s.language=$1 AND $2 BETWEEN r.from_number AND r.to_number
       ORDER BY s.section_order,s.id`,
      [language, baseNumber],
    )).rows as SectionRow[];
    if (rows.length > 1) throw new Error("Thematic-section resolution is ambiguous.");
    return rows[0] ? (await this.withRanges(rows))[0] : undefined;
  }

  private async withRanges(rows: SectionRow[]): Promise<ReferenceThematicSection[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const ranges = (await this.pool.query(
      `SELECT section_id,range_order,from_number,to_number
       FROM reference_thematic_ranges
       WHERE section_id=ANY($1::text[])
       ORDER BY section_id,range_order`,
      [ids],
    )).rows as RangeRow[];
    const bySection = new Map<string, ReferenceThematicRange[]>();
    for (const range of ranges) {
      bySection.set(range.section_id, [
        ...(bySection.get(range.section_id) ?? []),
        { from: Number(range.from_number), to: Number(range.to_number) },
      ]);
    }
    return rows.map((row) => ({
      id: row.id,
      themeKey: row.theme_key,
      language: row.language,
      title: row.title,
      parentId: row.parent_id,
      order: Number(row.section_order),
      ranges: bySection.get(row.id) ?? [],
      sourcePage: {
        scanPage: Number(row.source_scan_page),
        printedPage: Number(row.source_printed_page),
      },
    }));
  }
}

function assertLanguage(value: unknown): asserts value is ReferenceThematicLanguage {
  if (value !== "czech" && value !== "polish") throw new Error("Thematic language is invalid.");
}
