import { Pool } from "pg";
import { importRealCatalog } from "../src/application/real-catalog-import";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for real catalog import.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await importRealCatalog(pool);
    console.log(`Real catalog import passed: ${result.byLanguage.czech} Czech + ${result.byLanguage.polish} Polish; imported ${result.imported}; fingerprint ${result.fingerprint}`);
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
