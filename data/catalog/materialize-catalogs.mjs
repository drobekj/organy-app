import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const catalogDir = dirname(fileURLToPath(import.meta.url));
const payloadDir = join(catalogDir, "payload");

const artifacts = [
  {
    name: "Czech catalog",
    partPrefix: "catalog-czech-final.json.gz.b64.part",
    output: "catalog-czech-final.json",
    sha256: "5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9",
    records: 808,
  },
  {
    name: "Polish catalog",
    partPrefix: "catalog-polish-final.json.gz.b64.part",
    output: "catalog-polish-final.json",
    sha256: "b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9",
    records: 990,
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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function materialize({ name, partPrefix, output, sha256: expectedHash, records }) {
  const partNames = (await readdir(payloadDir))
    .filter((file) => file.startsWith(partPrefix))
    .sort();

  if (partNames.length === 0) {
    throw new Error(`${name}: no transport payload parts found.`);
  }

  const base64 = (
    await Promise.all(partNames.map((file) => readFile(join(payloadDir, file), "utf8")))
  ).join("");

  const jsonBytes = gunzipSync(Buffer.from(base64, "base64"));
  const actualHash = sha256(jsonBytes);

  if (actualHash !== expectedHash) {
    throw new Error(`${name}: SHA-256 mismatch; expected ${expectedHash}, got ${actualHash}.`);
  }

  const parsed = JSON.parse(jsonBytes.toString("utf8"));
  if (!Array.isArray(parsed) || parsed.length !== records) {
    throw new Error(`${name}: expected ${records} records, got ${Array.isArray(parsed) ? parsed.length : "non-array JSON"}.`);
  }

  await writeFile(join(catalogDir, output), jsonBytes);
  console.log(`${name}: ${records} records, SHA-256 OK -> data/catalog/${output}`);
}

async function verifyFixedFile({ name, file, sha256: expectedHash }) {
  const bytes = await readFile(join(catalogDir, file));
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) {
    throw new Error(`${name}: SHA-256 mismatch; expected ${expectedHash}, got ${actualHash}.`);
  }
  JSON.parse(bytes.toString("utf8"));
  console.log(`${name}: SHA-256 OK -> data/catalog/${file}`);
}

for (const artifact of artifacts) {
  await materialize(artifact);
}
for (const file of fixedFiles) {
  await verifyFixedFile(file);
}

console.log("Catalog handoff complete: 808 Czech + 990 Polish = 1,798 accepted records.");
