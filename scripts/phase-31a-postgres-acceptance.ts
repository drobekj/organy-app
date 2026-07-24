import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { DrizzleCatalogRepository } from "../src/application/catalog";
import { importRealCatalog, importRealCatalogWithClient, loadFrozenCatalogs, getRealCatalogFingerprint } from "../src/application/real-catalog";
import { seedCatalog } from "../src/application/catalog-seed";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error("DATABASE_URL is required for Phase 31A PostgreSQL acceptance.");
  process.exit(1);
}

async function main() {
  const dbName = `organy_phase31a_${process.pid}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const adminUrl = withDatabase(baseUrl!, "postgres");
  const testUrl = withDatabase(baseUrl!, dbName);
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(`create database ${quoteIdent(dbName)}`);
    run("npm", ["run", "db:migrate"], { ...process.env, DATABASE_URL: testUrl });
    const pool = new Pool({ connectionString: testUrl });
    try {
      const songs = await loadFrozenCatalogs();
      await importRealCatalog(pool, songs);
      const first = await getRealCatalogFingerprint(pool);
      assertCounts(first, "first import");

      await importRealCatalog(pool, songs);
      const second = await getRealCatalogFingerprint(pool);
      if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("Second import changed the real catalog fingerprint.");

      const changed = songs.map((song) => song.number === "298" && song.language === "czech" ? { ...song, title: `${song.title} ACCEPTANCE`, sourceUrl: "https://example.com/phase31a-controlled-update" } : song);
      await importRealCatalog(pool, changed);
      const updatedRow = await pool.query("select song_id, title, source_url from catalog_songs where language = 'czech' and number = '298'");
      if (updatedRow.rows[0].song_id !== "real-czech-298" || updatedRow.rows[0].title !== "Otevři své srdce ACCEPTANCE" || updatedRow.rows[0].source_url !== "https://example.com/phase31a-controlled-update") throw new Error("Controlled update did not update in place.");
      await importRealCatalog(pool, songs);
      const restored = await getRealCatalogFingerprint(pool);
      assertCounts(restored, "restored import");

      const beforeRollback = await getRealCatalogFingerprint(pool);
      const client = await pool.connect();
      try {
        const invalid = songs.map((song) => song.language === "polish" && song.number === "955" ? { ...song, songId: "conflicting-song-id" } : song);
        await assertRejects(() => importRealCatalogWithClient(client, invalid), "conflicting song_id");
      } finally {
        client.release();
      }
      const afterRollback = await getRealCatalogFingerprint(pool);
      if (JSON.stringify(beforeRollback) !== JSON.stringify(afterRollback)) throw new Error("Failed import did not roll back to the original fingerprint.");

      await pool.query("insert into catalog_persons (id, display_name, active, priest, organist) values ('phase31a-dirty-person', 'Dirty Person', true, true, false)");
      await assertRejects(() => importRealCatalog(pool, songs), "dirty demo/synthetic");
      await pool.query("delete from catalog_persons where id = 'phase31a-dirty-person'");

      await assertSamples(pool);
      await assertOrderingAndSearch(pool);
      const smokeBefore = await getRealCatalogFingerprint(pool);
      await runSmokeIsolation(pool, testUrl);
      const smokeAfter = await getRealCatalogFingerprint(pool);
      if (JSON.stringify(smokeBefore) !== JSON.stringify(smokeAfter)) throw new Error("Smoke isolation changed acceptance fingerprint.");
      console.log(`Phase 31A PostgreSQL acceptance passed: first/second import stable, rollback/dirty refusal/samples/ordering/smoke isolation verified (${second.total} rows).`);
    } finally {
      await pool.end();
    }
  } finally {
    await admin.query(`drop database if exists ${quoteIdent(dbName)} with (force)`).catch(async () => admin.query(`drop database if exists ${quoteIdent(dbName)}`));
    await admin.end();
  }
}

async function runSmokeIsolation(pool: Pool, databaseUrl: string) {
  const before = await getRealCatalogFingerprint(pool);
  const client = await pool.connect();
  try {
    await client.query("begin");
    try {
      await seedCatalog(new DrizzleCatalogRepository(drizzle(client, { schema }) as never));
      await seedDemoInteractionKnowledge(client as never);
      throw new Error("rollback-smoke-isolation");
    } catch (error) {
      await client.query("rollback");
      if (!(error instanceof Error) || error.message !== "rollback-smoke-isolation") throw error;
    }
  } finally {
    client.release();
  }
  const afterTransaction = await getRealCatalogFingerprint(pool);
  if (JSON.stringify(before) !== JSON.stringify(afterTransaction)) throw new Error("Transaction-scoped smoke isolation changed the acceptance fingerprint.");
  run("npm", ["run", "db:verify:real-catalog"], { ...process.env, DATABASE_URL: databaseUrl });
}

async function assertSamples(pool: Pool) {
  const samples = await pool.query("select language, number, title, source_url, sheet_music_url from catalog_songs where (language = 'czech' and number in ('298', '5210')) or (language = 'polish' and number in ('955', '3478')) order by language, number::int");
  const byKey = new Map(samples.rows.map((row) => [`${row.language}:${row.number}`, row]));
  if (byKey.get("czech:298")?.title !== "Otevři své srdce" || byKey.get("czech:298")?.source_url !== "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce") throw new Error("Czech 298 sample failed.");
  if (byKey.get("polish:955")?.title !== "Żegnamy was w Bogu naszym" || byKey.get("polish:955")?.source_url !== "https://hymnary.org/hymn/SE2002/955") throw new Error("Polish 955 sample failed.");
  if (!byKey.get("czech:5210") || !byKey.get("polish:3478")) throw new Error("Encoded variant sample rows missing.");
  if (samples.rows.some((row) => row.sheet_music_url !== null)) throw new Error("Real catalog must not use sheet_music_url for source URLs.");
}

async function assertOrderingAndSearch(pool: Pool) {
  const numeric = await pool.query("select number from catalog_songs where language = 'czech' order by number::int limit 12");
  if (numeric.rows.map((row) => row.number).join(",") !== "1,2,3,4,5,6,7,8,9,10,11,12") throw new Error("Catalog DB ordering is not numeric.");
  const slash = await pool.query("select number from catalog_songs where language = 'czech' and number = $1", ["5210"]);
  if (slash.rows.length !== 1) throw new Error("Stored slash-search target not found by encoded number.");
}

function assertCounts(fingerprint: { total: number; czech: number; polish: number }, label: string) {
  if (fingerprint.total !== 1798 || fingerprint.czech !== 808 || fingerprint.polish !== 990) throw new Error(`${label} count mismatch: ${JSON.stringify(fingerprint)}`);
}

async function assertRejects(action: () => Promise<unknown>, expectedMessage: string) {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw error;
  }
  throw new Error(`Expected rejection containing ${expectedMessage}.`);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32", env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}.`);
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

main().catch((error) => { console.error(error); process.exit(1); });
