import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = resolve(repoRoot, "data/catalog/phase-31a/bundle");
const outputDir = resolve(repoRoot, "data/catalog/phase-31a/canonical");
const manifest = JSON.parse(
  await readFile(resolve(bundleDir, "bundle-manifest.json"), "utf8"),
);

const chunks = [];
for (const bundleFile of manifest.bundle_files) {
  const entries = JSON.parse(
    await readFile(resolve(bundleDir, bundleFile), "utf8"),
  );
  if (!Array.isArray(entries)) {
    throw new Error(`${bundleFile} must contain a JSON array.`);
  }
  chunks.push(...entries);
}

await mkdir(outputDir, { recursive: true });

for (const [artifact, expected] of Object.entries(manifest.artifacts)) {
  const artifactChunks = chunks
    .filter((chunk) => chunk.artifact === artifact)
    .sort((left, right) => left.index - right.index);

  if (artifactChunks.length === 0) {
    throw new Error(`No bundle chunks found for ${artifact}.`);
  }

  artifactChunks.forEach((chunk, position) => {
    const expectedIndex = position + 1;
    if (chunk.index !== expectedIndex || typeof chunk.data !== "string") {
      throw new Error(
        `Invalid or non-contiguous chunk sequence for ${artifact}: expected ${expectedIndex}.`,
      );
    }
  });

  const compressed = Buffer.from(
    artifactChunks.map((chunk) => chunk.data).join(""),
    "base64",
  );
  const content = gunzipSync(compressed);
  const sha256 = createHash("sha256").update(content).digest("hex");

  if (content.byteLength !== expected.bytes) {
    throw new Error(
      `${artifact} byte-length mismatch: expected ${expected.bytes}, got ${content.byteLength}.`,
    );
  }
  if (sha256 !== expected.sha256) {
    throw new Error(
      `${artifact} SHA-256 mismatch: expected ${expected.sha256}, got ${sha256}.`,
    );
  }

  const parsed = JSON.parse(content.toString("utf8"));
  if (expected.records !== undefined) {
    if (!Array.isArray(parsed) || parsed.length !== expected.records) {
      throw new Error(
        `${artifact} record-count mismatch: expected ${expected.records}.`,
      );
    }
  }

  await writeFile(resolve(outputDir, artifact), content);
  console.log(
    `Materialized ${artifact}: ${content.byteLength} bytes, SHA-256 ${sha256}`,
  );
}

console.log(`Phase 31A catalog artifacts are ready in ${outputDir}.`);
