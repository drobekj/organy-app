import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { MemoryReferenceAntiphonProvider } from "../src/application/reference-antiphon";
import { PostgresReferenceAntiphonProvider } from "../src/application/postgres-reference-antiphon";
import { loadAndValidatePolishReferenceAntiphons, loadAndValidateReferenceAntiphons, synchronizeProductionReferenceAntiphons } from "../src/application/reference-antiphon-sync";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

const PASS = "Phase 31.19 Polish production antiphon catalog: PASS";
const POLISH_HASH = "47bb3ff692feeea98e66d118ae115b0505ba7132c9bd0848a0aa8c42fb35bab0";
const run = (name: string, url: string) => new Promise<void>((resolve, reject) => {
  const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  const processHandle = spawn(invocation.command, invocation.args, { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
  processHandle.on("error", reject);
  processHandle.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed`)));
});

async function verifySource() {
  const bytes = await readFile("data/catalog/catalog-polish-antiphons.json");
  const normalized = bytes.toString("utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(normalized).digest("hex"), POLISH_HASH);
  const attributes = await readFile(".gitattributes", "utf8");
  assert.ok(attributes.split(/\r?\n/).includes("data/catalog/catalog-polish-antiphons.json text eol=lf"));
  const records = await loadAndValidatePolishReferenceAntiphons();
  assert.equal(records.length, 116);
  assert.deepEqual(records.map((record) => record.canonicalNumber), Array.from({ length: 116 }, (_, index) => index + 1));
  assert.deepEqual(records.map((record) => record.id), Array.from({ length: 116 }, (_, index) => `polish:${index + 1}`));
  assert.ok(records.every((record) => record.language === "polish" && record.sourceUrl === null && record.title.length > 0 && record.title === record.title.trim()));
  assert.deepEqual([records[0].title, records[43].title, records.at(-1)?.title], ["Wspomożenie nasze", "Wielkanoc – Rezurekcja / Nabożeństwo główne", "Nabożeństwo Pogrzebowe"]);
  const directory = await mkdtemp(join(tmpdir(), "organy-polish-antiphons-"));
  try {
    const crlfPath = join(directory, "catalog-crlf.json");
    await writeFile(crlfPath, normalized.replace(/\n/g, "\r\n"));
    assert.deepEqual(await loadAndValidatePolishReferenceAntiphons(crlfPath), records);
    const mutatedPath = join(directory, "catalog-mutated.json");
    await writeFile(mutatedPath, normalized.replace("Wspomożenie nasze", "Zmienione"));
    await assert.rejects(() => loadAndValidatePolishReferenceAntiphons(mutatedPath), /SHA-256 mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return records;
}

async function verifyMemory() {
  const provider = new MemoryReferenceAntiphonProvider();
  const polish = await provider.list({ language: "polish", pageSize: 200 });
  assert.deepEqual(polish.counts, { all: 232, czech: 116, polish: 116 });
  assert.equal(polish.total, 116);
  assert.deepEqual([polish.records[0].id, polish.records.at(-1)?.id], ["polish:1", "polish:116"]);
  assert.ok(polish.records.every((record) => record.language === "polish" && record.sourceUrl === undefined));
  const all = await provider.list({ language: "all", pageSize: 300 });
  assert.equal(all.records.length, 232);
  assert.deepEqual([all.records[0].id, all.records[115].id, all.records[116].id, all.records.at(-1)?.id], ["czech:800", "czech:915", "polish:1", "polish:116"]);
  assert.deepEqual((await provider.list({ language: "polish", search: "POGRZEBOWE", pageSize: 200 })).records.map((record) => record.id), ["polish:116"]);
  assert.deepEqual((await provider.list({ language: "polish", search: "11", pageSize: 200 })).records.map((record) => record.id), ["polish:11", "polish:110", "polish:111", "polish:112", "polish:113", "polish:114", "polish:115", "polish:116"]);
  assert.equal((await provider.getById("polish:44"))?.title, "Wielkanoc – Rezurekcja / Nabożeństwo główne");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.19 verification.");
  const polishRecords = await verifySource();
  await verifyMemory();
  const czechRecords = await loadAndValidateReferenceAntiphons();
  const syncScript = await readFile("scripts/db-sync-reference-antiphons.ts", "utf8");
  assert.match(syncScript, /synchronizeProductionReferenceAntiphons/);
  const guard = parseGuardDatabaseUrl(process.env.DATABASE_URL);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const name = generateE1DatabaseName();
  const url = deriveDatabaseUrl(guard, name);
  await control.query(createDatabaseSql(name));
  try {
    await withCleanup(async () => {
      await run("db:migrate", url);
      await run("db:migrate", url);
      const pool = new Pool({ connectionString: url });
      try {
        assert.deepEqual(await synchronizeProductionReferenceAntiphons(pool), { czech: 116, polish: 116, total: 232 });
        const snapshot = JSON.stringify((await pool.query("select id,language,canonical_number,title,source_url from reference_antiphons order by language,canonical_number")).rows);
        assert.deepEqual(await synchronizeProductionReferenceAntiphons(pool), { czech: 116, polish: 116, total: 232 });
        assert.equal(JSON.stringify((await pool.query("select id,language,canonical_number,title,source_url from reference_antiphons order by language,canonical_number")).rows), snapshot);
        const sourceCounts = (await pool.query("select count(*)::int total,count(*) filter(where language='polish' and source_url is null)::int polish_null,count(*) filter(where language='czech' and source_url is not null)::int czech_source from reference_antiphons")).rows[0];
        assert.deepEqual({ total: Number(sourceCounts.total), polishNull: Number(sourceCounts.polish_null), czechSource: Number(sourceCounts.czech_source) }, { total: 232, polishNull: 116, czechSource: 116 });
        await pool.query("insert into reference_antiphons(id,language,canonical_number,title,source_url) values('polish:999','polish',999,'Stale Polish',null)");
        await synchronizeProductionReferenceAntiphons(pool);
        assert.equal(Number((await pool.query("select count(*) n from reference_antiphons where id='polish:999'")).rows[0].n), 0);
        await pool.query("update reference_antiphons set title='DB-only title' where id='polish:44'");
        await synchronizeProductionReferenceAntiphons(pool);
        assert.equal((await pool.query("select title from reference_antiphons where id='polish:44'")).rows[0].title, "Wielkanoc – Rezurekcja / Nabożeństwo główne");
        assert.equal(Number((await pool.query("select count(*) n from reference_antiphon_recommendations where antiphon_id like 'polish:%'")).rows[0].n), 0);
        const provider = new PostgresReferenceAntiphonProvider(pool);
        const polish = await provider.list({ language: "polish", pageSize: 200 });
        assert.equal(polish.total, 116);
        assert.deepEqual([polish.records[0].id, polish.records.at(-1)?.id], ["polish:1", "polish:116"]);
        const all = await provider.list({ language: "all", pageSize: 300 });
        assert.deepEqual(all.counts, { all: 232, czech: 116, polish: 116 });
        assert.deepEqual([all.records[115].id, all.records[116].id], ["czech:915", "polish:1"]);
        assert.deepEqual((await provider.list({ language: "polish", search: "pogrzebowe", pageSize: 200 })).records.map((record) => record.id), ["polish:116"]);
        const rollbackSnapshot = JSON.stringify((await pool.query("select id,language,canonical_number,title,source_url from reference_antiphons order by language,canonical_number")).rows);
        await assert.rejects(() => synchronizeProductionReferenceAntiphons(pool, { czechRecords, polishRecords: polishRecords.map((record, index) => index === 0 ? { ...record, title: "Temporary valid title" } : record), failBeforeCommit: true }));
        assert.equal(JSON.stringify((await pool.query("select id,language,canonical_number,title,source_url from reference_antiphons order by language,canonical_number")).rows), rollbackSnapshot);
      } finally {
        await pool.end();
      }
    }, async () => {
      const [terminate, drop] = dropDatabaseSql(name);
      await control.query(terminate, [name]);
      await control.query(drop);
    });
    console.log(PASS);
  } finally {
    await control.end();
  }
}

void main().catch((error) => {
  console.error("Phase 31.19 Polish production antiphon catalog: FAIL");
  console.error(error);
  process.exitCode = 1;
});
