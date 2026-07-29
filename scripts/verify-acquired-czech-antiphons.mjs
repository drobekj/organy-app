import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
const directory = process.argv[2] ?? "artifacts/czech-antiphon-acquisition";
const bytes = await readFile(join(directory, "catalog-czech-antiphons.json"));
const records = JSON.parse(bytes);
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
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
const hash = createHash("sha256").update(bytes).digest("hex");
if (manifest.record_count !== records.length || manifest.first_number !== records[0].number || manifest.last_number !== records.at(-1).number || manifest.sha256 !== hash) throw new Error("Manifest does not match acquired JSON.");
console.log(`Acquisition artifact verified: ${records.length} records, ${records[0].number}–${records.at(-1).number}, SHA-256 ${hash}.`);
