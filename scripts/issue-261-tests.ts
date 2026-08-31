import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/audit-history.css", "utf8");

assert.match(
  css,
  /\.audit-event-list\s*\{[\s\S]*gap:\s*0\.5rem/,
  "Audit History records must have slightly increased vertical spacing",
);
assert.match(
  css,
  /\.audit-event\s*\{[\s\S]*gap:\s*0\.16rem/,
  "internal Audit History card density must remain unchanged",
);

console.log("Issue 261 Audit History record spacing acceptance passed.");
