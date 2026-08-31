import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveReferenceMelodyPartition,
  normalizeReferenceMelodyEdge,
  ReferenceMelodyEdgeInvariantError,
} from "../src/application/reference-melody-edge";

const songs = [
  { id: "czech:1", language: "czech" as const, canonicalNumber: 1 },
  { id: "czech:2", language: "czech" as const, canonicalNumber: 2 },
  { id: "polish:1", language: "polish" as const, canonicalNumber: 1 },
  { id: "polish:2", language: "polish" as const, canonicalNumber: 2 },
];

assert.deepEqual(normalizeReferenceMelodyEdge("polish:2", "czech:1"), {
  songAId: "czech:1",
  songBId: "polish:2",
});
assert.throws(
  () => normalizeReferenceMelodyEdge("czech:1", "czech:1"),
  (error: unknown) => error instanceof ReferenceMelodyEdgeInvariantError && /itself/.test(error.message),
);

const partition = deriveReferenceMelodyPartition(songs, [
  { songAId: "czech:2", songBId: "polish:1" },
  { songAId: "czech:1", songBId: "czech:2" },
]);
assert.equal(partition.classCount, 2);
assert.equal(partition.classBySongId.get("czech:1"), "reference-melody:czech:1");
assert.equal(partition.classBySongId.get("czech:2"), "reference-melody:czech:1");
assert.equal(partition.classBySongId.get("polish:1"), "reference-melody:czech:1");
assert.equal(partition.classBySongId.get("polish:2"), "reference-melody:polish:2");

assert.throws(
  () => deriveReferenceMelodyPartition(songs, [
    { songAId: "czech:1", songBId: "czech:2" },
    { songAId: "czech:2", songBId: "czech:1" },
  ]),
  /Duplicate Reference melody edge/,
);
assert.throws(
  () => deriveReferenceMelodyPartition(songs, [{ songAId: "czech:1", songBId: "polish:999" }]),
  /outside the Reference catalog/,
);

const migration = readFileSync("drizzle/0020_reference_melody_edges.sql", "utf8");
const schema = readFileSync("src/db/schema/index.ts", "utf8");
const melody = readFileSync("src/application/reference-melody.ts", "utf8");
const backfill = readFileSync("scripts/production-reference-melody-edge-backfill.ts", "utf8");
const route = readFileSync("app/api/interaction/route.ts", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const runtimeClients = readFileSync("app/planning-runtime-clients.ts", "utf8");

assert.match(migration, /CREATE TABLE "reference_melody_edges"/);
assert.match(migration, /CHECK \("song_a_id" < "song_b_id"\)/);
assert.match(migration, /CREATE UNIQUE INDEX "reference_melody_edges_pair_idx"/);
assert.match(schema, /export const referenceMelodyEdges = pgTable\("reference_melody_edges"/);

assert.match(melody, /recomputeReferenceMelodyPartition/);
assert.match(melody, /knowledge\.melody\.edge\.add/);
assert.match(melody, /knowledge\.melody\.edge\.remove/);
assert.match(melody, /knowledge\.melody\.merge/);
assert.doesNotMatch(melody, /update reference_song_melody_memberships set class_id=\$1.*where class_id=\$2/);

assert.match(backfill, /Current persisted Reference melody partition/);
assert.match(backfill, /Persistent Reference melody edges are neither empty nor the exact authoritative 245-edge set/);
assert.match(backfill, /insert into reference_melody_edges/);
assert.doesNotMatch(backfill, /update reference_song_melody_memberships/i);
assert.doesNotMatch(backfill, /insert into reference_organist_repertoire/i);

assert.match(route, /case "getReferenceMelodyEdge"/);
assert.match(route, /case "addReferenceMelodyEdge"/);
assert.match(route, /case "removeReferenceMelodyEdge"/);
assert.match(runtimeClients, /async getReferenceMelodyEdge/);
assert.match(runtimeClients, /async addReferenceMelodyEdge/);
assert.match(runtimeClients, /async removeReferenceMelodyEdge/);
assert.doesNotMatch(planning, />Add melody edge<|>Remove melody edge</);

console.log("Issue 291 Stage 5 persistent Reference melody-edge core coverage passed.");
