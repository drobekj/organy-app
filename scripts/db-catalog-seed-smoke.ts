import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleCatalogRepository } from "../src/application/catalog";
import { phase29DemoPeople, phase29DemoSongs, seedCatalog } from "../src/application/catalog-seed";
import * as schema from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const marker = `Phase29 Seed Smoke ${Date.now()}-${process.pid}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const repo = new DrizzleCatalogRepository(drizzle(client, { schema }));
    const foreignPerson = { id: `${marker} person`, displayName: `${marker} Person`, active: true, priest: true, organist: false };
    const foreignCzechSong = { songId: `${marker} czech 101`, language: "czech" as const, number: "101", title: `${marker} Czech 101`, active: true };
    const foreignPolishSong = { songId: `${marker} polish 101`, language: "polish" as const, number: "101", title: `${marker} Polish 101`, active: true };

    await repo.upsertPerson(foreignPerson);
    await repo.upsertSong(foreignCzechSong);
    await repo.upsertSong(foreignPolishSong);
    await seedCatalog(repo);
    await seedCatalog(repo);

    const people = await repo.listPeople();
    const songs = await repo.listSongs();
    assert(phase29DemoPeople.every((person) => people.filter((row) => row.id === person.id).length === 1), "each demo person exists once");
    assert(phase29DemoSongs.every((song) => songs.filter((row) => row.songId === song.songId).length === 1), "each demo song exists once");
    assertEqual(people.find((row) => row.id === foreignPerson.id), foreignPerson, "foreign person unchanged");
    assertEqual(songs.find((row) => row.songId === foreignCzechSong.songId), foreignCzechSong, "foreign Czech song unchanged");
    assertEqual(songs.find((row) => row.songId === foreignPolishSong.songId), foreignPolishSong, "foreign Polish song unchanged");
    assert(songs.some((song) => song.number === "PH29-DEMO-101"), "reserved demo number exists");
    assert(songs.some((song) => song.language === "czech" && song.number === "101"), "regular Czech 101 can coexist");
    assert(songs.some((song) => song.language === "polish" && song.number === "101"), "regular Polish 101 can coexist");
    const languageNumbers = new Set<string>();
    for (const song of phase29DemoSongs) {
      const key = `${song.language}:${song.number}`;
      assert(!languageNumbers.has(key), "demo language/number remains unique");
      languageNumbers.add(key);
    }
    console.log("DB catalog seed smoke passed.");
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); await pool.end(); }
  }
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
