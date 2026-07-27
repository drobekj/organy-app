import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { canonicalizeValidationBytes, sha256 } from "./validation-file-bytes.mjs";

const catalogDir = dirname(fileURLToPath(import.meta.url));
const payloadDir = join(catalogDir, "payload");

const artifacts = [
  {
    name: "Czech catalog",
    partPrefix: "catalog-czech-final.json.gz.b64.part",
    output: "catalog-czech-final.json",
    upstreamSha256: "5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9",
    finalSha256: "9812d32e636542865dca471f318ab4df695d0bc2dc8054d4c340e47ffa25c1a7",
    records: 808,
    applyApprovedErratum: true,
  },
  {
    name: "Polish catalog",
    partPrefix: "catalog-polish-final.json.gz.b64.part",
    output: "catalog-polish-final.json",
    upstreamSha256: "b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9",
    finalSha256: "b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9",
    records: 990,
    applyApprovedErratum: false,
  },
];

const fixedFiles = [
  {
    name: "Czech validation",
    file: "catalog-czech-validation.json",
    sha256: "e47da19e263f1ba962cb8e2699c6e94125499438a3ff74ccf78bdb29517cab40",
  },
  {
    name: "Polish validation",
    file: "catalog-polish-validation.json",
    sha256: "49a0accd4392ff9167707e2677d9edab9b5ed9ceb7d0d023a2251dfbca1b5559",
  },
];

function applyApprovedCzechErratum(records) {
  const matches = records.filter((record) => record.source_id === "6017");
  if (matches.length !== 1) throw new Error(`Czech erratum: expected one source_id 6017 record, got ${matches.length}.`);
  const record = matches[0];
  const expected = {
    source_id: "6017",
    language: "czech",
    number: 7522,
    title: "Blíž Tobě, Bože můj",
    source_url: "https://www.evangelickykancional.cz/pisen/6017/bliz-tobe-boze-muj",
  };
  if (JSON.stringify(record) !== JSON.stringify(expected)) {
    throw new Error("Czech erratum: upstream source_id 6017 no longer matches the approved input record.");
  }

  return records.map((candidate) => candidate === record ? { ...candidate, number: 7512 } : candidate);
}

async function materialize({ name, partPrefix, output, upstreamSha256, finalSha256, records, applyApprovedErratum }) {
  const partNames = (await readdir(payloadDir))
    .filter((file) => file.startsWith(partPrefix))
    .sort();

  if (partNames.length === 0) {
    throw new Error(`${name}: no transport payload parts found.`);
  }

  let base64 = (
    await Promise.all(partNames.map((file) => readFile(join(payloadDir, file), "utf8")))
  ).join("");

  // The frozen Czech transport in this handoff is missing one Base64 character,
  // but the upstream SHA-256 still proves the byte-exact reconstructed JSON.
  if (partPrefix === "catalog-czech-final.json.gz.b64.part") {
    base64 = `${base64.slice(0, 4013)}J${base64.slice(4013)}`;
  }

  const upstreamBytes = gunzipSync(Buffer.from(base64, "base64"));
  const upstreamHash = sha256(upstreamBytes);
  if (upstreamHash !== upstreamSha256) {
    throw new Error(`${name}: upstream SHA-256 mismatch; expected ${upstreamSha256}, got ${upstreamHash}.`);
  }

  const upstreamRecords = JSON.parse(upstreamBytes.toString("utf8"));
  if (!Array.isArray(upstreamRecords) || upstreamRecords.length !== records) {
    throw new Error(`${name}: expected ${records} records, got ${Array.isArray(upstreamRecords) ? upstreamRecords.length : "non-array JSON"}.`);
  }

  const finalRecords = applyApprovedErratum ? applyApprovedCzechErratum(upstreamRecords) : upstreamRecords;
  const finalBytes = applyApprovedErratum ? Buffer.from(JSON.stringify(finalRecords, null, 2)) : upstreamBytes;
  const finalHash = sha256(finalBytes);
  if (finalHash !== finalSha256) {
    throw new Error(`${name}: final-output SHA-256 mismatch; expected ${finalSha256}, got ${finalHash}.`);
  }

  await writeFile(join(catalogDir, output), finalBytes);
  console.log(`${name}: ${records} records, upstream SHA-256 OK, final-output SHA-256 OK -> data/catalog/${output}`);
}
async function verifyFixedFile({ name, file, sha256: expectedHash }) {
  const checked = canonicalizeValidationBytes(await readFile(join(catalogDir, file)), expectedHash, name);
  JSON.parse(checked.bytes.toString("utf8"));
  if (checked.convertedCrlf) await writeFile(join(catalogDir, file), checked.bytes);
  console.log(`${name}: SHA-256 OK -> data/catalog/${file}`);
}

for (const artifact of artifacts) {
  await materialize(artifact);
}
for (const file of fixedFiles) {
  await verifyFixedFile(file);
}

console.log("Catalog handoff complete: 808 Czech + 990 Polish = 1,798 accepted records.");
