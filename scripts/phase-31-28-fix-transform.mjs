import fs from "node:fs";

const path = "scripts/phase-31-28-transform.mjs";
let source = fs.readFileSync(path, "utf8");
const helperAnchor = `function appendOnce(path, marker, text) {`;
const helper = `function replaceExactCount(path, before, after, expectedCount) {\n  const source = fs.readFileSync(path, "utf8");\n  const count = source.split(before).length - 1;\n  if (count !== expectedCount) throw new Error(\`${"${path}"}: expected exactly ${"${expectedCount}"} transform targets, found ${"${count}"}\`);\n  fs.writeFileSync(path, source.split(before).join(after));\n}\n\n`;
if (!source.includes("function replaceExactCount")) {
  if (!source.includes(helperAnchor)) throw new Error("appendOnce anchor missing");
  source = source.replace(helperAnchor, helper + helperAnchor);
}
const before = `replaceExactly(\n  clientPath,\n  \`body: JSON.stringify({ action, input, ...(actor ? { actor } : {}) })\`,\n  \`body: JSON.stringify({ action, input, ...protectedActorEnvelope(actor) })\`,\n);`;
const after = `replaceExactCount(\n  clientPath,\n  \`body: JSON.stringify({ action, input, ...(actor ? { actor } : {}) })\`,\n  \`body: JSON.stringify({ action, input, ...protectedActorEnvelope(actor) })\`,\n  2,\n);`;
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`shared envelope transform call expected once, found ${count}`);
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("Phase 31.28 transform corrected for two shared actor envelopes.");
