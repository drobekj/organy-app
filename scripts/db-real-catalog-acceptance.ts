import { Pool } from "pg";
import { importRealCatalog, catalogFingerprint } from "../src/application/real-catalog-import";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for real catalog acceptance.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const first = await importRealCatalog(pool);
    if (first.inserted !== 1798) throw new Error(`First import inserted ${first.inserted}, expected 1798.`);
    const second = await importRealCatalog(pool);
    if (second.inserted !== 0 || first.fingerprint !== second.fingerprint) throw new Error("Second import was not idempotent with zero inserts.");
    await pool.query("update catalog_songs set title = 'Acceptance controlled title update', source_url = 'https://example.test/source' where language = 'czech' and number = '1'");
    const controlled = await importRealCatalog(pool);
    const identity = await pool.query("select song_id, title, source_url from catalog_songs where language = 'czech' and number = '1'");
    if (identity.rows[0].song_id !== 'catalog:czech:1' || identity.rows[0].title === 'Acceptance controlled title update' || identity.rows[0].source_url === 'https://example.test/source') throw new Error("Controlled update was not repaired in place.");
    const stable = await catalogFingerprint(pool);
    try { await importRealCatalog(pool, { failAfterRows: 3 }); throw new Error("Rollback failure injection did not throw."); } catch (error) { if (!String((error as Error).message).includes("Deliberate transactional failure")) throw error; }
    const rollback = await catalogFingerprint(pool);
    if (rollback !== stable) throw new Error(`Rollback fingerprint changed: ${stable} -> ${rollback}`);
    await pool.query("insert into catalog_persons (id, display_name) values ('demo-dirty-person', 'Demo dirty person')");
    try { await importRealCatalog(pool); throw new Error("Dirty state was accepted."); } catch (error) { if (!String((error as Error).message).includes("Dirty dirty catalog people")) throw error; }
    await pool.query("delete from catalog_persons where id = 'demo-dirty-person'");
    console.log(`Real catalog acceptance passed: first inserted=${first.inserted}, second inserted=${second.inserted}, controlled updates=${controlled.updated}, fingerprint=${stable}, rollback=${rollback}`);
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
