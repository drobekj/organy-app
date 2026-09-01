import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { CatalogService, DrizzleCatalogRepository } from "../src/application/catalog";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { createDbBackedPlanningLifecycleService } from "../src/application/planning-lifecycle";
import { PostgresNonRepetitionPeriodService } from "../src/application/postgres-non-repetition-period";
import type { ActorIdentity } from "../src/application/interaction-contracts";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("Issue 402 Stage D0 DB/auth/write-boundary acceptance skipped: DATABASE_URL is not set.");
} else {
  void main(databaseUrl).catch((error) => {
    console.error("Issue 402 Stage D0 DB/auth/write-boundary acceptance failed.");
    console.error(error);
    process.exitCode = 1;
  });
}

async function main(connectionString: string) {
  process.env.ORGANY_RUNTIME = "db";
  process.env.BETTER_AUTH_SECRET ||= "issue-402-d0-local-acceptance-secret-long-enough";
  process.env.BETTER_AUTH_URL ||= "http://127.0.0.1:3000";

  const [{ POST: catalogPost }, { POST: interactionPost }, { POST: planningPost }] = await Promise.all([
    import("../app/api/catalog/route"),
    import("../app/api/interaction/route"),
    import("../app/api/planning-lifecycle/route"),
  ]);

  const db = new Pool({ connectionString });
  const orm = drizzle(db, { schema });
  const marker = `d0-${process.pid}-${Date.now()}`;
  let lifecyclePlanId: string | undefined;
  let lifecycleContextId: number | undefined;
  let originalOrganistMonths = 2;

  const admin: ActorIdentity = { userId: `${marker}-admin`, displayName: "Stage D0 Admin", role: "admin" };
  const priest: ActorIdentity = { userId: `${marker}-priest`, displayName: "Stage D0 Priest", role: "priest" };
  const organist: ActorIdentity = { userId: "demo-organist-user", displayName: "Demo Organist User", role: "organist", personId: "demo-organist" };

  try {
    await seedDemoInteractionKnowledge(db);

    await expectUnauthenticated(await catalogPost(apiRequest("/api/catalog", {
      action: "listPeople",
      input: {},
      actor: { role: "admin" },
    })), "Production Catalog API");

    await expectUnauthenticated(await interactionPost(apiRequest("/api/interaction", {
      action: "listKnowledge",
      input: {},
      actor: { role: "admin" },
    })), "Production Interaction API");

    await expectUnauthenticated(await planningPost(apiRequest("/api/planning-lifecycle", {
      action: "listPlanningSets",
      input: {},
      actor: { role: "admin" },
    })), "Production Planning Lifecycle API");

    const catalog = new CatalogService(new DrizzleCatalogRepository(orm));
    const adminMutation = await catalog.savePerson({
      role: "admin",
      person: {
        id: marker,
        displayName: "Stage D0 Admin Persistence",
        active: true,
        priest: true,
        organist: false,
      },
    });
    assert.equal(adminMutation.success, true, "Admin must retain current persistent Catalog authorization.");
    assert.equal(Number((await db.query("select count(*)::int n from catalog_persons where id=$1", [marker])).rows[0].n), 1);

    const lifecycle = createDbBackedPlanningLifecycleService({
      db: orm,
      schema,
    });
    const saveWorking = await lifecycle.saveWorkingSet({
      role: priest.role,
      serviceContext: {
        serviceDate: "2099-12-31",
        serviceTime: "10:00",
        language: "czech",
        priest: { id: "demo-priest", displayName: "Demo Priest" },
        organist: { id: "demo-organist", displayName: "Demo Organist" },
        melodyProtectionMonths: 2,
        note: marker,
      },
      set: {
        status: "working",
        language: "czech",
        rows: [{ note: "Stage D0 Priest lifecycle acceptance" }],
      },
    });
    assert.equal(saveWorking.success, true, "Priest must retain Working-plan persistence.");
    lifecyclePlanId = saveWorking.value.id;

    const contextRow = await db.query("select service_context_id from service_sets where id=$1", [Number(lifecyclePlanId)]);
    lifecycleContextId = Number(contextRow.rows[0]?.service_context_id);
    assert.ok(Number.isInteger(lifecycleContextId) && lifecycleContextId > 0);

    const finalize = await lifecycle.finalizeWorkingSet({
      role: priest.role,
      workingSetId: lifecyclePlanId,
    });
    assert.equal(finalize.success, true, "Priest must retain current Finalize authorization.");
    assert.equal(finalize.value.status, "final");

    const before = await db.query("select melody_protection_months from catalog_persons where id='demo-organist'");
    originalOrganistMonths = Number(before.rows[0]?.melody_protection_months ?? 2);
    const targetMonths = originalOrganistMonths === 3 ? 4 : 3;
    const melodyProtection = new PostgresNonRepetitionPeriodService(db);
    const organistMutation = await melodyProtection.setOwnOrganistMinimum(organist, targetMonths);
    assert.equal(organistMutation.success, true, "Organist must retain own Melody Protection persistence.");
    assert.equal(organistMutation.value.months, targetMonths);
    assert.equal(Number((await db.query("select melody_protection_months from catalog_persons where id='demo-organist'")).rows[0].melody_protection_months), targetMonths);

    console.log("Issue 402 Stage D0 DB/auth/write-boundary acceptance passed.");
  } finally {
    await db.query("update catalog_persons set melody_protection_months=$1 where id='demo-organist'", [originalOrganistMonths]).catch(() => undefined);
    if (lifecyclePlanId) await db.query("delete from service_sets where id=$1", [Number(lifecyclePlanId)]).catch(() => undefined);
    if (lifecycleContextId) await db.query("delete from service_contexts where id=$1", [lifecycleContextId]).catch(() => undefined);
    await db.query("delete from catalog_persons where id=$1", [marker]).catch(() => undefined);
    await db.end();
  }
}

function apiRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectUnauthenticated(response: Response, label: string) {
  assert.equal(response.status, 401, `${label} must reject anonymous access.`);
  const body = await response.json() as { error?: { code?: string } };
  assert.equal(body.error?.code, "unauthenticated", `${label} must fail specifically as unauthenticated.`);
}
