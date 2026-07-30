import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const paths = {
  catalog: join(repoRoot, "data/catalog/catalog-czech-antiphons.json"),
  replayTransport: join(repoRoot, "data/catalog/payload/catalog-czech-antiphons-source.json.gz.b64"),
};

export const expected = {
  endpoint: "https://zpevnik.proscholy.cz/graphql",
  songbookId: 63,
  sourceRecordCount: 919,
  recordCount: 116,
  firstNumber: 800,
  middleIndex: 58,
  lastNumber: 915,
  transportSha256: "25f926b8fa85e9d21a1ac78c9ba21e57d6b3bdf7447bb460ff7fbba135daf101",
  replaySha256: "282d101609f8f7751295ec3f1554955ec0eee07cb1b6ca5f98bd47d2c1101f0e",
  catalogSha256: "9fe6f782ad62afa2d664fcb480a039a9b5dacf4bc193decb92a41d85023414e8",
};

export function sha256(bytes) {
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

function recordScore(value) {
  if (!Array.isArray(value)) return -1;
  return value.reduce((score, record) => {
    if (!record || typeof record !== "object") return score;
    return score + (Object.hasOwn(record, "number") ? 1 : 0) + (Object.hasOwn(record, "song_lyric") ? 1 : 0);
  }, 0);
}

function findStructuredRecords(root) {
  const candidates = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      const score = recordScore(value);
      if (score > 0) candidates.push({ value, score });
      for (const item of value) visit(item);
      return;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(root);
  candidates.sort((left, right) => right.score - left.score || right.value.length - left.value.length);
  if (!candidates.length) throw new Error("Replay evidence does not contain a structured song record array.");
  return candidates[0].value;
}

function publicUrl(record) {
  const publicUrl = String(record.song_lyric?.public_url ?? "").trim();
  if (publicUrl) {
    try {
      const candidate = new URL(publicUrl);
      if (candidate.protocol === "https:" && candidate.origin === "https://www.evangelickykancional.cz") return candidate.href;
    } catch {
      // The source URL is not authoritative for this site; require the structured route below.
    }
  }
  const publicRoute = String(record.song_lyric?.public_route ?? "").trim();
  if (!publicRoute) throw new Error(`Missing structured public route for antiphon ${JSON.stringify(record.number)}.`);
  const resolved = new URL(publicRoute, "https://www.evangelickykancional.cz");
  if (resolved.protocol !== "https:" || resolved.origin !== "https://www.evangelickykancional.cz") {
    throw new Error(`Wrong structured public route origin: ${resolved.href}`);
  }
  return resolved.href;
}

function metadataValue(snapshot, ...keys) {
  for (const key of keys) {
    if (Object.hasOwn(snapshot, key)) return snapshot[key];
  }
  return undefined;
}

export async function readReplayEvidence() {
  const transportBytes = await readFile(paths.replayTransport);
  const transportHash = sha256(transportBytes);
  if (transportHash !== expected.transportSha256) {
    throw new Error(`Replay transport SHA-256 mismatch; expected ${expected.transportSha256}, got ${transportHash}.`);
  }

  const normalizedBase64 = transportBytes.toString("utf8").replace(/\s+/g, "");
  const compressed = Buffer.from(normalizedBase64, "base64");
  if (!normalizedBase64 || compressed.toString("base64") !== normalizedBase64) {
    throw new Error("Replay transport is not canonical Base64.");
  }

  const replayBytes = gunzipSync(compressed);
  const replayHash = sha256(replayBytes);
  if (replayHash !== expected.replaySha256) {
    throw new Error(`Decoded replay SHA-256 mismatch; expected ${expected.replaySha256}, got ${replayHash}.`);
  }

  const snapshot = JSON.parse(replayBytes.toString("utf8"));
  if (snapshot.endpoint !== expected.endpoint) throw new Error(`Unexpected replay endpoint ${JSON.stringify(snapshot.endpoint)}.`);
  const songbookId = metadataValue(snapshot, "songbook_id", "songbookId");
  if (songbookId !== expected.songbookId) throw new Error(`Unexpected replay songbook id ${JSON.stringify(songbookId)}.`);
  const sourceRecordCount = metadataValue(snapshot, "source_record_count", "sourceRecordCount", "complete_source_record_count");
  if (sourceRecordCount !== expected.sourceRecordCount) {
    throw new Error(`Unexpected complete source record count ${JSON.stringify(sourceRecordCount)}.`);
  }

  return { replayBytes, snapshot, sourceRecords: findStructuredRecords(snapshot) };
}

export function materializeCatalogBytes(sourceRecords) {
  const ambiguousIncluded = [];
  const catalog = [];

  for (const source of sourceRecords) {
    const number = exactInteger(source.number);
    if (number === null) {
      const numericFragments = String(source.number).match(/\d+/g) ?? [];
      if (numericFragments.some((fragment) => Number(fragment) >= expected.firstNumber)) ambiguousIncluded.push(source.number);
      continue;
    }
    if (number < expected.firstNumber) continue;

    const songbookTitle = String(source.song_name ?? "").trim();
    const canonicalTitle = String(source.song_lyric?.name ?? "").trim();
    const title = songbookTitle || canonicalTitle;
    if (!title) throw new Error(`Empty songbook-specific and canonical title for antiphon ${number}.`);

    catalog.push({ number, title, url: publicUrl(source) });
  }

  if (ambiguousIncluded.length) {
    throw new Error(`Ambiguous included 800+ printed source numbers: ${JSON.stringify(ambiguousIncluded)}.`);
  }

  catalog.sort((left, right) => left.number - right.number);
  if (catalog.length !== expected.recordCount) {
    throw new Error(`Expected ${expected.recordCount} accepted antiphons, got ${catalog.length}.`);
  }
  for (let index = 1; index < catalog.length; index++) {
    if (catalog[index - 1].number === catalog[index].number) throw new Error(`Duplicate antiphon number ${catalog[index].number}.`);
  }

  const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  const hash = sha256(bytes);
  if (hash !== expected.catalogSha256) {
    throw new Error(`Materialized catalog SHA-256 mismatch; expected ${expected.catalogSha256}, got ${hash}.`);
  }
  return { bytes, records: catalog };
}

export async function materializeOfflineCatalog(outputPath) {
  const { sourceRecords } = await readReplayEvidence();
  const materialized = materializeCatalogBytes(sourceRecords);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, materialized.bytes);
  return materialized;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const outputPath = resolve(process.argv[2] ?? join(tmpdir(), "organy-app-catalog-czech-antiphons.json"));
  const { records } = await materializeOfflineCatalog(outputPath);
  console.log(`Materialized ${records.length} Czech antiphons (${records[0].number}–${records.at(-1).number}) offline -> ${outputPath}`);
  console.log(`SHA-256 ${expected.catalogSha256}`);
}
