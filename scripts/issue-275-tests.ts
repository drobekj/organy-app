import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("app/catalog-workspace.tsx", "utf8");
const shell = readFileSync("app/planning-lifecycle-client.tsx", "utf8");

for (const required of [
  'actor.role === "organist" ? (actor.personId ?? "") : organistPersonId',
  'disabled={actor.role === "organist"}',
  'actor.role === "admin" && Boolean(effectiveOrganistPersonId)',
  'availabilityMode === "available" ? "Remove" : "Add"',
  'window.confirm',
  'freshAvailableClass',
  'availabilityMode: "available"',
  'availabilityMode: "unavailable"',
  'setRepertoireMembership(',
  'actor.role === "admin" ? effectiveOrganistPersonId : undefined',
  'setSelectedDetail(undefined)',
  'await reloadCandidates()',
]) assert.ok(workspace.includes(required), `Catalog step 3 missing contract: ${required}`);

assert.ok(shell.includes("setRepertoireMembership={(referenceSongId, organistPersonId, active) => interactionClient.setReferenceRepertoireMembership"));
assert.ok(!workspace.includes("setReferenceMelody"), "Step 3 must not expose melody-edge mutation.");
assert.ok(!workspace.includes("mergeReferenceMelodyClasses"), "Step 3 must not expose melody merge mutation.");
assert.ok(!workspace.includes("serviceDate"), "Catalog repertoire management must stay independent of Planning date.");
console.log("Issue 275 Catalog repertoire management coverage passed.");
