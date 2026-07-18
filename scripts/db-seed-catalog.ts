import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleCatalogRepository } from "../src/application/catalog";
import { phase29DemoPeople, phase29DemoSongs, seedCatalog } from "../src/application/catalog-seed";
import * as schema from "../src/db/schema";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for catalog seed.");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await seedCatalog(new DrizzleCatalogRepository(drizzle(pool, { schema })));
    await seedDemoInteractionKnowledge(pool);
    console.log(`Seeded ${phase29DemoPeople.length} demo people, ${phase29DemoSongs.length} demo songs, and Phase 30.1 demo interaction knowledge.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
