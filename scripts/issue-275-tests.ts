import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("app/catalog-workspace.tsx", "utf8");
const shell = readFileSync("app/planning-lifecycle-client.tsx", "utf8");

for (const required of [
  'actor.role === "organist" && actor.personId === organistPersonId',
  'viewMode === "melodies" && availabilityMode === "available"',
  'viewMode === "songs" && availabilityMode === "unavailable"',
  'window.confirm',
  'freshAvailableClass',
  'setRepertoireMembership(',
  'actor.role === "admin" ? organistPersonId : undefined',
  'await reloadCandidates()',
  '<MelodyClassDetail',
  'className="candidate-inline-detail"',
  '<strong>{candidate.number}</strong><span>{candidate.title}</span>',
]) assert.ok(workspace.includes(required), `Catalog step 3 missing contract: ${required}`);

assert.ok(!workspace.includes('disabled={actor.role === "organist"}'), "Organists must be able to inspect another organist read-only.");
assert.ok(!workspace.includes('Selected organist"} · ${availabilityMode}'), "Catalog must not show the organist/availability info string.");
assert.ok(shell.includes("setRepertoireMembership={(referenceSongId, organistPersonId, active) => interactionClient.setReferenceRepertoireMembership"));
assert.ok(!workspace.includes("setReferenceMelody"), "Step 3 must not expose melody-edge mutation.");
assert.ok(!workspace.includes("mergeReferenceMelodyClasses"), "Step 3 must not expose melody merge mutation.");
assert.ok(!workspace.includes("serviceDate"), "Catalog repertoire management must stay independent of Planning date.");
console.log("Issue 275 Catalog repertoire management coverage passed.");
