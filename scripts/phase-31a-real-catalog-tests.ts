import assert from "node:assert/strict";
import { displayCatalogNumber, loadFrozenCatalogs } from "../src/application/real-catalog";
import { validateCatalogSongImport } from "../src/application/catalog";

async function main() {
  assert.equal(displayCatalogNumber(5210), "52/1");
  assert.equal(displayCatalogNumber(3478), "347/8");
  const songs = await loadFrozenCatalogs();
  assert.equal(songs.filter((song) => song.language === "czech").length, 808);
  assert.equal(songs.filter((song) => song.language === "polish").length, 990);
  assert(songs.some((song) => song.language === "czech" && song.number === "52/1"));
  assert(songs.some((song) => song.language === "polish" && song.number === "347/8"));
  assert.equal(songs.filter((song) => song.sourceUrl).length, 1791);
  assert(songs.every((song) => !song.sheetMusicUrl));
  assert.equal(validateCatalogSongImport([{ language: "czech", number: "52/1", title: "A", sourceUrl: "https://example.com/source", sheetMusicUrl: "https://example.com/sheet.pdf" }]).length, 0);
  console.log("Phase 31A real catalog tests passed.");
}
main().catch((error) => { console.error(error); process.exit(1); });
