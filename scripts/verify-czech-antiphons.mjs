import { readFile } from "node:fs/promises";
import {
  expected,
  materializeCatalogBytes,
  paths,
  readReplayEvidence,
  sha256,
} from "./materialize-czech-antiphons.mjs";

const { sourceRecords } = await readReplayEvidence();
const materialized = materializeCatalogBytes(sourceRecords);
const committedBytes = await readFile(paths.catalog);

if (!committedBytes.equals(materialized.bytes)) {
  throw new Error("Committed Czech antiphon catalog is not byte-identical to offline replay output.");
}
if (sha256(committedBytes) !== expected.catalogSha256) {
  throw new Error("Committed Czech antiphon catalog SHA-256 does not match the frozen value.");
}

const records = JSON.parse(committedBytes.toString("utf8"));
if (!Array.isArray(records) || records.length !== expected.recordCount) {
  throw new Error(`Expected ${expected.recordCount} committed records.`);
}

let previous = expected.firstNumber - 1;
for (const record of records) {
  if (JSON.stringify(Object.keys(record)) !== JSON.stringify(["number", "title", "url"])) {
    throw new Error(`Incorrect schema at antiphon ${JSON.stringify(record.number)}.`);
  }
  if (!Number.isSafeInteger(record.number) || record.number < expected.firstNumber || record.number <= previous) {
    throw new Error(`Invalid, duplicate or unordered antiphon number ${JSON.stringify(record.number)}.`);
  }
  if (typeof record.title !== "string" || !record.title || record.title !== record.title.trim()) {
    throw new Error(`Invalid title at antiphon ${record.number}.`);
  }
  const url = new URL(record.url);
  if (url.protocol !== "https:" || url.origin !== "https://www.evangelickykancional.cz") {
    throw new Error(`Invalid public URL at antiphon ${record.number}.`);
  }
  previous = record.number;
}

const samples = [
  {
    index: 0,
    expected: {
      number: 800,
      title: "Slavnostní introit",
      url: "https://www.evangelickykancional.cz/pisen/6907/slavnostni-introit",
    },
  },
  {
    index: expected.middleIndex,
    expected: {
      number: 858,
      title: "5. neděle po Trojici",
      url: "https://www.evangelickykancional.cz/pisen/6977/5-nedele-po-trojici",
    },
  },
  {
    index: records.length - 1,
    expected: {
      number: 915,
      title: "Pohřební bohoslužba (Pohřeb dítěte)",
      url: "https://www.evangelickykancional.cz/pisen/7039/pohrebni-bohosluzba-pohreb-ditete",
    },
  },
];

for (const sample of samples) {
  if (JSON.stringify(records[sample.index]) !== JSON.stringify(sample.expected)) {
    throw new Error(`Frozen sample mismatch at deterministic index ${sample.index}.`);
  }
}

if (records[0].number !== expected.firstNumber || records.at(-1).number !== expected.lastNumber) {
  throw new Error("Frozen Czech antiphon number range is incorrect.");
}

console.log(`Data Gate A1 PASS: ${records.length} Czech antiphons, ${records[0].number}–${records.at(-1).number}.`);
console.log(`Catalog SHA-256 ${expected.catalogSha256}.`);
console.log(`Samples: ${samples.map(({ expected: sample }) => `${sample.number} ${sample.url}`).join(" | ")}`);
