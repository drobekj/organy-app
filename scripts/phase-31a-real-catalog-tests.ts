import assert from "node:assert/strict";
import { loadFrozenCatalogs } from "../src/application/real-catalog";
import { decodeCatalogNumberForDisplay, encodeCatalogNumberForStorage, normalizeCatalogSearchQuery } from "../src/application/catalog-number";
import { validateCatalogSongImport } from "../src/application/catalog";

async function main() {
  assert.equal(decodeCatalogNumberForDisplay(1100), "1/1");
  assert.equal(decodeCatalogNumberForDisplay(1200), "1/2");
  assert.equal(decodeCatalogNumberForDisplay(5210), "52/1");
  assert.equal(decodeCatalogNumberForDisplay(5220), "52/2");
  assert.equal(decodeCatalogNumberForDisplay(3471), "347/1");
  assert.equal(decodeCatalogNumberForDisplay(3478), "347/8");
  assert.equal(encodeCatalogNumberForStorage("1/1"), "1100");
  assert.equal(encodeCatalogNumberForStorage("52/1"), "5210");
  assert.equal(encodeCatalogNumberForStorage("347/8"), "3478");
  assert.deepEqual(normalizeCatalogSearchQuery("52/1"), ["52/1", "5210"]);
  const songs = await loadFrozenCatalogs();
  assert.equal(songs.filter((song) => song.language === "czech").length, 808);
  assert.equal(songs.filter((song) => song.language === "polish").length, 990);
  assert(songs.some((song) => song.language === "czech" && song.number === "5210"));
  assert(songs.some((song) => song.language === "polish" && song.number === "3478"));
  assert(songs.some((song) => song.language === "czech" && song.number === "298" && song.title === "Otevři své srdce" && song.sourceUrl === "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce"));
  assert(songs.some((song) => song.language === "polish" && song.number === "955" && song.title === "Żegnamy was w Bogu naszym" && song.sourceUrl === "https://hymnary.org/hymn/SE2002/955"));
  assert.equal(songs.filter((song) => song.sourceUrl).length, 1791);
  assert(songs.every((song) => !song.sheetMusicUrl));
  assert.equal(validateCatalogSongImport([{ language: "czech", number: "5210", title: "A", sourceUrl: "https://example.com/source", sheetMusicUrl: "https://example.com/sheet.pdf" }]).length, 0);
  console.log("Phase 31A real catalog tests passed.");
}
main().catch((error) => { console.error(error); process.exit(1); });
