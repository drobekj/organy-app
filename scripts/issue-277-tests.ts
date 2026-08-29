import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("src/planning-lifecycle/candidate-list.tsx", "utf8");

assert.match(workspace, /viewMode === "melodies" && availabilityMode === "available"[\s\S]*?\? "Remove"/);
assert.match(workspace, /viewMode === "songs" && availabilityMode === "unavailable"[\s\S]*?\? "Add"/);
assert.doesNotMatch(workspace, /disabled=\{actor\.role === "organist"\}/);
assert.match(workspace, /actor\.role === "organist" && actor\.personId === organistPersonId/);
assert.match(workspace, /<option value="">Anonymous<\/option>/);
assert.ok(!workspace.includes("· ${availabilityMode}"), "Catalog must not render the organist/availability info string.");
assert.match(workspace, /<strong>\{candidate\.number\}<\/strong><span>\{candidate\.title\}<\/span>/);
assert.doesNotMatch(workspace, /candidate\.title} · \{candidate\.language} · \{candidate\.signal}/);
assert.match(workspace, /<MelodyClassDetail/);
assert.match(workspace, /className="candidate-inline-detail"/);
for (const token of [
  'borderRadius: "0.65rem"',
  'height: "2rem"',
  'minWidth: "4.7rem"',
  'padding: "0 0.65rem"',
]) {
  assert.ok(workspace.includes(token), `Catalog Detail button must follow Planning rule: ${token}`);
  assert.ok(planning.includes(token), `Planning Detail rule unexpectedly missing: ${token}`);
}
assert.ok(workspace.includes("Show melody detail for ${candidate.number} ${candidate.title}"));
assert.ok(planning.includes("Show melody detail for ${candidate.number} ${candidate.title}"));
assert.doesNotMatch(workspace, /<CatalogPreferencePanel/, "Catalog must not render a standalone preference panel.");
console.log("Issue 277 corrective Catalog HUMAN refinement coverage passed.");
