import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { DrizzleCatalogRepository } from "../src/application/catalog";
import {
  createDbBackedPlanningLifecycleService,
  DrizzleCompletedServiceRecordRepository,
  DrizzlePlanningSetRepository,
} from "../src/application/planning-lifecycle";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for issue 455 acceptance.");

async function main(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  const marker = `issue-455-${randomUUID()}`;
  const priestId = `${marker}-priest`;
  const organistId = `${marker}-organist`;
  const catalog = new DrizzleCatalogRepository(db);
  const lifecycle = createDbBackedPlanningLifecycleService({ db, schema });
  const plans = new DrizzlePlanningSetRepository({ db, schema });
  const completed = new DrizzleCompletedServiceRecordRepository({ db, schema });

  let activePlanId: string | undefined;
  let legacyPlanId: string | undefined;
  let completedRecordId: string | undefined;

  try {
    await catalog.upsertPerson({ id: priestId, displayName: "Arnold", active: true, priest: true, organist: false });
    await catalog.upsertPerson({ id: organistId, displayName: "Old Organist", active: true, priest: false, organist: true });

    const completedWorking = await saveWorking(`${marker}-completed`, "2026-01-04", "09:00");
    const finalized = await lifecycle.finalizeWorkingSet({ role: "priest", workingSetId: completedWorking.id });
    if (!finalized.success) throw new Error("fixture Working plan must finalize");
    const completion = await lifecycle.completeFinalSet({ role: "priest", finalSetId: finalized.value.id });
    if (!completion.success) throw new Error("fixture Final plan must complete");
    completedRecordId = completion.value.id;

    const active = await saveWorking(`${marker}-active`, "2026-10-04", "10:00");
    activePlanId = active.id;

    const legacy = await saveWorking(`${marker}-legacy`, "2026-10-11", "10:00");
    legacyPlanId = legacy.id;
    await pool.query(
      `update service_contexts
       set priest_id = null, priest_display_name = 'Legacy Priest',
           organist_id = null, organist_display_name = 'Legacy Organist'
       where note = $1`,
      [`${marker}-legacy`],
    );

    await catalog.upsertPerson({ id: priestId, displayName: "Emil", active: true, priest: true, organist: false });
    await catalog.upsertPerson({ id: organistId, displayName: "Current Organist", active: true, priest: false, organist: true });

    const reordered = await lifecycle.reorderRows({ role: "priest", workingSetId: activePlanId, rowOrder: [0] });
    if (!reordered.success) throw new Error("ordinary lifecycle mutation must remain valid after catalog rename");

    const activeRead = await plans.findById(activePlanId);
    assert.ok(activeRead, "active plan must remain readable after catalog rename");
    assert.deepEqual(activeRead.serviceContext.priest, { id: priestId, displayName: "Emil" });
    assert.deepEqual(activeRead.serviceContext.organist, { id: organistId, displayName: "Current Organist" });

    const completedBeforeUpdate = await completed.findById(completedRecordId);
    assert.ok(completedBeforeUpdate, "completed record must remain readable after catalog rename");
    await completed.update(completedRecordId, completedBeforeUpdate.serviceContext, completedBeforeUpdate.set);
    const completedRead = await completed.findById(completedRecordId);
    assert.ok(completedRead, "completed record must remain readable after a canonical-name round-trip update");
    assert.deepEqual(completedRead.serviceContext.priest, { id: priestId, displayName: "Emil" });
    assert.deepEqual(completedRead.serviceContext.organist, { id: organistId, displayName: "Current Organist" });

    const persistedSnapshots = await pool.query(
      `select note, priest_display_name, organist_display_name
       from service_contexts
       where note in ($1, $2)
       order by note`,
      [`${marker}-active`, `${marker}-completed`],
    );
    assert.equal(persistedSnapshots.rows.length, 2);
    for (const row of persistedSnapshots.rows) {
      assert.equal(row.priest_display_name, "Arnold", `${row.note}: canonical read must not rewrite priest snapshot`);
      assert.equal(row.organist_display_name, "Old Organist", `${row.note}: canonical read must not rewrite organist snapshot`);
    }

    const legacyRead = await plans.findById(legacyPlanId);
    assert.ok(legacyRead, "legacy plan must remain readable without stable person IDs");
    assert.deepEqual(legacyRead.serviceContext.priest, { displayName: "Legacy Priest" });
    assert.deepEqual(legacyRead.serviceContext.organist, { displayName: "Legacy Organist" });

    console.log("Issue 455 canonical Planning person-name DB acceptance: PASS");
  } finally {
    await pool.query("delete from completed_services where service_context_id in (select id from service_contexts where note like $1)", [`${marker}%`]).catch(() => undefined);
    await pool.query("delete from service_sets where service_context_id in (select id from service_contexts where note like $1)", [`${marker}%`]).catch(() => undefined);
    await pool.query("delete from service_contexts where note like $1", [`${marker}%`]).catch(() => undefined);
    await pool.query("delete from catalog_persons where id in ($1, $2)", [priestId, organistId]).catch(() => undefined);
    await pool.end();
  }

  async function saveWorking(note: string, serviceDate: string, serviceTime: string) {
    const result = await lifecycle.saveWorkingSet({
      role: "priest",
      serviceContext: {
        serviceDate,
        serviceTime,
        language: "czech",
        priest: { id: priestId, displayName: "Arnold" },
        organist: { id: organistId, displayName: "Old Organist" },
        melodyProtectionMonths: 2,
        note,
      },
      set: {
        status: "working",
        language: "czech",
        rows: [{ note: "Issue 455 person-name regression" }],
      },
    });
    if (!result.success) throw new Error(`fixture Working plan ${note} must save`);
    return result.value;
  }
}

void main(databaseUrl).catch((error: unknown) => {
  console.error("Issue 455 canonical Planning person-name DB acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
});
