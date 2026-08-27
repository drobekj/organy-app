import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/admin/audit-history/page.tsx", "utf8");
const css = readFileSync("app/issue-253-audit-history.css", "utf8");
const view = readFileSync("src/application/audit-history-view.ts", "utf8");

assert.match(page, /audit-service-primary/, "service context must render in a dedicated primary row");
assert.match(page, /audit-service-secondary/, "rows + lifecycle must render in a dedicated secondary row");
assert.match(page, /field\.key === "rows"/, "rows must remain isolated on the second line");
assert.match(page, /field\.key === "lifecycle"/, "lifecycle must remain isolated on the second line");
assert.match(page, /audit-lifecycle-slot/, "lifecycle must have its own right-aligned slot");

assert.match(css, /\.audit-state-line\s*\{[\s\S]*grid-template-columns:\s*3\.15rem minmax\(0, 1fr\)/, "before/after label and value columns must stay aligned");
assert.match(css, /\.audit-service-state\s*\{[\s\S]*width:\s*100%/, "service block must span the full audit value field");
assert.match(css, /\.audit-service-secondary\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/, "secondary row must keep rows left and lifecycle right");
assert.match(css, /\.audit-lifecycle-slot\s*\{[\s\S]*justify-self:\s*end/, "lifecycle must remain right-aligned");

assert.match(view, /notePresent \? "\+t" : ""/, "row text-note presence must use +t suffix");
assert.doesNotMatch(view, /"_t"/, "legacy _t suffix must be removed");

console.log("Issue 255 Audit History row-layout acceptance passed.");
