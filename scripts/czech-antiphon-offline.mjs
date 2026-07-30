import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAYLOAD = resolve(ROOT, "data/catalog/payload/catalog-czech-antiphons-source.json.gz.b64");
const CATALOG = resolve(ROOT, "data/catalog/catalog-czech-antiphons.json");
const EXPECTED = {
  transportSha256: "25f926b8fa85e9d21a1ac78c9ba21e57d6b3bdf7447bb460ff7fbba135daf101",
  replaySha256: "282d101609f8f7751295ec3f1554955ec0eee07cb1b6ca5f98bd47d2c1101f0e",
  catalogSha256: "9fe6f782ad62afa2d664fcb480a039a9b5dacf4bc193decb92a41d85023414e8",
  sourceRecordCount: 919,
  recordCount: 116,
  firstNumber: 800,
  lastNumber: 915,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactInteger(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(parsed) === value) return parsed;
  }
  return null;
}

function publicUrl(record) {
  const direct = String(record.song_lyric?.public_url ?? "").trim();
  if (direct) {
    try {
      const candidate = new URL(direct);
      if (candidate.protocol === "https:" && candidate.origin === "https://www.evangelickykancional.cz") return candidate.href;
    } catch {
      // The structured route below remains authoritative for the target site.
    }
  }
  const route = String(record.song_lyric?.public_route ?? "").trim();
  if (!route) throw new Error(`Missing structured public route for antiphon ${JSON.stringify(record.number)}.`);
  const resolved = new URL(route, "https://www.evangelickykancional.cz");
  if (resolved.protocol !== "https:" || resolved.origin !== "https://www.evangelickykancional.cz") {
    throw new Error(`Wrong public route origin for antiphon ${JSON.stringify(record.number)}: ${resolved.href}`);
  }
  return resolved.href;
}

async function materializeBytes() {
  const transport = await readFile(PAYLOAD);
  if (sha256(transport) !== EXPECTED.transportSha256) throw new Error("Replay transport SHA-256 mismatch.");

  const replayBytes = gunzipSync(Buffer.from(transport.toString("utf8").trim(), "base64"));
  if (sha256(replayBytes) !== EXPECTED.replaySha256) throw new Error("Decoded replay JSON SHA-256 mismatch.");

  const replay = JSON.parse(replayBytes.toString("utf8"));
  const sourceRecords = replay.records ?? replay.data?.songbook?.records;
  if (!Array.isArray(sourceRecords)) throw new Error("Replay evidence does not contain a records array.");
  const declaredSourceCount = replay.source_record_count ?? replay.sourceRecordCount ?? sourceRecords.length;
  if (declaredSourceCount !== EXPECTED.sourceRecordCount) throw new Error(`Expected complete source count ${EXPECTED.sourceRecordCount}, got ${declaredSourceCount}.`);

  const ambiguous = [];
  const catalog = [];
  for (const record of sourceRecords) {
    const number = exactInteger(record.number);
    if (number === null) {
      const fragments = String(record.number).match(/\d+/g) ?? [];
      if (fragments.some((fragment) => Number(fragment) >= EXPECTED.firstNumber)) ambiguous.push(record.number);
      continue;
    }
    if (number < EXPECTED.firstNumber) continue;

    const songbookTitle = String(record.song_name ?? "").trim();
    const canonicalTitle = String(record.song_lyric?.name ?? "").trim();
    const title = songbookTitle || canonicalTitle;
    if (!title) throw new Error(`Empty songbook-specific and canonical title for antiphon ${number}.`);
    catalog.push({ number, title, url: publicUrl(record) });
  }
  if (ambiguous.length) throw new Error(`Ambiguous included 800+ printed source numbers: ${JSON.stringify(ambiguous)}`);

  catalog.sort((left, right) => left.number - right.number);
  if (catalog.length !== EXPECTED.recordCount) throw new Error(`Expected ${EXPECTED.recordCount} antiphons, got ${catalog.length}.`);
  for (let index = 0; index < catalog.length; index++) {
    const record = catalog[index];
    if (JSON.stringify(Object.keys(record)) !== JSON.stringify(["number", "title", "url"])) throw new Error(`Incorrect schema at ${record.number}.`);
    if (index > 0 && catalog[index - 1].number >= record.number) throw new Error(`Duplicate or unordered antiphon ${record.number}.`);
  }
  if (catalog[0].number !== EXPECTED.firstNumber || catalog.at(-1).number !== EXPECTED.lastNumber) throw new Error("Catalog number range mismatch.");

  const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
  if (sha256(bytes) !== EXPECTED.catalogSha256) throw new Error("Materialized catalog SHA-256 mismatch.");
  return { bytes, catalog };
}

const mode = process.argv[2] ?? "materialize";
const { bytes, catalog } = await materializeBytes();
if (mode === "verify") {
  const committed = await readFile(CATALOG);
  if (!committed.equals(bytes)) throw new Error("Committed Czech antiphon catalog is not byte-identical to offline replay output.");
  const middle = catalog[Math.floor(catalog.length / 2)];
  console.log(`Data Gate A1 PASS: ${catalog.length} records, ${catalog[0].number}–${catalog.at(-1).number}, SHA-256 ${EXPECTED.catalogSha256}.`);
  console.log(`Samples: ${catalog[0].number} ${catalog[0].url} | ${middle.number} ${middle.url} | ${catalog.at(-1).number} ${catalog.at(-1).url}`);
} else if (mode === "materialize") {
  const output = resolve(process.argv[3] ?? "artifacts/czech-antiphon-offline/catalog-czech-antiphons.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  console.log(`Materialized ${catalog.length} Czech antiphons to ${output}.`);
} else {
  throw new Error(`Unknown mode ${JSON.stringify(mode)}; use materialize or verify.`);
}
