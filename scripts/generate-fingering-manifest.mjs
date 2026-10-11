import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "public", "fingering");
const output = path.join(root, "data", "fingering-manifest.json");
const filenamePattern = /^EK\d+[A-Z]?-\d{3}_fingering\.pdf$/;

const entries = await readdir(directory, { withFileTypes: true });
const pdfFiles = entries
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
  .map((entry) => entry.name)
  .sort();

const invalid = pdfFiles.filter((filename) => !filenamePattern.test(filename));
if (invalid.length > 0) {
  throw new Error(`Invalid fingering PDF filename(s): ${invalid.join(", ")}`);
}

await writeFile(output, `${JSON.stringify(pdfFiles, null, 2)}\n`, "utf8");
console.log(`Generated fingering manifest with ${pdfFiles.length} PDF file(s).`);
