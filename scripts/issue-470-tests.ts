import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
} from "../src/application/planning-lifecycle";
import { InMemoryCatalogRepository } from "../src/application/catalog";

async function main() {
  const plans = new InMemoryPlanningSetRepository();
  const completed = new InMemoryCompletedServiceRecordRepository(plans);
  const catalog = new InMemoryCatalogRepository();
  const service = new PlanningLifecycleService({
    planningSets: plans,
    completedServiceRecords: completed,
    catalog,
    enforceCatalogSelections: false,
  });

  const context = {
    serviceDate: "2026-10-18",
    serviceTime: "10:00",
    language: "czech" as const,
    priest: { id: "priest-1", displayName: "Pastor One" },
    organist: { id: "organist-1", displayName: "Jaroslav Drobek" },
  };
  const created = await plans.saveWorkingSet(
    { status: "working", language: "czech", rows: [{ note: "Prelude" }] },
    context,
  );
  assert.equal(created.organistReviewed, false);

  const deniedPriest = await service.setWorkingSetReviewed({
    role: "priest",
    organistPersonId: "organist-1",
    workingSetId: created.id,
    reviewed: true,
  });
  assert.equal(deniedPriest.success, false);
  if (!deniedPriest.success) assert.equal(deniedPriest.error.code, "permissionDenied");

  const deniedOtherOrganist = await service.setWorkingSetReviewed({
    role: "organist",
    organistPersonId: "organist-2",
    workingSetId: created.id,
    reviewed: true,
  });
  assert.equal(deniedOtherOrganist.success, false);
  if (!deniedOtherOrganist.success) assert.equal(deniedOtherOrganist.error.code, "permissionDenied");

  const reviewed = await service.setWorkingSetReviewed({
    role: "organist",
    organistPersonId: "organist-1",
    workingSetId: created.id,
    reviewed: true,
  });
  assert.equal(reviewed.success, true);
  if (!reviewed.success) throw new Error(reviewed.error.message);
  assert.equal(reviewed.value.organistReviewed, true);

  const withdrawn = await service.setWorkingSetReviewed({
    role: "organist",
    organistPersonId: "organist-1",
    workingSetId: created.id,
    reviewed: false,
  });
  assert.equal(withdrawn.success, true);
  if (!withdrawn.success) throw new Error(withdrawn.error.message);
  assert.equal(withdrawn.value.organistReviewed, false);

  await service.setWorkingSetReviewed({
    role: "organist",
    organistPersonId: "organist-1",
    workingSetId: created.id,
    reviewed: true,
  });
  const savedAgain = await plans.saveWorkingSet(
    { status: "working", language: "czech", rows: [{ note: "Changed prelude" }] },
    context,
    created.id,
  );
  assert.equal(savedAgain.organistReviewed, false, "normal Working save must reset Reviewed");

  const ui = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
  const schema = readFileSync("src/db/schema/index.ts", "utf8");
  const route = readFileSync("app/api/planning-lifecycle/route.ts", "utf8");
  const migration = readFileSync("drizzle/0024_organist_reviewed.sql", "utf8");

  assert.match(schema, /organistReviewed: boolean\("organist_reviewed"\)\.notNull\(\)\.default\(false\)/);
  assert.match(migration, /ADD COLUMN "organist_reviewed" boolean DEFAULT false NOT NULL/);
  assert.match(route, /"setWorkingSetReviewed"/);
  assert.match(route, /organistPersonId: actor\.personId/);
  assert.match(ui, /persistedSet\.serviceContext\.organist\.id === activeActor\.personId/);
  assert.match(ui, /role="switch"/);
  assert.match(ui, /aria-checked=\{Boolean\(persistedSet\?\.organistReviewed\)\}/);
  assert.match(ui, /Reviewed by \{persistedSet\.serviceContext\.organist\.displayName\}/);
  assert.match(ui, /planningLifecycleService\.setWorkingSetReviewed/);
  assert.match(ui, /data-guide-hint="planning\.lifecycle\.reviewed"/);

  console.log("Issue #470 Organist Reviewed acceptance: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
