import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleCatalogRepository } from "../src/application/catalog";
import * as schema from "../src/db/schema";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required for catalog seed."); process.exit(1); }
const people = [
  { id: "phase29-demo-priest", displayName: "Phase 29 Demo Priest", active: true, priest: true, organist: false },
  { id: "phase29-demo-organist", displayName: "Phase 29 Demo Organist", active: true, priest: false, organist: true },
  { id: "phase29-demo-both", displayName: "Phase 29 Demo Priest+Organist", active: true, priest: true, organist: true },
  { id: "phase29-demo-inactive", displayName: "Phase 29 Demo Inactive Person", active: false, priest: true, organist: true },
];
const songs = [
  { songId: "phase29-demo-cz-101", language: "czech" as const, number: "101", title: "Phase 29 Czech Demo With Sheet", active: true, sheetMusicUrl: "https://example.com/phase29-cz-101.pdf" },
  { songId: "phase29-demo-pl-101", language: "polish" as const, number: "101", title: "Phase 29 Polish Demo", active: true },
  { songId: "phase29-demo-cz-202", language: "czech" as const, number: "202", title: "Phase 29 Czech Demo No Sheet", active: true },
  { songId: "phase29-demo-pl-inactive", language: "polish" as const, number: "999", title: "Phase 29 Inactive Polish Demo", active: false, sheetMusicUrl: "https://example.com/phase29-pl-999.pdf" },
];
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try { const repo = new DrizzleCatalogRepository(drizzle(pool, { schema })); for (const p of people) await repo.upsertPerson(p); for (const s of songs) await repo.upsertSong(s); console.log(`Seeded ${people.length} demo people and ${songs.length} demo songs.`); }
finally { await pool.end(); }
