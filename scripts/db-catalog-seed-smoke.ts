import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleCatalogRepository, type CatalogSong } from "../src/application/catalog";
import { phase29DemoPeople, phase29DemoSongs, seedCatalog } from "../src/application/catalog-seed";
import * as schema from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const marker = `Phase29 Seed Smoke ${Date.now()}-${process.pid}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

class RollbackSeedSmoke extends Error {}

async function main() {
  let assertionsPassed = false;
  try {
    await db.transaction(async (tx) => {
      const repo = new DrizzleCatalogRepository(tx);
      const foreignPerson = { id: `${marker} person`, displayName: `${marker} Person`, active: true, priest: true, organist: false };
      const czech101Witness = await findOrCreateSongWitness(repo, { songId: `${marker} czech 101`, language: "czech", number: "101", title: `${marker} Czech 101`, active: true });
      const polish101Witness = await findOrCreateSongWitness(repo, { songId: `${marker} polish 101`, language: "polish", number: "101", title: `${marker} Polish 101`, active: true });

      await repo.upsertPerson(foreignPerson);
      await seedCatalog(repo);
      await seedCatalog(repo);

      const people = await repo.listPeople();
      const songs = await repo.listSongs();
      assert(phase29DemoPeople.every((person) => people.filter((row) => row.id === person.id).length === 1), "each demo person exists once");
      assert(phase29DemoSongs.every((song) => songs.filter((row) => row.songId === song.songId).length === 1), "each demo song exists once");
      assertEqual(people.find((row) => row.id === foreignPerson.id), foreignPerson, "foreign person unchanged");
      assertEqual(songs.find((row) => row.songId === czech101Witness.songId), czech101Witness, "Czech 101 witness unchanged");
      assertEqual(songs.find((row) => row.songId === polish101Witness.songId), polish101Witness, "Polish 101 witness unchanged");
      assert(songs.some((song) => song.number === "PH29-DEMO-101"), "reserved demo number exists");
      assert(songs.some((song) => song.language === "czech" && song.number === "101"), "regular Czech 101 can coexist");
      assert(songs.some((song) => song.language === "polish" && song.number === "101"), "regular Polish 101 can coexist");
      const languageNumbers = new Set<string>();
      for (const song of phase29DemoSongs) {
        const key = `${song.language}:${song.number}`;
        assert(!languageNumbers.has(key), "demo language/number remains unique");
        languageNumbers.add(key);
      }
      assertionsPassed = true;
      throw new RollbackSeedSmoke();
    });
  } catch (error) {
    if (!(error instanceof RollbackSeedSmoke)) throw error;
  } finally {
    await pool.end();
  }
  assert(assertionsPassed, "seed smoke assertions completed");
  console.log("DB catalog seed smoke passed.");
}

async function findOrCreateSongWitness(repo: DrizzleCatalogRepository, fallback: CatalogSong): Promise<CatalogSong> {
  const existing = (await repo.listSongs()).find((song) => song.language === fallback.language && song.number === fallback.number);
  if (existing) return { ...existing };
  await repo.upsertSong(fallback);
  return fallback;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
