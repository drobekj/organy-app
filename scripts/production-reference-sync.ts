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

async function validateAuthoritativeSources() {
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

    if (!apply) {
      console.log("Production authoritative reference synchronization preflight: PASS");
      console.log(before === "baseline"
        ? `Phase 31.38 baseline and authoritative sources verified; no data was synchronized. Re-run with ${APPLY_FLAG} only at the authorized HUMAN checkpoint.`
        : `Exact Phase 31.39 reference snapshot already present; authoritative sources verified and no data was changed.`);
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
