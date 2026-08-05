import { Pool } from "pg";
import { synchronizeReferenceThematicSections } from "../src/application/reference-thematic-section-sync";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to synchronize thematic sections.");

const pool = new Pool({ connectionString: databaseUrl });

try {
  const counts = await synchronizeReferenceThematicSections(pool);
  console.log(`Reference thematic sections synchronized: Parents ${counts.parents}, Sections ${counts.sections}, Ranges ${counts.ranges}`);
} finally {
  await pool.end();
}
