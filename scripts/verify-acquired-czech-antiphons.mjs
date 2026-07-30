import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
const directory = process.argv[2] ?? "artifacts/czech-antiphon-acquisition";
const bytes = await readFile(join(directory, "catalog-czech-antiphons.json"));
const records = JSON.parse(bytes);
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
const sourceResponse = JSON.parse(await readFile(join(directory, "source-response.json"), "utf8"));
const sourceRecords = sourceResponse.data?.songbook?.records;
if (!Array.isArray(sourceRecords)) throw new Error("Replayable source evidence must contain the complete songbook records array.");
if (!Array.isArray(records) || records.length === 0) throw new Error("Acquired catalog must be a non-empty array.");
let previous = 799;
for (const record of records) {
  if (JSON.stringify(Object.keys(record)) !== JSON.stringify(["number", "title", "url"])) throw new Error("Acquired record has incorrect keys.");
  if (!Number.isSafeInteger(record.number) || record.number < 800 || record.number <= previous) throw new Error(`Invalid, duplicate or unordered number ${record.number}.`);
  if (typeof record.title !== "string" || !record.title || record.title !== record.title.trim()) throw new Error(`Invalid title at ${record.number}.`);
  const url = new URL(record.url);
  if (url.protocol !== "https:" || url.origin !== "https://www.evangelickykancional.cz") throw new Error(`Invalid URL at ${record.number}.`);
  previous = record.number;
}
const acceptedSourceRecords = sourceRecords.filter((record) => {
  const value = record.number;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 800;
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && String(parsed) === value && parsed >= 800;
}).sort((left, right) => Number(left.number) - Number(right.number));
if (acceptedSourceRecords.length !== records.length) throw new Error("Replayable source evidence does not match the accepted record count.");
for (let index = 0; index < records.length; index++) {
  const source = acceptedSourceRecords[index];
  const expectedTitle = String(source.song_name ?? "").trim() || String(source.song_lyric?.name ?? "").trim();
  if (!expectedTitle) throw new Error(`Both primary source-title fields are empty for antiphon ${records[index].number}.`);
  if (records[index].number !== Number(source.number) || records[index].title !== expectedTitle) throw new Error(`Primary-title precedence mismatch at antiphon ${records[index].number}.`);
}
const source800 = acceptedSourceRecords.find((record) => Number(record.number) === 800);
const output800 = records.find((record) => record.number === 800);
if (!source800 || String(source800.song_name ?? "").trim() !== "" || String(source800.song_lyric?.name ?? "").trim() !== "Slavnostní introit" || output800?.title !== "Slavnostní introit") {
  throw new Error("Antiphon 800 primary-title fallback evidence does not match the authoritative expectation.");
}
console.log("Antiphon 800 title precedence verified: empty song_name -> song_lyric.name 'Slavnostní introit'.");
const hash = createHash("sha256").update(bytes).digest("hex");
if (manifest.record_count !== records.length || manifest.first_number !== records[0].number || manifest.last_number !== records.at(-1).number || manifest.sha256 !== hash) throw new Error("Manifest does not match acquired JSON.");
console.log(`Acquisition artifact verified: ${records.length} records, ${records[0].number}–${records.at(-1).number}, SHA-256 ${hash}.`);
