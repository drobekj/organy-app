import { Pool } from "pg";
import { importRealCatalog, loadFrozenCatalogs } from "../src/application/real-catalog";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for real catalog import.");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const songs = await loadFrozenCatalogs();
    await importRealCatalog(pool, songs);
    console.log("Imported real catalog: Czech catalog: 808 records; Polish catalog: 990 records; Total: 1,798 records.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Real catalog import failed.");
  console.error(error);
  process.exit(1);
});
