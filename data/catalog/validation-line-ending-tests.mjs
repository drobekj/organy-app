import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalizeValidationBytes, sha256 } from "./validation-file-bytes.mjs";

const fixtures = [
  ["catalog-czech-validation.json", "e47da19e263f1ba962cb8e2699c6e94125499438a3ff74ccf78bdb29517cab40", "b33c83d048b213108f4b6e1a07a209d021cceb0ebe9a061d6d2655ab879cff36"],
  ["catalog-polish-validation.json", "49a0accd4392ff9167707e2677d9edab9b5ed9ceb7d0d023a2251dfbca1b5559"],
];

for (const [file, expectedHash, expectedCrlfHash] of fixtures) {
  const canonical = await readFile(new URL(file, import.meta.url));
  assert.equal(sha256(canonical), expectedHash);
  const crlf = Buffer.from(canonical.toString("utf8").replaceAll("\n", "\r\n"), "utf8");
  if (expectedCrlfHash) assert.equal(sha256(crlf), expectedCrlfHash);
  const repaired = canonicalizeValidationBytes(crlf, expectedHash, file);
  assert.equal(repaired.convertedCrlf, true); assert.deepEqual(repaired.bytes, canonical);

  const mutation = Buffer.from(crlf); mutation[mutation.indexOf(Buffer.from("validation", "utf8"))] ^= 1;
  assert.throws(() => canonicalizeValidationBytes(mutation, expectedHash, file), /SHA-256 mismatch/);
}
console.log("Validation JSON line-ending tests passed.");
