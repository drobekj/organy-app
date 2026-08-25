import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";

const SCRIPT = "scripts/production-reference-sync.ts";
const MIGRATION_SCRIPT = "scripts/production-first-migrate.ts";
const LOCAL_DIRECT_URL = process.env.DATABASE_URL_UNPOOLED;
const SENSITIVE_POOLED_URL = "postgres://private-user:private-password@private-pooler.example.test/private-db";
const CONFIG_TABLE = "melody_non_repetition_config";
const EXPECTED_PUBLIC_TABLES = [
  "antiphon_mappings",
  "app_user_roles",
  "app_users",
  "audit_events",
  "auth_accounts",
  "auth_sessions",
  "auth_users",
  "auth_verifications",
  "catalog_persons",
  "catalog_songs",
  "completed_service_rows",
  "completed_services",
  "liturgical_season_mappings",
  "melody_equivalence_classes",
  "melody_non_repetition_config",
  "organist_repertoire",
  "preference_profiles",
  "protected_account_actor_links",
  "reference_antiphon_recommendations",
  "reference_antiphons",
  "reference_catalog_songs",
  "reference_melody_classes",
  "reference_organist_repertoire",
  "reference_song_melody_memberships",
  "reference_song_preferences",
  "reference_thematic_parents",
  "reference_thematic_ranges",
  "reference_thematic_sections",
  "service_contexts",
  "service_set_rows",
  "service_sets",
  "song_melody_equivalence",
  "song_preferences",
].sort();
const EXPECTED_NON_EMPTY = [
  CONFIG_TABLE,
  "reference_antiphons",
  "reference_catalog_songs",
  "reference_melody_classes",
  "reference_song_melody_memberships",
  "reference_thematic_parents",
  "reference_thematic_ranges",
  "reference_thematic_sections",
].sort();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(script: string, args: string[], directUrl: string | undefined, locale?: string) {
  const env = { ...process.env };
  delete env.BETTER_AUTH_URL;
  if (directUrl === undefined) delete env.DATABASE_URL_UNPOOLED;
  else env.DATABASE_URL_UNPOOLED = directUrl;
  if (locale) {
    env.LANG = locale;
    env.LC_ALL = locale;
  }
  return spawnSync(npx, ["tsx", script, ...args], { encoding: "utf8", env });
}

function output(result: ReturnType<typeof run>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function redactedOutput(result: ReturnType<typeof run>, urlText: string): string {
  let redacted = output(result).replaceAll(urlText, "<redacted-url>");
  try {
    const url = new URL(urlText);
    for (const value of [url.username, url.password, url.hostname]) {
      if (value) redacted = redacted.replaceAll(value, "<redacted>");
    }
  } catch {
    return "<redacted diagnostic unavailable>";
  }
  return redacted.trim();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function publicTables(pool: Pool): Promise<string[]> {
  return (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename"))
    .rows.map((row) => String(row.tablename));
}

async function nonEmptyPublicTables(pool: Pool): Promise<string[]> {
  const result: string[] = [];
  for (const table of await publicTables(pool)) {
    const count = await pool.query(`select count(*)::int as n from public.${quoteIdentifier(table)}`);
    if (Number(count.rows[0]?.n ?? 0) !== 0) result.push(table);
  }
  return result;
}

async function exactSnapshot(pool: Pool) {
  const catalog = (await pool.query(`select count(*)::int total,
    count(*) filter(where language='czech')::int czech,
    count(*) filter(where language='polish')::int polish from reference_catalog_songs`)).rows[0];
  const melody = (await pool.query(`select
    (select count(*)::int from reference_melody_classes) classes,
    (select count(*)::int from reference_song_melody_memberships) memberships,
    (select count(*)::int from reference_song_melody_memberships m join reference_catalog_songs s on s.id=m.reference_song_id where m.class_id <> 'reference-melody:'||s.id) non_singleton`)).rows[0];
  const antiphons = (await pool.query(`select count(*)::int total,
    count(*) filter(where language='czech')::int czech,
    count(*) filter(where language='polish')::int polish from reference_antiphons`)).rows[0];
  const thematic = (await pool.query(`select
    (select count(*)::int from reference_thematic_parents) parents,
    (select count(*)::int from reference_thematic_sections) sections,
    (select count(*)::int from reference_thematic_sections where language='czech') czech_sections,
    (select count(*)::int from reference_thematic_sections where language='polish') polish_sections,
    (select count(*)::int from reference_thematic_ranges) ranges`)).rows[0];
  return {
    catalog: { total: Number(catalog.total), czech: Number(catalog.czech), polish: Number(catalog.polish) },
    melody: { classes: Number(melody.classes), memberships: Number(melody.memberships), nonSingleton: Number(melody.non_singleton) },
    antiphons: { total: Number(antiphons.total), czech: Number(antiphons.czech), polish: Number(antiphons.polish) },
    thematic: {
      parents: Number(thematic.parents), sections: Number(thematic.sections),
      czechSections: Number(thematic.czech_sections), polishSections: Number(thematic.polish_sections), ranges: Number(thematic.ranges),
    },
  };
}

async function main(): Promise<void> {
  assert.ok(LOCAL_DIRECT_URL, "Phase 31.39 acceptance requires DATABASE_URL_UNPOOLED for disposable PostgreSQL.");

  const source = readFileSync(SCRIPT, "utf8");
  assert.ok(source.includes("DATABASE_URL_UNPOOLED"));
  assert.ok(source.includes("--apply"));
  assert.ok(source.includes("direct/unpooled"));
  assert.ok(source.includes("synchronizeReferenceCatalog"));
  assert.ok(source.includes("synchronizeProductionReferenceAntiphons"));
  assert.ok(source.includes("synchronizeReferenceThematicSections"));
  assert.ok(source.includes("loadAndValidateReferenceCatalog"));
  assert.ok(source.includes("loadAndValidateReferenceAntiphons"));
  assert.ok(source.includes("loadAndValidatePolishReferenceAntiphons"));
  assert.ok(source.includes("loadAndValidateReferenceThematicSections"));
  assert.ok(source.includes("stableStringCompare"));
  assert.ok(!source.includes(".localeCompare("), "production snapshot comparison must not depend on host locale");
  assert.ok(!source.includes("BETTER_AUTH_URL"), "reference-data operator must not depend on deferred BETTER_AUTH_URL");
  assert.ok(!source.includes("db:bootstrap:auth"));
  assert.ok(!source.includes("db:seed"));

  const missing = run(SCRIPT, [], undefined);
  assert.notEqual(missing.status, 0);
  assert.match(output(missing), /DATABASE_URL_UNPOOLED/);

  const pooled = run(SCRIPT, [], SENSITIVE_POOLED_URL);
  assert.notEqual(pooled.status, 0);
  assert.match(output(pooled), /direct\/unpooled/);
  assert.ok(!output(pooled).includes(SENSITIVE_POOLED_URL));
  assert.ok(!output(pooled).includes("private-password"));
  assert.ok(!output(pooled).includes("private-pooler.example.test"));

  const pool = new Pool({ connectionString: LOCAL_DIRECT_URL });
  try {
    assert.deepEqual(await publicTables(pool), [], "disposable Phase 31.39 target must start empty before Phase 31.38 setup");

    const migration = run(MIGRATION_SCRIPT, ["--apply"], LOCAL_DIRECT_URL);
    assert.equal(migration.status, 0, `Phase 31.38 schema setup must pass: ${redactedOutput(migration, LOCAL_DIRECT_URL)}`);
    assert.deepEqual(await publicTables(pool), EXPECTED_PUBLIC_TABLES, "Phase 31.39 must start from the exact reviewed 33-table schema including audit_events");
    assert.deepEqual(await nonEmptyPublicTables(pool), [CONFIG_TABLE]);

    const preflight = run(SCRIPT, [], LOCAL_DIRECT_URL);
    assert.equal(preflight.status, 0, `read-only Phase 31.39 preflight must pass: ${redactedOutput(preflight, LOCAL_DIRECT_URL)}`);
    assert.match(preflight.stdout, /preflight: PASS/);
    assert.match(preflight.stdout, /no data was synchronized/);
    assert.ok(!output(preflight).includes(LOCAL_DIRECT_URL));
    assert.deepEqual(await nonEmptyPublicTables(pool), [CONFIG_TABLE], "preflight must not write reference data");

    await pool.query("insert into app_users(id, display_name) values ('unexpected-phase-31-39-user','Unexpected')");
    const contaminated = run(SCRIPT, [], LOCAL_DIRECT_URL);
    assert.notEqual(contaminated.status, 0, "preflight must reject unexpected application data");
    assert.match(output(contaminated), /unexpected or partially synchronized application data/);
    assert.ok(!output(contaminated).includes(LOCAL_DIRECT_URL));
    await pool.query("delete from app_users where id='unexpected-phase-31-39-user'");

    const apply = run(SCRIPT, ["--apply"], LOCAL_DIRECT_URL);
    assert.equal(apply.status, 0, `production reference synchronization must pass: ${redactedOutput(apply, LOCAL_DIRECT_URL)}`);
    assert.match(apply.stdout, /Production authoritative reference synchronization: PASS/);
    assert.ok(!output(apply).includes(LOCAL_DIRECT_URL));
    assert.deepEqual(await nonEmptyPublicTables(pool), EXPECTED_NON_EMPTY);
    assert.equal(Number((await pool.query("select count(*)::int n from audit_events")).rows[0].n), 0, "reference synchronization must never write audit_events");

    const expectedSnapshot = {
      catalog: { total: 1798, czech: 808, polish: 990 },
      melody: { classes: 1798, memberships: 1798, nonSingleton: 0 },
      antiphons: { total: 232, czech: 116, polish: 116 },
      thematic: { parents: 6, sections: 71, czechSections: 35, polishSections: 36, ranges: 71 },
    };
    assert.deepEqual(await exactSnapshot(pool), expectedSnapshot);

    const config = (await pool.query("select id, months from melody_non_repetition_config order by id")).rows;
    assert.deepEqual(config.map((row) => ({ id: String(row.id), months: Number(row.months) })), [{ id: "global", months: 2 }]);
    assert.equal(Number((await pool.query("select count(*)::int n from auth_users")).rows[0].n), 0);
    assert.equal(Number((await pool.query("select count(*)::int n from auth_accounts")).rows[0].n), 0);
    assert.equal(Number((await pool.query("select count(*)::int n from auth_sessions")).rows[0].n), 0);
    assert.equal(Number((await pool.query("select count(*)::int n from app_users")).rows[0].n), 0);
    assert.equal(Number((await pool.query("select count(*)::int n from app_user_roles")).rows[0].n), 0);
    assert.equal(Number((await pool.query("select count(*)::int n from service_contexts")).rows[0].n), 0);

    const finalPreflight = run(SCRIPT, [], LOCAL_DIRECT_URL, "cs_CZ.UTF-8");
    assert.equal(finalPreflight.status, 0, `Czech-locale final-state preflight must pass: ${redactedOutput(finalPreflight, LOCAL_DIRECT_URL)}`);
    assert.match(finalPreflight.stdout, /already present/);
    assert.deepEqual(await exactSnapshot(pool), expectedSnapshot);

    const repeated = run(SCRIPT, ["--apply"], LOCAL_DIRECT_URL);
    assert.equal(repeated.status, 0, `authorized synchronization rerun must be idempotent: ${redactedOutput(repeated, LOCAL_DIRECT_URL)}`);
    assert.deepEqual(await exactSnapshot(pool), expectedSnapshot);
    assert.deepEqual(await nonEmptyPublicTables(pool), EXPECTED_NON_EMPTY);
    assert.equal(Number((await pool.query("select count(*)::int n from audit_events")).rows[0].n), 0, "reference synchronization must never write audit_events");

    const providerState = (await pool.query(`select
      exists(select 1 from pg_namespace where nspname='neon_auth') neon_auth_schema,
      exists(select 1 from pg_roles where rolname='authenticated') authenticated_role,
      exists(select 1 from pg_roles where rolname='anonymous') anonymous_role`)).rows[0];
    assert.equal(Boolean(providerState.neon_auth_schema), false);
    assert.equal(Boolean(providerState.authenticated_role), false);
    assert.equal(Boolean(providerState.anonymous_role), false);
  } finally {
    await pool.end();
  }

  console.log("Phase 31.39 production authoritative reference-data synchronization boundary acceptance: PASS");
  console.log("The direct/unpooled operator validates the migrated baseline and frozen authoritative sources, synchronizes only deterministic reference knowledge, and is idempotent on the exact final snapshot.");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.39 production authoritative reference-data synchronization boundary acceptance: FAIL");
  if (error instanceof assert.AssertionError) console.error(error.message);
  else console.error("Unexpected acceptance failure.");
  process.exitCode = 1;
});
