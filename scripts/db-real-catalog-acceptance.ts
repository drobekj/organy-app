import { Pool } from "pg";
import { importRealCatalog, catalogFingerprint, assertNoDirtyCatalogState } from "../src/application/real-catalog-import";

async function scalar(pool: Pool, sql: string) { const r = await pool.query(sql); return Number(r.rows[0].count); }
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for real catalog acceptance.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("delete from catalog_songs");
    const first = await importRealCatalog(pool);
    const second = await importRealCatalog(pool);
    if (first.fingerprint !== second.fingerprint) throw new Error("Second import was not idempotent.");
    await pool.query("update catalog_songs set title = 'Acceptance controlled title update', source_url = 'https://example.test/source' where song_id = 'catalog:czech:1'");
    const beforeIdentity = await pool.query("select song_id from catalog_songs where language = 'czech' and number = '1'");
    if (beforeIdentity.rows[0].song_id !== 'catalog:czech:1') throw new Error("Identity changed after controlled title/source update.");
    await importRealCatalog(pool);
    const afterIdentity = await pool.query("select song_id, title from catalog_songs where language = 'czech' and number = '1'");
    if (afterIdentity.rows[0].song_id !== 'catalog:czech:1' || afterIdentity.rows[0].title === 'Acceptance controlled title update') throw new Error("Controlled update was not repaired without identity change.");
    const stable = await catalogFingerprint(pool);
    try { await importRealCatalog(pool, { failAfterRows: 3 }); throw new Error("Rollback failure injection did not throw."); } catch (error) { if (!String((error as Error).message).includes("Deliberate transactional failure")) throw error; }
    const rollback = await catalogFingerprint(pool);
    if (rollback !== stable) throw new Error(`Rollback fingerprint changed: ${stable} -> ${rollback}`);
    await pool.query("insert into catalog_songs (song_id, language, number, title, active) values ('demo-dirty-song', 'czech', '777777', 'Demo dirty song', true)");
    try { await importRealCatalog(pool); throw new Error("Dirty state was accepted."); } catch (error) { if (!String((error as Error).message).includes("Dirty demo/synthetic")) throw error; }
    await pool.query("delete from catalog_songs where song_id = 'demo-dirty-song'");
    await assertNoDirtyCatalogState(pool);
    if (await scalar(pool, "select count(*) from catalog_songs where language='czech'") !== 808) throw new Error("Czech count mismatch.");
    if (await scalar(pool, "select count(*) from catalog_songs where language='polish'") !== 990) throw new Error("Polish count mismatch.");
    if (await scalar(pool, "select count(*) from catalog_songs where number !~ '^[0-9]+$'") !== 0) throw new Error("Non digit-only catalog number found.");
    console.log(`Real catalog acceptance passed. first=${first.fingerprint} second=${second.fingerprint} rollback=${rollback}`);
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
