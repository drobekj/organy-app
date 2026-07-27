import { Pool } from "pg";
import { synchronizeReferenceCatalog } from "../src/application/reference-catalog-sync";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to synchronize the reference catalog.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const counts = await synchronizeReferenceCatalog(pool);
    console.log(`Reference catalog synchronized: Czech ${counts.czech}, Polish ${counts.polish}, Total ${counts.total}`);
  } finally { await pool.end(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
