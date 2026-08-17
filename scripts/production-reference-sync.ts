import { Pool } from "pg";
import {
  loadAndValidateReferenceCatalog,
  synchronizeReferenceCatalog,
} from "../src/application/reference-catalog-sync";
import {
  loadAndValidatePolishReferenceAntiphons,
  loadAndValidateReferenceAntiphons,
  synchronizeProductionReferenceAntiphons,
} from "../src/application/reference-antiphon-sync";
import {
  loadAndValidateReferenceThematicSections,
  synchronizeReferenceThematicSections,
} from "../src/application/reference-thematic-section-sync";

const APPLY_FLAG = "--apply";
const DIRECT_URL_KEY = "DATABASE_URL_UNPOOLED";
const EXPECTED_PUBLIC_TABLES = 32;
const CONFIG_TABLE = "melody_non_repetition_config";
const FINAL_NON_EMPTY_TABLES = [
  CONFIG_TABLE,
  "reference_antiphons",
  "reference_catalog_songs",
  "reference_melody_classes",
  "reference_song_melody_memberships",
  "reference_thematic_parents",
  "reference_thematic_ranges",
  "reference_thematic_sections",
].sort();

const SAFE_FAILURES = new Set([
  `${DIRECT_URL_KEY} is required for production reference synchronization.`,
  `${DIRECT_URL_KEY} must be a valid PostgreSQL URL.`,
  `${DIRECT_URL_KEY} must use the postgres or postgresql protocol.`,
  `${DIRECT_URL_KEY} must be the direct/unpooled PostgreSQL endpoint.`,
  `Only the optional ${APPLY_FLAG} argument is accepted.`,
  `Production reference synchronization requires the reviewed ${EXPECTED_PUBLIC_TABLES}-table Phase 31.38 schema.`,
  "Production reference synchronization refuses a target with Neon Auth/Data API state.",
  "Production reference synchronization refuses unexpected or partially synchronized application data.",
  "Reviewed migration-owned configuration singleton is missing or has unexpected contents.",
  "Authoritative reference source validation failed.",
  "Production reference synchronization did not produce the exact reviewed reference snapshot.",
]);

type DatabaseError = Error & { code?: string };
type TargetState = "baseline" | "final";
type AuthoritativeSources = {
  catalogRecords: Awaited<ReturnType<typeof loadAndValidateReferenceCatalog>>;
  czechAntiphons: Awaited<ReturnType<typeof loadAndValidateReferenceAntiphons>>;
  polishAntiphons: Awaited<ReturnType<typeof loadAndValidatePolishReferenceAntiphons>>;
  thematicData: Awaited<ReturnType<typeof loadAndValidateReferenceThematicSections>>;
};

type ProviderBoundary = {
  publicTables: string[];
  nonEmptyPublicTables: string[];
  neonAuthSchema: boolean;
  authenticatedRole: boolean;
  anonymousRole: boolean;
};

function readDirectUrl(): string {
  const value = process.env[DIRECT_URL_KEY]?.trim();
  if (!value) throw new Error(`${DIRECT_URL_KEY} is required for production reference synchronization.`);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${DIRECT_URL_KEY} must be a valid PostgreSQL URL.`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${DIRECT_URL_KEY} must use the postgres or postgresql protocol.`);
  }
  if (parsed.hostname.toLowerCase().includes("-pooler")) {
    throw new Error(`${DIRECT_URL_KEY} must be the direct/unpooled PostgreSQL endpoint.`);
  }
  return value;
}

function requestedApply(): boolean {
  const args = process.argv.slice(2);
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === APPLY_FLAG) return true;
  throw new Error(`Only the optional ${APPLY_FLAG} argument is accepted.`);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function inspectProviderBoundary(pool: Pool): Promise<ProviderBoundary> {
  const publicTables = (await pool.query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  )).rows.map((row) => String(row.tablename));

  const nonEmptyPublicTables: string[] = [];
  for (const table of publicTables) {
    const result = await pool.query(`select count(*)::int as n from public.${quoteIdentifier(table)}`);
    if (Number(result.rows[0]?.n ?? 0) !== 0) nonEmptyPublicTables.push(table);
  }

  const provider = (await pool.query(`
    select
      exists(select 1 from pg_namespace where nspname='neon_auth') as neon_auth_schema,
      exists(select 1 from pg_roles where rolname='authenticated') as authenticated_role,
      exists(select 1 from pg_roles where rolname='anonymous') as anonymous_role
  `)).rows[0] as Record<string, boolean>;

  return {
    publicTables,
    nonEmptyPublicTables,
    neonAuthSchema: Boolean(provider.neon_auth_schema),
    authenticatedRole: Boolean(provider.authenticated_role),
    anonymousRole: Boolean(provider.anonymous_role),
  };
}

async function assertReviewedConfig(pool: Pool): Promise<void> {
  const rows = (await pool.query(
    `select id, months from public.${quoteIdentifier(CONFIG_TABLE)} order by id`,
  )).rows as Array<{ id: string; months: number }>;
  if (rows.length !== 1 || rows[0]?.id !== "global" || Number(rows[0]?.months) !== 2) {
    throw new Error("Reviewed migration-owned configuration singleton is missing or has unexpected contents.");
  }
}

function sameStrings(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function stableStringCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertSameJson(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Production reference synchronization did not produce the exact reviewed reference snapshot.");
  }
}

async function assertExactFinalSnapshot(pool: Pool): Promise<void> {
  const catalog = (await pool.query(`
    select
      count(*)::int as total,
      count(*) filter (where language='czech')::int as czech,
      count(*) filter (where language='polish')::int as polish
    from reference_catalog_songs
  `)).rows[0];

  const melody = (await pool.query(`
    select
      (select count(*)::int from reference_melody_classes) as classes,
      (select count(*)::int from reference_song_melody_memberships) as memberships,
      (select count(*)::int
         from reference_catalog_songs s
         left join reference_song_melody_memberships m on m.reference_song_id=s.id
        where m.reference_song_id is null) as missing_memberships,
      (select count(*)::int
         from reference_song_melody_memberships m
         join reference_catalog_songs s on s.id=m.reference_song_id
        where m.class_id <> 'reference-melody:' || s.id) as non_singleton_memberships,
      (select count(*)::int
         from reference_melody_classes c
         left join reference_song_melody_memberships m on m.class_id=c.id
        where m.class_id is null) as orphan_classes
  `)).rows[0];

  const antiphons = (await pool.query(`
    select
      count(*)::int as total,
      count(*) filter (where language='czech')::int as czech,
      count(*) filter (where language='polish')::int as polish
    from reference_antiphons
  `)).rows[0];

  const thematic = (await pool.query(`
    select
      (select count(*)::int from reference_thematic_parents) as parents,
      (select count(*)::int from reference_thematic_sections) as sections,
      (select count(*)::int from reference_thematic_sections where language='czech') as czech_sections,
      (select count(*)::int from reference_thematic_sections where language='polish') as polish_sections,
      (select count(*)::int from reference_thematic_ranges) as ranges,
      (select count(*)::int from reference_thematic_ranges r join reference_thematic_sections s on s.id=r.section_id where s.language='czech') as czech_ranges,
      (select count(*)::int from reference_thematic_ranges r join reference_thematic_sections s on s.id=r.section_id where s.language='polish') as polish_ranges
  `)).rows[0];

  const exact =
    Number(catalog.total) === 1798
    && Number(catalog.czech) === 808
    && Number(catalog.polish) === 990
    && Number(melody.classes) === 1798
    && Number(melody.memberships) === 1798
    && Number(melody.missing_memberships) === 0
    && Number(melody.non_singleton_memberships) === 0
    && Number(melody.orphan_classes) === 0
    && Number(antiphons.total) === 232
    && Number(antiphons.czech) === 116
    && Number(antiphons.polish) === 116
    && Number(thematic.parents) === 6
    && Number(thematic.sections) === 71
    && Number(thematic.czech_sections) === 35
    && Number(thematic.polish_sections) === 36
    && Number(thematic.ranges) === 71
    && Number(thematic.czech_ranges) === 35
    && Number(thematic.polish_ranges) === 36;

  if (!exact) {
    throw new Error("Production reference synchronization did not produce the exact reviewed reference snapshot.");
  }
}

async function assertDatabaseMatchesAuthoritativeSources(pool: Pool, sources: AuthoritativeSources): Promise<void> {
  const actualCatalog = (await pool.query(`
    select id, language, canonical_number, source_id, title, source_url
    from reference_catalog_songs
  `)).rows.map((row) => ({
    id: String(row.id),
    language: String(row.language),
    canonicalNumber: Number(row.canonical_number),
    sourceId: String(row.source_id),
    title: String(row.title),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
  })).sort((a, b) => stableStringCompare(a.id, b.id));
  const expectedCatalog = sources.catalogRecords.map((record) => ({ ...record }))
    .sort((a, b) => stableStringCompare(a.id, b.id));
  assertSameJson(actualCatalog, expectedCatalog);

  const actualAntiphons = (await pool.query(`
    select id, language, canonical_number, title, source_url
    from reference_antiphons
  `)).rows.map((row) => ({
    id: String(row.id),
    language: String(row.language),
    canonicalNumber: Number(row.canonical_number),
    title: String(row.title),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
  })).sort((a, b) => stableStringCompare(a.id, b.id));
  const expectedAntiphons = [...sources.czechAntiphons, ...sources.polishAntiphons]
    .map((record) => ({ ...record }))
    .sort((a, b) => stableStringCompare(a.id, b.id));
  assertSameJson(actualAntiphons, expectedAntiphons);

  const actualParents = (await pool.query(`
    select id, language, title, parent_id, section_order, source_scan_page
    from reference_thematic_parents
  `)).rows.map((row) => ({
    id: String(row.id),
    language: String(row.language),
    title: String(row.title),
    parentId: row.parent_id === null ? null : String(row.parent_id),
    order: Number(row.section_order),
    sourceScanPage: Number(row.source_scan_page),
  })).sort((a, b) => stableStringCompare(a.id, b.id));
  const expectedParents = sources.thematicData.parents.map((parent) => ({
    id: parent.id,
    language: parent.language,
    title: parent.title,
    parentId: parent.parentId,
    order: parent.order,
    sourceScanPage: parent.sourcePage.scanPage,
  })).sort((a, b) => stableStringCompare(a.id, b.id));
  assertSameJson(actualParents, expectedParents);

  const actualSections = (await pool.query(`
    select id, theme_key, language, title, parent_id, section_order, source_scan_page, source_printed_page
    from reference_thematic_sections
  `)).rows.map((row) => ({
    id: String(row.id),
    themeKey: String(row.theme_key),
    language: String(row.language),
    title: String(row.title),
    parentId: String(row.parent_id),
    order: Number(row.section_order),
    sourceScanPage: Number(row.source_scan_page),
    sourcePrintedPage: Number(row.source_printed_page),
  })).sort((a, b) => stableStringCompare(a.id, b.id));
  const expectedSections = sources.thematicData.sections.map((section) => ({
    id: section.id,
    themeKey: section.themeKey,
    language: section.language,
    title: section.title,
    parentId: section.parentId,
    order: section.order,
    sourceScanPage: section.sourcePage.scanPage,
    sourcePrintedPage: section.sourcePage.printedPage,
  })).sort((a, b) => stableStringCompare(a.id, b.id));
  assertSameJson(actualSections, expectedSections);

  const actualRanges = (await pool.query(`
    select section_id, range_order, from_number, to_number
    from reference_thematic_ranges
  `)).rows.map((row) => ({
    sectionId: String(row.section_id),
    rangeOrder: Number(row.range_order),
    from: Number(row.from_number),
    to: Number(row.to_number),
  })).sort((a, b) => stableStringCompare(a.sectionId, b.sectionId) || a.rangeOrder - b.rangeOrder);
  const expectedRanges = sources.thematicData.sections.flatMap((section) =>
    section.ranges.map((range, index) => ({
      sectionId: section.id,
      rangeOrder: index + 1,
      from: range.from,
      to: range.to,
    })),
  ).sort((a, b) => stableStringCompare(a.sectionId, b.sectionId) || a.rangeOrder - b.rangeOrder);
  assertSameJson(actualRanges, expectedRanges);
}

async function classifyTarget(pool: Pool): Promise<TargetState> {
  const boundary = await inspectProviderBoundary(pool);
  if (boundary.publicTables.length !== EXPECTED_PUBLIC_TABLES) {
    throw new Error(`Production reference synchronization requires the reviewed ${EXPECTED_PUBLIC_TABLES}-table Phase 31.38 schema.`);
  }
  if (boundary.neonAuthSchema || boundary.authenticatedRole || boundary.anonymousRole) {
    throw new Error("Production reference synchronization refuses a target with Neon Auth/Data API state.");
  }
  await assertReviewedConfig(pool);

  if (sameStrings(boundary.nonEmptyPublicTables, [CONFIG_TABLE])) return "baseline";
  if (sameStrings(boundary.nonEmptyPublicTables, FINAL_NON_EMPTY_TABLES)) {
    await assertExactFinalSnapshot(pool);
    return "final";
  }
  throw new Error("Production reference synchronization refuses unexpected or partially synchronized application data.");
}

async function validateAuthoritativeSources(): Promise<AuthoritativeSources> {
  try {
    const [catalogRecords, czechAntiphons, polishAntiphons, thematicData] = await Promise.all([
      loadAndValidateReferenceCatalog(),
      loadAndValidateReferenceAntiphons(),
      loadAndValidatePolishReferenceAntiphons(),
      loadAndValidateReferenceThematicSections(),
    ]);
    return { catalogRecords, czechAntiphons, polishAntiphons, thematicData };
  } catch {
    throw new Error("Authoritative reference source validation failed.");
  }
}

function safeFailure(error: unknown): string {
  if (error instanceof Error) {
    if (SAFE_FAILURES.has(error.message)) return error.message;
    const code = (error as DatabaseError).code;
    if (code && /^[0-9A-Z]{5}$/.test(code)) return `Database operation failed (${code}).`;
  }
  return "Production reference synchronization failed.";
}

async function main(): Promise<void> {
  let apply = false;
  let pool: Pool | undefined;
  try {
    apply = requestedApply();
    const directUrl = readDirectUrl();
    pool = new Pool({ connectionString: directUrl, max: 1 });

    const before = await classifyTarget(pool);
    const sources = await validateAuthoritativeSources();
    if (before === "final") await assertDatabaseMatchesAuthoritativeSources(pool, sources);

    if (!apply) {
      console.log("Production authoritative reference synchronization preflight: PASS");
      console.log(before === "baseline"
        ? `Phase 31.38 baseline and authoritative sources verified; no data was synchronized. Re-run with ${APPLY_FLAG} only at the authorized HUMAN checkpoint.`
        : "Exact Phase 31.39 reference snapshot already present; authoritative sources verified and no data was changed.");
      return;
    }

    await synchronizeReferenceCatalog(pool, { records: sources.catalogRecords });
    await synchronizeProductionReferenceAntiphons(pool, {
      czechRecords: sources.czechAntiphons,
      polishRecords: sources.polishAntiphons,
    });
    await synchronizeReferenceThematicSections(pool, { data: sources.thematicData });

    const after = await classifyTarget(pool);
    if (after !== "final") {
      throw new Error("Production reference synchronization did not produce the exact reviewed reference snapshot.");
    }
    await assertDatabaseMatchesAuthoritativeSources(pool, sources);

    console.log("Production authoritative reference synchronization: PASS");
    console.log("Reviewed reference catalog, melody singleton baseline, antiphons, and thematic sections synchronized through the direct/unpooled connection; operational/auth data remains excluded.");
  } catch (error) {
    console.error(apply ? "Production authoritative reference synchronization: FAIL" : "Production authoritative reference synchronization preflight: FAIL");
    console.error(safeFailure(error));
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }
}

void main();
