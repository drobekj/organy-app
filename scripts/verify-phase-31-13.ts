import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { MemoryReferenceThematicSectionProvider } from "../src/application/reference-thematic-section";
import { PostgresReferenceThematicSectionProvider } from "../src/application/postgres-reference-thematic-section";
import {
  loadAndValidateReferenceThematicSections,
  synchronizeReferenceThematicSections,
  validateReferenceThematicCatalogs,
} from "../src/application/reference-thematic-section-sync";
import type { ReferenceThematicCatalog } from "../src/application/reference-thematic-section-contract";
import {
  createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl,
  dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup,
} from "./engineering-e1-core";

const CZECH_SHA = "3f6fe7ff83204436fc6e6cdd7de8e9e7f52c73941204b9543379d707a7c08e76";
const POLISH_SHA = "7e0b26f6bacceb0aa754166f4630e03a26098827feb7a0ed48909bbe9c9b6919";

function runNpm(name: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const call = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
    const child = spawn(call.command, call.args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} exited with ${code ?? 1}.`)));
  });
}

async function fingerprint(pool: Pool): Promise<string> {
  const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => String(row.tablename));
  const result: Array<[string, unknown[]]> = [];
  for (const table of tables) {
    const quoted = table.replaceAll('"', '""');
    result.push([table, (await pool.query(`select * from public."${quoted}" order by 1`)).rows]);
  }
  return JSON.stringify(result);
}

async function unrelatedSnapshot(pool: Pool): Promise<string> {
  const tables = [
    "reference_catalog_songs", "reference_antiphons", "reference_antiphon_recommendations",
    "reference_melody_classes", "reference_song_melody_memberships",
    "reference_song_preferences", "reference_organist_repertoire",
    "service_contexts", "service_sets", "service_set_rows",
    "completed_services", "completed_service_rows",
  ];
  return JSON.stringify(await Promise.all(tables.map(async (table) => [table, (await pool.query(`select * from ${table} order by 1`)).rows])));
}

function clone(catalogs: ReferenceThematicCatalog[]): ReferenceThematicCatalog[] {
  return structuredClone(catalogs);
}

async function verifyFrozenData() {
  const czech = (await readFile("data/catalog/catalog-czech-thematic-sections.json", "utf8")).replace(/\r\n/g, "\n");
  const polish = (await readFile("data/catalog/catalog-polish-thematic-sections.json", "utf8")).replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(czech).digest("hex"), CZECH_SHA);
  assert.equal(createHash("sha256").update(polish).digest("hex"), POLISH_SHA);
  const attributes = (await readFile(".gitattributes", "utf8")).split(/\r?\n/);
  assert.ok(attributes.includes("data/catalog/catalog-czech-thematic-sections.json text eol=lf"));
  assert.ok(attributes.includes("data/catalog/catalog-polish-thematic-sections.json text eol=lf"));

  const data = await loadAndValidateReferenceThematicSections();
  assert.deepEqual(data.catalogs.map((catalog) => [catalog.language, catalog.parents.length, catalog.sections.length]), [
    ["czech", 3, 35], ["polish", 3, 36],
  ]);
  assert.deepEqual(data.gaps, []);
  const czechSections = data.sections.filter((section) => section.language === "czech");
  const polishSections = data.sections.filter((section) => section.language === "polish");
  assert.deepEqual([czechSections[0].ranges[0], czechSections.at(-1)!.ranges[0]], [{ from: 1, to: 29 }, { from: 738, to: 799 }]);
  assert.deepEqual([polishSections[0].ranges[0], polishSections.at(-1)!.ranges[0]], [{ from: 1, to: 30 }, { from: 901, to: 955 }]);
  assert.equal(czechSections[31].title, "Péče o stvoření, mír a vlast");
  assert.equal(polishSections[31].title, "Miłość bliźniego");
  assert.equal(polishSections[31].themeKey, "faith-love-hope.neighbor-love");
  assert.equal(czechSections.some((section) => section.themeKey === "faith-love-hope.neighbor-love"), false);

  const directory = await mkdtemp(join(tmpdir(), "organy-thematic-"));
  try {
    const czechCrlf = join(directory, "czech.json");
    const polishCrlf = join(directory, "polish.json");
    await writeFile(czechCrlf, czech.replace(/\n/g, "\r\n"));
    await writeFile(polishCrlf, polish.replace(/\n/g, "\r\n"));
    assert.deepEqual(await loadAndValidateReferenceThematicSections({ czech: czechCrlf, polish: polishCrlf }), data);
    const mutated = join(directory, "mutated.json");
    await writeFile(mutated, czech.replace('"Advent"', '"Mutated Advent"'));
    await assert.rejects(() => loadAndValidateReferenceThematicSections({ czech: mutated }), /SHA-256 mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const gap = clone(data.catalogs);
  gap[0].sections[0].ranges[0].to = 28;
  assert.deepEqual(validateReferenceThematicCatalogs(gap).gaps, [{ language: "czech", after: 28, before: 30 }]);
  const overlap = clone(data.catalogs);
  overlap[0].sections[1].ranges[0].from = 29;
  assert.throws(() => validateReferenceThematicCatalogs(overlap), /Overlapping thematic ranges/);
  const duplicateOrder = clone(data.catalogs);
  duplicateOrder[0].sections[1].order = 1;
  assert.throws(() => validateReferenceThematicCatalogs(duplicateOrder), /Duplicate thematic section order/);
  const missingParent = clone(data.catalogs);
  missingParent[0].sections[0].parentId = "czech:missing";
  assert.throws(() => validateReferenceThematicCatalogs(missingParent), /Unknown thematic parent/);
  const cycle = clone(data.catalogs);
  cycle[0].parents[0].parentId = cycle[0].parents[1].id;
  cycle[0].parents[1].parentId = cycle[0].parents[0].id;
  assert.throws(() => validateReferenceThematicCatalogs(cycle), /cycle/);
  const unpaired = clone(data.catalogs);
  unpaired[1].sections[0].themeKey = "church-year.unpaired";
  assert.throws(() => validateReferenceThematicCatalogs(unpaired), /Invalid bilingual thematic pairing/);
  const invalidLanguage = clone(data.catalogs) as unknown as Array<Record<string, unknown>>;
  invalidLanguage[0].language = "mixed";
  assert.throws(() => validateReferenceThematicCatalogs(invalidLanguage), /language is invalid/);
  return data;
}

async function verifyProviders(pool: Pool, data: Awaited<ReturnType<typeof loadAndValidateReferenceThematicSections>>) {
  const memory = new MemoryReferenceThematicSectionProvider(data.sections);
  const postgres = new PostgresReferenceThematicSectionProvider(pool);
  assert.deepEqual([(await memory.listSections("czech")).length, (await memory.listSections("polish")).length], [35, 36]);
  assert.deepEqual([(await postgres.listSections("czech")).length, (await postgres.listSections("polish")).length], [35, 36]);
  await assert.rejects(() => memory.listSections("mixed" as never), /language is invalid/);
  await assert.rejects(() => postgres.listSections("mixed" as never), /language is invalid/);

  for (const provider of [memory, postgres]) {
    assert.equal((await provider.resolveSection("czech", 1))?.id, "czech:church-year:advent");
    assert.equal((await provider.resolveSection("czech", 29))?.id, "czech:church-year:advent");
    assert.equal((await provider.resolveSection("czech", 30))?.id, "czech:church-year:nativity");
    assert.equal((await provider.resolveSection("czech", 799))?.id, "czech:faith-love-hope:death-resurrection-eternal-life");
    assert.equal(await provider.resolveSection("czech", 800), undefined);
    assert.equal((await provider.resolveSection("polish", 955))?.id, "polish:faith-love-hope:death-resurrection-eternal-life");
    assert.equal(await provider.resolveSection("polish", 956), undefined);
    assert.equal((await provider.resolveSection("czech", 5210))?.themeKey, "church-year.nativity");
    assert.equal((await provider.resolveSection("polish", 5210))?.themeKey, "church-year.nativity");
    assert.equal((await provider.resolveSection("czech", 30))?.themeKey, "church-year.nativity");
    assert.equal((await provider.resolveSection("polish", 30))?.themeKey, "church-year.advent");
    assert.equal((await provider.resolveSection("czech", 700))?.themeKey, "faith-love-hope.creation-peace-homeland");
    assert.equal((await provider.resolveSection("polish", 850))?.themeKey, "faith-love-hope.creation-peace-homeland");
    assert.equal((await provider.resolveSection("polish", 830))?.themeKey, "faith-love-hope.neighbor-love");
    assert.equal(await provider.resolveSection("czech", 830), undefined);
  }
  await pool.query("update reference_thematic_sections set title='DB-only title' where id='czech:church-year:advent'");
  assert.equal((await postgres.getSectionById("czech:church-year:advent"))?.title, "DB-only title");
  assert.equal((await memory.getSectionById("czech:church-year:advent"))?.title, "Advent");
  await synchronizeReferenceThematicSections(pool);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.13 verification.");
  const data = await verifyFrozenData();
  const guardUrl = process.env.DATABASE_URL;
  const guard = parseGuardDatabaseUrl(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const guardPool = new Pool({ connectionString: guardUrl });
  const before = await fingerprint(guardPool);
  await guardPool.end();
  const databaseName = generateE1DatabaseName();
  const databaseUrl = deriveDatabaseUrl(guard, databaseName);
  await control.query(createDatabaseSql(databaseName));

  try {
    await withCleanup(async () => {
      await runNpm("db:migrate", databaseUrl);
      await runNpm("db:migrate", databaseUrl);
      await runNpm("db:sync:reference-catalog", databaseUrl);
      await runNpm("db:sync:reference-antiphons", databaseUrl);
      const pool = new Pool({ connectionString: databaseUrl });
      try {
        const tables = (await pool.query("select table_name from information_schema.tables where table_schema='public' and table_name like 'reference_thematic_%' order by table_name")).rows.map((row) => row.table_name);
        assert.deepEqual(tables, ["reference_thematic_parents", "reference_thematic_ranges", "reference_thematic_sections"]);
        const checks = (await pool.query("select conname from pg_constraint where conrelid='public.reference_thematic_ranges'::regclass and contype='c' order by conname")).rows.map((row) => row.conname);
        assert.deepEqual(checks, ["reference_thematic_ranges_from_positive", "reference_thematic_ranges_order_positive", "reference_thematic_ranges_ordered", "reference_thematic_ranges_to_positive"]);

        const unrelatedBefore = await unrelatedSnapshot(pool);
        assert.deepEqual(await synchronizeReferenceThematicSections(pool), { parents: 6, sections: 71, ranges: 71 });
        const snapshot = JSON.stringify(await Promise.all([
          pool.query("select * from reference_thematic_parents order by language,section_order"),
          pool.query("select * from reference_thematic_sections order by language,section_order"),
          pool.query("select * from reference_thematic_ranges order by section_id,range_order"),
        ]).then((results) => results.map((result) => result.rows)));
        assert.deepEqual(await synchronizeReferenceThematicSections(pool), { parents: 6, sections: 71, ranges: 71 });
        const repeated = JSON.stringify(await Promise.all([
          pool.query("select * from reference_thematic_parents order by language,section_order"),
          pool.query("select * from reference_thematic_sections order by language,section_order"),
          pool.query("select * from reference_thematic_ranges order by section_id,range_order"),
        ]).then((results) => results.map((result) => result.rows)));
        assert.equal(repeated, snapshot);
        assert.equal(await unrelatedSnapshot(pool), unrelatedBefore);

        await pool.query("create table phase_31_13_scope_guard(id integer primary key); insert into phase_31_13_scope_guard values(1)");
        await pool.query("insert into reference_thematic_parents values('czech:stale-parent','czech','Stale',null,99,1)");
        await pool.query("insert into reference_thematic_sections values('czech:stale-section','stale.theme','czech','Stale','czech:stale-parent',99,1,1)");
        await pool.query("insert into reference_thematic_ranges values('czech:stale-section',1,999,999)");
        await synchronizeReferenceThematicSections(pool);
        assert.equal((await pool.query("select count(*)::int n from reference_thematic_parents where id='czech:stale-parent'")).rows[0].n, 0);
        assert.equal((await pool.query("select count(*)::int n from phase_31_13_scope_guard")).rows[0].n, 1);

        const rollbackBefore = JSON.stringify((await pool.query("select * from reference_thematic_sections order by id")).rows);
        const changed = clone(data.catalogs);
        changed[0].sections[0].title = "Must roll back";
        await assert.rejects(() => synchronizeReferenceThematicSections(pool, {
          data: validateReferenceThematicCatalogs(changed, { enforceFrozenShape: true }),
          failBeforeCommit: true,
        }), /Injected thematic-section synchronization failure/);
        assert.equal(JSON.stringify((await pool.query("select * from reference_thematic_sections order by id")).rows), rollbackBefore);
        await verifyProviders(pool, data);
        assert.equal(await unrelatedSnapshot(pool), unrelatedBefore);
      } finally {
        await pool.end();
      }
    }, async () => {
      const [terminate, drop] = dropDatabaseSql(databaseName);
      await control.query(terminate, [databaseName]);
      await control.query(drop);
    });
    assert.equal((await control.query("select 1 from pg_database where datname=$1", [databaseName])).rows.length, 0);
    const afterPool = new Pool({ connectionString: guardUrl });
    try { assert.equal(await fingerprint(afterPool), before); } finally { await afterPool.end(); }
    console.log("Phase 31.13 authoritative bilingual thematic-section knowledge: PASS");
  } finally {
    await control.end();
  }
}

void main().catch((error: unknown) => {
  console.error("Phase 31.13 authoritative bilingual thematic-section knowledge: FAIL");
  console.error(error);
  process.exitCode = 1;
});
