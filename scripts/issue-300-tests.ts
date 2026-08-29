import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const serviceCss = readFileSync("app/service-context-minimal.css", "utf8");
const antiphonField = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const workspaceCss = readFileSync("app/issue-238-workspace.css", "utf8");

// Catalog context peer labels use the same muted label color as Organist/Language.
assert.match(globals, /\.catalog-context-label \{[\s\S]*?color: var\(--muted\);[\s\S]*?font-weight: 600;/);

// Planning header is structurally above Service Context.
const headerIndex = planning.indexOf('className="planning-context-header"');
const infoIndex = planning.indexOf('className="planning-context-info"', headerIndex);
const slotIndex = planning.indexOf('className="planning-melody-protection-slot"', headerIndex);
const protectionIndex = planning.indexOf("<NonRepetitionPeriodPanel", slotIndex);
const serviceContextIndex = planning.indexOf('className="field-group planning-service-context"');
assert.ok(headerIndex >= 0 && infoIndex > headerIndex && slotIndex > infoIndex && protectionIndex > slotIndex && serviceContextIndex > protectionIndex);

// The slot is unconditional; only its content is role-gated.
const headerFragment = planning.slice(headerIndex, serviceContextIndex);
assert.match(headerFragment, /className="planning-melody-protection-slot"/);
assert.match(headerFragment, /selectedRole === "admin" && \(\s*<NonRepetitionPeriodPanel/);
assert.doesNotMatch(headerFragment, /selectedRole !== "admin"/);

// Status/opened-record information is reserved to the left header area.
assert.match(headerFragment, /status status-\$\{saveState\}/);
assert.match(headerFragment, /Opened \{formatPlanningSetSummary\(persistedSet\)\}/);
assert.match(headerFragment, /Opened \{formatCompletedRecordSummary\(completedRecord\)\}/);
assert.match(planning, /workspace !== "planning" && persistedSet/);
assert.match(planning, /workspace !== "planning" && completedRecord/);

// Fixed geometry: stable height, fixed right width, aligned right edge.
assert.match(globals, /\.planning-context-header \{[\s\S]*?--planning-protection-height: 6\.5rem;[\s\S]*?--planning-protection-width: calc\(33\.333333% \+ 0\.067rem\);[\s\S]*?grid-template-columns: minmax\(0, 1fr\) var\(--planning-protection-width\);/);
assert.match(globals, /\.planning-context-info \{[\s\S]*?height: var\(--planning-protection-height\);/);
assert.match(globals, /\.planning-melody-protection-slot \{[\s\S]*?height: var\(--planning-protection-height\);[\s\S]*?justify-self: end;[\s\S]*?width: var\(--planning-protection-width\);/);
assert.match(globals, /\.melody-protection-panel \{[\s\S]*?border: 1px solid var\(--border\);[\s\S]*?border-radius: 1rem;[\s\S]*?height: 100%;[\s\S]*?width: 100%;/);
assert.match(globals, /\.melody-protection-control select \{[\s\S]*?width: 100%;/);

// Language remains the two-of-six Service Context control used as the width reference.
assert.match(serviceCss, /label:nth-of-type\(3\)[\s\S]*?grid-column: span 2;/);

// Every explicit alert gets the established visual box.
assert.match(globals, /\[role="alert"\] \{[\s\S]*?background: #fef3f2;[\s\S]*?border: 1px solid var\(--danger\);[\s\S]*?border-radius: 0\.65rem;[\s\S]*?color: var\(--danger\);/);
assert.match(antiphonField, /className="field-help inline-error" role="alert"/);
assert.match(planning, /<p className="error-summary" role="alert">\s*\{serviceError\.message\}/);

// Red validation text is not a free-floating alert: its row receives an alert border/fill.
assert.match(planning, /planningAlertConflict[\s\S]*?planning-alert-row/);
assert.match(workspaceCss, /\.planning-alert-row \{[\s\S]*?background: #fef3f2;[\s\S]*?border: 3px solid var\(--danger\);/);

function collectTsx(dir: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...collectTsx(path));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) paths.push(path);
  }
  return paths;
}

const alertClass = /(inline-error|error-summary|auth-error|service-antiphon-list-error|reference-song-list-error|candidate-list-error)/;
for (const path of [...collectTsx("app"), ...collectTsx("src")]) {
  const lines = readFileSync(path, "utf8").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!alertClass.test(line)) continue;
    const context = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join("\n");
    assert.match(context, /role="alert"/, `${path}:${index + 1} alert-styled error must expose role="alert"`);
  }
}

console.log("Issue 300 Planning header and alert visual consistency coverage passed.");
