import { Pool } from "pg";
import { assertCleanOperationalState, catalogFingerprint, validateFrozenArtifacts } from "../src/application/real-catalog-import";
async function one(pool: Pool, sql: string) { const r = await pool.query(sql); return Number(r.rows[0].count); }
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for read-only real catalog verification.");
  await validateFrozenArtifacts();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("begin transaction read only");
    await assertCleanOperationalState(pool);
    const checks: [string, boolean][] = [];
    checks.push(["Czech count", await one(pool, "select count(*)::int as count from catalog_songs where language='czech'") === 808]);
    checks.push(["Polish count", await one(pool, "select count(*)::int as count from catalog_songs where language='polish'") === 990]);
    checks.push(["total count", await one(pool, "select count(*)::int as count from catalog_songs") === 1798]);
    checks.push(["duplicate keys", await one(pool, "select count(*)::int as count from (select language, number from catalog_songs group by language, number having count(*) > 1) d") === 0]);
    checks.push(["empty titles", await one(pool, "select count(*)::int as count from catalog_songs where btrim(title) = ''") === 0]);
    checks.push(["numeric ordering", await one(pool, "select count(*)::int as count from catalog_songs where number !~ '^[0-9]+$'") === 0]);
    checks.push(["Polish URLs", await one(pool, "select count(*)::int as count from catalog_songs where language='polish' and source_url is not null") === 990]);
    checks.push(["Czech null URLs", await one(pool, "select count(*)::int as count from catalog_songs where language='czech' and source_url is null") === 7]);
    checks.push(["no source in sheet_music_url", await one(pool, "select count(*)::int as count from catalog_songs where sheet_music_url is not null") === 0]);
    checks.push(["encoded rows", await one(pool, "select count(*)::int as count from catalog_songs where (language='czech' and number='5210') or (language='polish' and number='3478')") === 2]);
    const samples = await pool.query("select language::text, number, title, source_url from catalog_songs where (language='czech' and number='298') or (language='polish' and number='955') order by language");
    checks.push(["samples", samples.rows.some(r => r.language === 'czech' && r.number === '298' && r.title === 'Otevři své srdce' && r.source_url === 'https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce') && samples.rows.some(r => r.language === 'polish' && r.number === '955' && r.title === 'Żegnamy was w Bogu naszym' && r.source_url === 'https://hymnary.org/hymn/SE2002/955')]);
    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Read-only real catalog verification failed: ${failed.join(', ')}`);
    const fingerprint = await catalogFingerprint(pool);
    await pool.query("rollback");
    console.log(`Read-only real catalog verification passed: Czech=808 Polish=990 total=1798 fingerprint=${fingerprint}`);
  } catch (e) { await pool.query("rollback"); throw e; } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
