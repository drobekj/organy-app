import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const endpoint = "https://zpevnik.proscholy.cz/graphql";
const songbookId = 63;
const outputDir = process.argv[2] ?? "artifacts/czech-antiphon-acquisition";

async function graphql(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}: ${await response.text()}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  return body;
}

const sourceResponse = await graphql(`query CzechAntiphonAcquisition {
  songbook(id: 63) {
    records {
      number
      song_name
      song_lyric {
        id
        public_url
        public_route
        name
      }
    }
  }
}`);
const sourceSongs = sourceResponse.data?.songbook?.records;
if (!Array.isArray(sourceSongs)) throw new Error("The songbook response is not a complete records array.");

function exactInteger(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(parsed) === value) return parsed;
  }
  return null;
}
function publicUrl(record) {
  const publicUrl = String(record.song_lyric?.public_url ?? "").trim();
  const publicRoute = String(record.song_lyric?.public_route ?? "").trim();
  const sourceValue = publicUrl || publicRoute;
  if (!sourceValue) throw new Error(`Missing structured public URL and route for antiphon ${JSON.stringify(record.number)}.`);
  const url = new URL(sourceValue, "https://www.evangelickykancional.cz");
  if (url.protocol !== "https:" || url.origin !== "https://www.evangelickykancional.cz") throw new Error(`Wrong public URL origin: ${url.href}`);
  return url.href;
}
const ambiguousIncluded = [];
const catalog = [];
for (const song of sourceSongs) {
  const rawNumber = song.number;
  const number = exactInteger(rawNumber);
  if (number === null) {
    const numericFragments = String(rawNumber).match(/\d+/g) ?? [];
    if (numericFragments.some((fragment) => Number(fragment) >= 800)) ambiguousIncluded.push(rawNumber);
    continue;
  }
  if (number < 800) continue;
  const titleValue = String(song.song_name ?? "").trim();
  if (!titleValue) throw new Error(`Empty title for antiphon ${number}.`);
  catalog.push({ number, title: titleValue, url: publicUrl(song) });
}
if (ambiguousIncluded.length) throw new Error(`Ambiguous included 800+ printed source numbers: ${JSON.stringify(ambiguousIncluded)}`);
catalog.sort((a, b) => a.number - b.number);
if (!catalog.length) throw new Error("No qualifying Czech antiphons were found.");
for (let index = 1; index < catalog.length; index++) {
  if (catalog[index - 1].number === catalog[index].number) throw new Error(`Duplicate antiphon number ${catalog[index].number}.`);
}
const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
const sha256 = createHash("sha256").update(catalogBytes).digest("hex");
const manifest = { endpoint, songbook_id: songbookId, source_record_count: sourceSongs.length, record_count: catalog.length, first_number: catalog[0].number, last_number: catalog.at(-1).number, sha256 };
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "catalog-czech-antiphons.json"), catalogBytes);
await writeFile(join(outputDir, "source-response.json"), `${JSON.stringify(sourceResponse, null, 2)}\n`);
await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Acquired ${catalog.length} Czech antiphons (${catalog[0].number}–${catalog.at(-1).number}), SHA-256 ${sha256}.`);
