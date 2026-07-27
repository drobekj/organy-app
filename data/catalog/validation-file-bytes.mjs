import { createHash } from "node:crypto";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalizeValidationBytes(bytes, expectedHash, name) {
  if (sha256(bytes) === expectedHash) return { bytes, convertedCrlf: false };

  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || !text.includes("\r\n")) {
    throw new Error(`${name}: SHA-256 mismatch; expected ${expectedHash}, got ${sha256(bytes)}.`);
  }
  const normalized = Buffer.from(text.replaceAll("\r\n", "\n"), "utf8");
  if (sha256(normalized) !== expectedHash) {
    throw new Error(`${name}: SHA-256 mismatch; expected ${expectedHash}, got ${sha256(bytes)}.`);
  }
  return { bytes: normalized, convertedCrlf: true };
}
