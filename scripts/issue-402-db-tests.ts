import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { POST as catalogPost } from "../app/api/catalog/route";
import { POST as interactionPost } from "../app/api/interaction/route";
import { POST as planningPost } from "../app/api/planning-lifecycle/route";
import { auth } from "../src/auth/server";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Stage D0 DB acceptance.`);
  return value;
}

const databaseUrl = requiredEnv("DATABASE_URL");
const adminPassword = requiredEnv("ORGANY_BOOTSTRAP_ADMIN_PASSWORD");
const priestPassword = requiredEnv("ORGANY_BOOTSTRAP_PRIEST_PASSWORD");
const organistPassword = requiredEnv("ORGANY_BOOTSTRAP_ORGANIST_PASSWORD");
requiredEnv("BETTER_AUTH_SECRET");
requiredEnv("BETTER_AUTH_URL");

function apiRequest(path: string, body: unknown, cookie?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function signIn(username: string, password: string): Promise<string> {
  const response = await auth.api.signInUsername({ body: { username, password }, asResponse: true });
  assert.equal(response.status, 200, `${username} acceptance sign-in must succeed.`);
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  const cookie = values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  assert.ok(cookie, `${username} sign-in must return a session cookie.`);
  return cookie;
}

async function expectUnauthenticated(response: Response, label: string) {
  assert.equal(response.status, 401, `${label} must reject anonymous access.`);
  const body = await response.json() as { error?: { code?: string } };
  assert.equal(body.error?.code, "unauthenticated", `${label} must fail specifically as unauthenticated.`);
}

async function main() {
  const db = new Pool({ connectionString: databaseUrl });
  const marker = `d0-${process.pid}-${Date.now()}`;
  let lifecyclePlanId: string | undefined;
  let lifecycleContextId: number | undefined;
  let originalOrganistMonths = 2;

  try {
    await seedDemoInteractionKnowledge(db);

    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileSync(npm, ["run", "db:bootstrap:auth"], { env: process.env, stdio: "inherit" });

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

    const [adminCookie, priestCookie, organistCookie] = await Promise.all([
      signIn("admin", adminPassword),
      signIn("priest", priestPassword),
      signIn("organist", organistPassword),
    ]);

    const adminMutation = await catalogPost(apiRequest("/api/catalog", {
      action: "savePerson",
      input: {
        person: {
          id: marker,
          displayName: "Stage D0 Admin Persistence",
          active: true,
          priest: true,
          organist: false,
        },
      },
      actor: { role: "admin" },
    }, adminCookie));
    assert.equal(adminMutation.status, 200, "Admin must retain protected Catalog persistence.");
    const adminMutationBody = await adminMutation.json() as { success?: boolean };
    assert.equal(adminMutationBody.success, true);
    assert.equal(Number((await db.query("select count(*)::int n from catalog_persons where id=$1", [marker])).rows[0].n), 1);

    const saveWorking = await planningPost(apiRequest("/api/planning-lifecycle", {
      action: "saveWorkingSet",
      input: {
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
      },
      actor: { role: "priest" },
    }, priestCookie));
    assert.equal(saveWorking.status, 200, "Priest must retain Working-plan persistence.");
    const saved = await saveWorking.json() as { success?: boolean; value?: { id?: string } };
    assert.equal(saved.success, true);
    lifecyclePlanId = saved.value?.id;
    assert.ok(lifecyclePlanId, "Priest Working save must return an id.");

    const contextRow = await db.query("select service_context_id from service_sets where id=$1", [Number(lifecyclePlanId)]);
    lifecycleContextId = Number(contextRow.rows[0]?.service_context_id);
    assert.ok(Number.isInteger(lifecycleContextId) && lifecycleContextId > 0);

    const finalize = await planningPost(apiRequest("/api/planning-lifecycle", {
      action: "finalizeWorkingSet",
      input: { workingSetId: lifecyclePlanId },
      actor: { role: "priest" },
    }, priestCookie));
    assert.equal(finalize.status, 200, "Priest must retain current Finalize authorization.");
    const finalized = await finalize.json() as { success?: boolean; value?: { status?: string } };
    assert.equal(finalized.success, true);
    assert.equal(finalized.value?.status, "final");

    const before = await db.query("select melody_protection_months from catalog_persons where id='demo-organist'");
    originalOrganistMonths = Number(before.rows[0]?.melody_protection_months ?? 2);
    const targetMonths = originalOrganistMonths === 3 ? 4 : 3;

    const organistMutation = await interactionPost(apiRequest("/api/interaction", {
      action: "setOwnMelodyProtection",
      input: { months: targetMonths },
      actor: { role: "organist" },
    }, organistCookie));
    assert.equal(organistMutation.status, 200, "Organist must retain own Melody Protection persistence.");
    const organistBody = await organistMutation.json() as { success?: boolean; value?: { months?: number } };
    assert.equal(organistBody.success, true);
    assert.equal(organistBody.value?.months, targetMonths);
    assert.equal(Number((await db.query("select melody_protection_months from catalog_persons where id='demo-organist'")).rows[0].melody_protection_months), targetMonths);

    console.log("Issue 402 Stage D0 DB/auth/write-boundary acceptance passed.");
  } finally {
    await db.query("update catalog_persons set melody_protection_months=$1 where id='demo-organist'", [originalOrganistMonths]).catch(() => undefined);
    if (lifecyclePlanId) await db.query("delete from service_sets where id=$1", [Number(lifecyclePlanId)]).catch(() => undefined);
    if (lifecycleContextId) await db.query("delete from service_contexts where id=$1", [lifecycleContextId]).catch(() => undefined);
    await db.query("delete from audit_events where object_ref=$1 or (after_state::text like $2)", [marker, `%${marker}%`]).catch(() => undefined);
    await db.query("delete from catalog_persons where id=$1", [marker]).catch(() => undefined);
    await db.end();
  }
}

main().catch((error) => {
  console.error("Issue 402 Stage D0 DB/auth/write-boundary acceptance failed.");
  console.error(error);
  process.exitCode = 1;
});
