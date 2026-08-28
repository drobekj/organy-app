import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("app/catalog-workspace.tsx", "utf8");
const planning = readFileSync("src/planning-lifecycle/candidate-list.tsx", "utf8");

assert.ok(workspace.includes('const effectiveOrganistPersonId = organistPersonId'), "Catalog organist selection must stay independent of actor role for read-only browsing.");
assert.ok(!workspace.includes('disabled={actor.role === "organist"}'), "Organists must be able to inspect any organist repertoire.");
assert.ok(workspace.includes('actor.personId === effectiveOrganistPersonId'), "Organist mutation must remain restricted to own repertoire.");
assert.ok(workspace.includes('viewMode === "melodies" && availabilityMode === "available"'), "Remove must be exposed only for Available Melodies.");
assert.ok(workspace.includes('viewMode === "songs" && availabilityMode === "unavailable"'), "Add must be exposed only for Unavailable Songs.");
assert.ok(!workspace.includes('`${selectedOrganist?.displayName ?? "Selected organist"} · ${availabilityMode}`'), "Availability info string must be removed.");
assert.ok(workspace.includes('<strong>{candidate.number}</strong><span>{candidate.title}</span>'), "Catalog candidate line must display only number and title.");
assert.ok(!workspace.includes('candidate.title} · {candidate.language} · {candidate.signal}'), "Catalog row must not expose language/signal metadata.");

for (const shared of [
  'className="candidate-inline-detail"',
  'borderRadius: "0.65rem"',
  'height: "2rem"',
  'minWidth: "4.7rem"',
  'padding: "0 0.65rem"',
  'aria-label={`Show melody detail for ${candidate.number} ${candidate.title}`}',
]) {
  assert.ok(planning.includes(shared), `Planning Detail contract missing ${shared}`);
  assert.ok(workspace.includes(shared), `Catalog Detail must inherit Planning contract ${shared}`);
}

console.log("Issue 279 corrective Catalog repertoire UX coverage passed.");
