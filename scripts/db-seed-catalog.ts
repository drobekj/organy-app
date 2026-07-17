import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleCatalogRepository, type CatalogPerson, type CatalogSong } from "../src/application/catalog";
import * as schema from "../src/db/schema";

export const phase29DemoPeople: CatalogPerson[] = [
  { id: "phase29-demo-priest", displayName: "Phase 29 Demo Priest", active: true, priest: true, organist: false },
  { id: "phase29-demo-organist", displayName: "Phase 29 Demo Organist", active: true, priest: false, organist: true },
  { id: "phase29-demo-both", displayName: "Phase 29 Demo Priest+Organist", active: true, priest: true, organist: true },
  { id: "phase29-demo-inactive", displayName: "Phase 29 Demo Inactive Person", active: false, priest: true, organist: true },
];

export const phase29DemoSongs: CatalogSong[] = [
  { songId: "phase29-demo-cz-101", language: "czech", number: "101", title: "Phase 29 Czech Demo With Sheet", active: true, sheetMusicUrl: "https://example.com/phase29-cz-101.pdf" },
  { songId: "phase29-demo-pl-101", language: "polish", number: "101", title: "Phase 29 Polish Demo", active: true },
  { songId: "phase29-demo-cz-202", language: "czech", number: "202", title: "Phase 29 Czech Demo No Sheet", active: true },
  { songId: "phase29-demo-pl-inactive", language: "polish", number: "999", title: "Phase 29 Inactive Polish Demo", active: false, sheetMusicUrl: "https://example.com/phase29-pl-999.pdf" },
];

export async function seedCatalog(repo: Pick<DrizzleCatalogRepository, "upsertPerson" | "upsertSong">) {
  for (const person of phase29DemoPeople) await repo.upsertPerson(person);
  for (const song of phase29DemoSongs) await repo.upsertSong(song);
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required for catalog seed."); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await seedCatalog(new DrizzleCatalogRepository(drizzle(pool, { schema })));
    console.log(`Seeded ${phase29DemoPeople.length} demo people and ${phase29DemoSongs.length} demo songs.`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
