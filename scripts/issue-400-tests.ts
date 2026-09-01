import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  InMemoryCatalogRepository,
  getEligiblePersonDefault,
} from "../src/application/catalog";
import { getDraftPeopleDefaults } from "../src/planning-lifecycle/ui-session";
import type { CompletedServiceRecord } from "../src/application/planning-lifecycle";

async function main() {
  const catalog = new InMemoryCatalogRepository();

  assert.deepEqual(
    await getEligiblePersonDefault(catalog, { displayName: "Demo Priest" }, "priest"),
    { id: "demo-priest", displayName: "Demo Priest" },
    "Historical Completed Priest without an id must resolve by exact active catalog name.",
  );

  assert.deepEqual(
    await getEligiblePersonDefault(catalog, { id: "stale-priest-id", displayName: "Demo Priest" }, "priest"),
    { id: "demo-priest", displayName: "Demo Priest" },
    "A stale historical Priest id must fall back to the exact stored name.",
  );

  assert.deepEqual(
    await getEligiblePersonDefault(catalog, { displayName: "Demo Organist" }, "organist"),
    { id: "demo-organist", displayName: "Demo Organist" },
    "Priest and Organist must use identical fallback semantics.",
  );

  assert.equal(
    await getEligiblePersonDefault(catalog, { displayName: "Demo" }, "priest"),
    undefined,
    "Partial names must never be guessed.",
  );

  await catalog.upsertPerson({
    id: "duplicate-demo-priest",
    displayName: "Demo Priest",
    active: true,
    priest: true,
    organist: false,
  });
  assert.equal(
    await getEligiblePersonDefault(catalog, { displayName: "Demo Priest" }, "priest"),
    undefined,
    "Ambiguous exact names must never be guessed.",
  );

  assert.equal(
    await getEligiblePersonDefault(catalog, { displayName: "Anonymous" }, "priest"),
    undefined,
    "Anonymous must remain Anonymous.",
  );

  const newer: CompletedServiceRecord = {
    id: "completed-2",
    sourceFinalSetId: "final-2",
    completedAt: new Date("2026-08-31T10:00:00Z"),
    serviceContext: {
      serviceDate: "2026-08-31",
      serviceTime: "10:00",
      language: "czech",
      priest: { displayName: "Demo Priest" },
      organist: { id: "demo-organist", displayName: "Demo Organist" },
    },
    set: { status: "final", language: "czech", rows: [{ note: "newest" }] },
  };
  const older: CompletedServiceRecord = {
    ...newer,
    id: "completed-1",
    sourceFinalSetId: "final-1",
    completedAt: new Date("2026-08-24T10:00:00Z"),
    serviceContext: {
      ...newer.serviceContext,
      serviceDate: "2026-08-24",
      priest: { id: "demo-both", displayName: "Demo Priest Organist" },
      organist: { id: "demo-both", displayName: "Demo Priest Organist" },
    },
  };
  const raw = getDraftPeopleDefaults([older, newer]);
  assert.deepEqual(raw.priest, newer.serviceContext.priest);
  assert.deepEqual(raw.organist, newer.serviceContext.organist);

  const route = readFileSync("app/api/planning-lifecycle/route.ts", "utf8");
  assert.match(route, /getEligiblePersonDefault\(catalog, rawDefaults\.priest, "priest"\)/);
  assert.match(route, /getEligiblePersonDefault\(catalog, rawDefaults\.organist, "organist"\)/);

  const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
  assert.match(client, /resolveEligibleDraftPerson\(defaults\.priest, "priest"\)/);
  assert.match(client, /resolveEligibleDraftPerson\(defaults\.organist, "organist"\)/);
  assert.match(client, /person\.displayName === displayName/);

  console.log("Issue 400 Completed Service Priest/Organist default acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
