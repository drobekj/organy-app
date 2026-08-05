import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";
import type {
  ReferenceThematicCatalog,
  ReferenceThematicGap,
  ReferenceThematicLanguage,
  ReferenceThematicParent,
  ReferenceThematicRange,
  ReferenceThematicSection,
} from "./reference-thematic-section-contract";

const FROZEN_FILES = {
  czech: {
    path: "data/catalog/catalog-czech-thematic-sections.json",
    sourceFile: "temata_cz.pdf",
    sha256: "3f6fe7ff83204436fc6e6cdd7de8e9e7f52c73941204b9543379d707a7c08e76",
    parents: 3,
    sections: 35,
    first: 1,
    last: 799,
  },
  polish: {
    path: "data/catalog/catalog-polish-thematic-sections.json",
    sourceFile: "temata_pl.pdf",
    sha256: "7e0b26f6bacceb0aa754166f4630e03a26098827feb7a0ed48909bbe9c9b6919",
    parents: 3,
    sections: 36,
    first: 1,
    last: 955,
  },
} as const;

const POLISH_ONLY_THEME_KEYS = new Set(["faith-love-hope.neighbor-love"]);

export type ValidatedReferenceThematicData = {
  catalogs: ReferenceThematicCatalog[];
  parents: ReferenceThematicParent[];
  sections: ReferenceThematicSection[];
  gaps: ReferenceThematicGap[];
};

export async function loadAndValidateReferenceThematicSections(
  paths: Partial<Record<ReferenceThematicLanguage, string>> = {},
): Promise<ValidatedReferenceThematicData> {
  const catalogs = await Promise.all((["czech", "polish"] as const).map(async (language) => {
    const config = FROZEN_FILES[language];
    const path = paths[language] ?? config.path;
    const bytes = await readFile(resolve(process.cwd(), path));
    const normalized = bytes.toString("utf8").replace(/\r\n/g, "\n");
    if (createHash("sha256").update(normalized).digest("hex") !== config.sha256) {
      throw new Error(`Frozen ${language} thematic-section SHA-256 mismatch.`);
    }
    return JSON.parse(normalized) as unknown;
  }));
  const validated = validateReferenceThematicCatalogs(catalogs, { enforceFrozenShape: true });
  if (validated.gaps.length) throw new Error("Frozen thematic-section catalogs unexpectedly contain gaps.");
  return validated;
}

export function validateReferenceThematicCatalogs(
  values: unknown[],
  options: { enforceFrozenShape?: boolean } = {},
): ValidatedReferenceThematicData {
  if (!Array.isArray(values) || values.length !== 2) throw new Error("Exactly two thematic-section catalogs are required.");
  const catalogs = values.map(parseCatalog);
  const byLanguage = new Map(catalogs.map((catalog) => [catalog.language, catalog]));
  if (byLanguage.size !== 2 || !byLanguage.has("czech") || !byLanguage.has("polish")) {
    throw new Error("The thematic-section catalogs must contain exactly Czech and Polish data.");
  }

  const allNodeIds = new Set<string>();
  const parentById = new Map<string, ReferenceThematicParent>();
  const sectionIds = new Set<string>();
  for (const catalog of catalogs) {
    validateCatalogIdentity(catalog);
    const parentOrders = new Set<number>();
    for (const parent of catalog.parents) {
      if (allNodeIds.has(parent.id)) throw new Error(`Duplicate thematic node id '${parent.id}'.`);
      allNodeIds.add(parent.id);
      parentById.set(parent.id, parent);
      if (parentOrders.has(parent.order)) throw new Error(`Duplicate thematic parent order for ${catalog.language}.`);
      parentOrders.add(parent.order);
    }
    const sectionOrders = new Set<number>();
    for (const section of catalog.sections) {
      if (allNodeIds.has(section.id)) throw new Error(`Duplicate thematic node id '${section.id}'.`);
      allNodeIds.add(section.id);
      sectionIds.add(section.id);
      if (sectionOrders.has(section.order)) throw new Error(`Duplicate thematic section order for ${catalog.language}.`);
      sectionOrders.add(section.order);
    }
    if ([...sectionOrders].sort((a, b) => a - b).some((order, index) => order !== index + 1)) {
      throw new Error(`Thematic section order for ${catalog.language} must be consecutive from 1.`);
    }
  }

  for (const catalog of catalogs) {
    for (const parent of catalog.parents) {
      if (parent.parentId !== null) {
        const target = parentById.get(parent.parentId);
        if (!target || target.language !== parent.language) throw new Error(`Unknown thematic parent '${parent.parentId}'.`);
      }
    }
    detectParentCycles(catalog.parents);
    for (const section of catalog.sections) {
      const parent = parentById.get(section.parentId);
      if (!parent || parent.language !== section.language) throw new Error(`Unknown thematic parent '${section.parentId}'.`);
      if (sectionIds.has(section.parentId)) throw new Error("A thematic section cannot parent another selectable section.");
    }
  }

  validateThemePairings(catalogs.flatMap((catalog) => catalog.sections));
  const gaps = catalogs.flatMap(findGapsAndRejectOverlaps);

  if (options.enforceFrozenShape) {
    for (const language of ["czech", "polish"] as const) {
      const catalog = byLanguage.get(language)!;
      const config = FROZEN_FILES[language];
      if (
        catalog.sourceFile !== config.sourceFile
        || catalog.parents.length !== config.parents
        || catalog.sections.length !== config.sections
      ) throw new Error(`Frozen ${language} thematic-section count/source mismatch.`);
      const orderedRanges = catalog.sections.flatMap((section) => section.ranges).sort((a, b) => a.from - b.from || a.to - b.to);
      if (orderedRanges[0]?.from !== config.first || orderedRanges.at(-1)?.to !== config.last) {
        throw new Error(`Frozen ${language} thematic-section boundary mismatch.`);
      }
    }
  }

  return {
    catalogs,
    parents: catalogs.flatMap((catalog) => catalog.parents),
    sections: catalogs.flatMap((catalog) => catalog.sections),
    gaps,
  };
}

function parseCatalog(value: unknown): ReferenceThematicCatalog {
  const record = requireRecord(value, "Thematic catalog");
  requireKeys(record, ["language", "sourceFile", "parents", "sections"], "Thematic catalog");
  const language = requireLanguage(record.language);
  if (typeof record.sourceFile !== "string" || !record.sourceFile.trim()) throw new Error("Thematic sourceFile is invalid.");
  if (!Array.isArray(record.parents) || !Array.isArray(record.sections)) throw new Error("Thematic parents/sections must be arrays.");
  return {
    language,
    sourceFile: record.sourceFile,
    parents: record.parents.map((item) => parseParent(item, language)),
    sections: record.sections.map((item) => parseSection(item, language)),
  };
}

function parseParent(value: unknown, catalogLanguage: ReferenceThematicLanguage): ReferenceThematicParent {
  const record = requireRecord(value, "Thematic parent");
  requireKeys(record, ["id", "language", "title", "parentId", "order", "sourcePage"], "Thematic parent");
  const language = requireLanguage(record.language);
  if (language !== catalogLanguage) throw new Error("Thematic parent language differs from its catalog.");
  const sourcePage = requireRecord(record.sourcePage, "Thematic parent sourcePage");
  requireKeys(sourcePage, ["scanPage"], "Thematic parent sourcePage");
  return {
    id: requireTrimmed(record.id, "Thematic parent id"),
    language,
    title: requireTrimmed(record.title, "Thematic parent title"),
    parentId: record.parentId === null ? null : requireTrimmed(record.parentId, "Thematic parent parentId"),
    order: requirePositiveInteger(record.order, "Thematic parent order"),
    sourcePage: { scanPage: requirePositiveInteger(sourcePage.scanPage, "Thematic parent scanPage") },
  };
}

function parseSection(value: unknown, catalogLanguage: ReferenceThematicLanguage): ReferenceThematicSection {
  const record = requireRecord(value, "Thematic section");
  requireKeys(record, ["id", "themeKey", "language", "title", "parentId", "order", "ranges", "sourcePage"], "Thematic section");
  const language = requireLanguage(record.language);
  if (language !== catalogLanguage) throw new Error("Thematic section language differs from its catalog.");
  if (!Array.isArray(record.ranges) || record.ranges.length === 0) throw new Error("Thematic section ranges must be a non-empty array.");
  const sourcePage = requireRecord(record.sourcePage, "Thematic section sourcePage");
  requireKeys(sourcePage, ["scanPage", "printedPage"], "Thematic section sourcePage");
  return {
    id: requireTrimmed(record.id, "Thematic section id"),
    themeKey: requireTrimmed(record.themeKey, "Thematic section themeKey"),
    language,
    title: requireTrimmed(record.title, "Thematic section title"),
    parentId: requireTrimmed(record.parentId, "Thematic section parentId"),
    order: requirePositiveInteger(record.order, "Thematic section order"),
    ranges: record.ranges.map(parseRange),
    sourcePage: {
      scanPage: requirePositiveInteger(sourcePage.scanPage, "Thematic section scanPage"),
      printedPage: requirePositiveInteger(sourcePage.printedPage, "Thematic section printedPage"),
    },
  };
}

function parseRange(value: unknown): ReferenceThematicRange {
  const record = requireRecord(value, "Thematic range");
  requireKeys(record, ["from", "to"], "Thematic range");
  const from = requirePositiveInteger(record.from, "Thematic range from");
  const to = requirePositiveInteger(record.to, "Thematic range to");
  if (from > to) throw new Error("Thematic range from must not exceed to.");
  return { from, to };
}

function validateCatalogIdentity(catalog: ReferenceThematicCatalog): void {
  for (const parent of catalog.parents) {
    if (!parent.id.startsWith(`${catalog.language}:`)) throw new Error("Thematic parent id language prefix is invalid.");
  }
  for (const section of catalog.sections) {
    if (!section.id.startsWith(`${catalog.language}:`)) throw new Error("Thematic section id language prefix is invalid.");
  }
}

function detectParentCycles(parents: ReferenceThematicParent[]): void {
  const byId = new Map(parents.map((parent) => [parent.id, parent]));
  for (const start of parents) {
    const seen = new Set<string>();
    let current: ReferenceThematicParent | undefined = start;
    while (current?.parentId) {
      if (seen.has(current.id)) throw new Error("Thematic parent hierarchy contains a cycle.");
      seen.add(current.id);
      current = byId.get(current.parentId);
    }
  }
}

function validateThemePairings(sections: ReferenceThematicSection[]): void {
  const languagesByTheme = new Map<string, Set<ReferenceThematicLanguage>>();
  for (const section of sections) {
    const languages = languagesByTheme.get(section.themeKey) ?? new Set<ReferenceThematicLanguage>();
    if (languages.has(section.language)) throw new Error(`Duplicate thematic pairing for '${section.themeKey}'.`);
    languages.add(section.language);
    languagesByTheme.set(section.themeKey, languages);
  }
  for (const [themeKey, languages] of languagesByTheme) {
    const bilingual = languages.size === 2 && languages.has("czech") && languages.has("polish");
    const approvedPolishOnly = POLISH_ONLY_THEME_KEYS.has(themeKey) && languages.size === 1 && languages.has("polish");
    if (!bilingual && !approvedPolishOnly) throw new Error(`Invalid bilingual thematic pairing '${themeKey}'.`);
  }
}

function findGapsAndRejectOverlaps(catalog: ReferenceThematicCatalog): ReferenceThematicGap[] {
  const ranges = catalog.sections.flatMap((section) => section.ranges.map((range) => ({ ...range, sectionId: section.id })))
    .sort((a, b) => a.from - b.from || a.to - b.to || a.sectionId.localeCompare(b.sectionId));
  const gaps: ReferenceThematicGap[] = [];
  let previous: typeof ranges[number] | undefined;
  for (const range of ranges) {
    if (previous && range.from <= previous.to) throw new Error(`Overlapping thematic ranges in ${catalog.language}.`);
    if (previous && range.from > previous.to + 1) gaps.push({ language: catalog.language, after: previous.to, before: range.from });
    previous = range;
  }
  return gaps;
}

export async function synchronizeReferenceThematicSections(
  pool: Pool,
  options: { data?: ValidatedReferenceThematicData; failBeforeCommit?: boolean } = {},
): Promise<{ parents: number; sections: number; ranges: number }> {
  const data = options.data ?? await loadAndValidateReferenceThematicSections();
  const validated = validateReferenceThematicCatalogs(data.catalogs, { enforceFrozenShape: true });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE incoming_reference_thematic_parents (LIKE reference_thematic_parents INCLUDING DEFAULTS) ON COMMIT DROP");
    await client.query("CREATE TEMP TABLE incoming_reference_thematic_sections (LIKE reference_thematic_sections INCLUDING DEFAULTS) ON COMMIT DROP");
    await client.query("CREATE TEMP TABLE incoming_reference_thematic_ranges (LIKE reference_thematic_ranges INCLUDING DEFAULTS) ON COMMIT DROP");

    await insertParents(client, validated.parents);
    await insertSections(client, validated.sections);
    await insertRanges(client, validated.sections);

    await client.query(`INSERT INTO reference_thematic_parents
      SELECT * FROM incoming_reference_thematic_parents
      ON CONFLICT(id) DO UPDATE SET language=excluded.language,title=excluded.title,parent_id=excluded.parent_id,section_order=excluded.section_order,source_scan_page=excluded.source_scan_page`);
    await client.query(`INSERT INTO reference_thematic_sections
      SELECT * FROM incoming_reference_thematic_sections
      ON CONFLICT(id) DO UPDATE SET theme_key=excluded.theme_key,language=excluded.language,title=excluded.title,parent_id=excluded.parent_id,section_order=excluded.section_order,source_scan_page=excluded.source_scan_page,source_printed_page=excluded.source_printed_page`);
    await client.query(`INSERT INTO reference_thematic_ranges
      SELECT * FROM incoming_reference_thematic_ranges
      ON CONFLICT(section_id,range_order) DO UPDATE SET from_number=excluded.from_number,to_number=excluded.to_number`);

    await client.query("DELETE FROM reference_thematic_ranges r WHERE NOT EXISTS (SELECT 1 FROM incoming_reference_thematic_ranges i WHERE i.section_id=r.section_id AND i.range_order=r.range_order)");
    await client.query("DELETE FROM reference_thematic_sections s WHERE NOT EXISTS (SELECT 1 FROM incoming_reference_thematic_sections i WHERE i.id=s.id)");
    await client.query("DELETE FROM reference_thematic_parents p WHERE NOT EXISTS (SELECT 1 FROM incoming_reference_thematic_parents i WHERE i.id=p.id)");

    if (options.failBeforeCommit) throw new Error("Injected thematic-section synchronization failure.");
    const counts = await databaseReferenceThematicCounts(client);
    if (counts.parents !== 6 || counts.sections !== 71 || counts.ranges !== 71) throw new Error("Synchronized thematic-section counts are invalid.");
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function insertParents(client: PoolClient, parents: ReferenceThematicParent[]): Promise<void> {
  const values: unknown[] = [];
  const tuples = parents.map((parent) => {
    const offset = values.length;
    values.push(parent.id, parent.language, parent.title, parent.parentId, parent.order, parent.sourcePage.scanPage);
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`;
  });
  await client.query(`INSERT INTO incoming_reference_thematic_parents(id,language,title,parent_id,section_order,source_scan_page) VALUES ${tuples.join(",")}`, values);
}

async function insertSections(client: PoolClient, sections: ReferenceThematicSection[]): Promise<void> {
  const values: unknown[] = [];
  const tuples = sections.map((section) => {
    const offset = values.length;
    values.push(section.id, section.themeKey, section.language, section.title, section.parentId, section.order, section.sourcePage.scanPage, section.sourcePage.printedPage);
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8})`;
  });
  await client.query(`INSERT INTO incoming_reference_thematic_sections(id,theme_key,language,title,parent_id,section_order,source_scan_page,source_printed_page) VALUES ${tuples.join(",")}`, values);
}

async function insertRanges(client: PoolClient, sections: ReferenceThematicSection[]): Promise<void> {
  const values: unknown[] = [];
  const tuples: string[] = [];
  for (const section of sections) {
    section.ranges.forEach((range, index) => {
      const offset = values.length;
      values.push(section.id, index + 1, range.from, range.to);
      tuples.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4})`);
    });
  }
  await client.query(`INSERT INTO incoming_reference_thematic_ranges(section_id,range_order,from_number,to_number) VALUES ${tuples.join(",")}`, values);
}

export async function databaseReferenceThematicCounts(
  client: Pick<PoolClient, "query">,
): Promise<{ parents: number; sections: number; ranges: number }> {
  const [parents, sections, ranges] = await Promise.all([
    client.query("SELECT count(*)::int count FROM reference_thematic_parents"),
    client.query("SELECT count(*)::int count FROM reference_thematic_sections"),
    client.query("SELECT count(*)::int count FROM reference_thematic_ranges"),
  ]);
  return {
    parents: Number(parents.rows[0].count),
    sections: Number(sections.rows[0].count),
    ranges: Number(ranges.rows[0].count),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireKeys(record: Record<string, unknown>, expected: string[], label: string): void {
  if (JSON.stringify(Object.keys(record)) !== JSON.stringify(expected)) throw new Error(`${label} keys are invalid.`);
}

function requireLanguage(value: unknown): ReferenceThematicLanguage {
  if (value !== "czech" && value !== "polish") throw new Error("Thematic language is invalid.");
  return value;
}

function requireTrimmed(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}
