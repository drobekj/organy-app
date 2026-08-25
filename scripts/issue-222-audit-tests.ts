import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { canReadAuditHistory } from "../src/application/audit-history";
import { POST as planningLifecyclePost } from "../app/api/planning-lifecycle/route";
import {
  DrizzlePlanningSetRepository,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../src/application/planning-lifecycle";
import type { ActorIdentity } from "../src/application/interaction-contracts";
import { useProtectedActorForAcceptance } from "../src/application/protected-actor";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 222 audit acceptance.");

  assert.equal(canReadAuditHistory(["admin"]), true, "admin may read audit history");
  assert.equal(canReadAuditHistory(["priest"]), false, "priest may not read audit history");
  assert.equal(canReadAuditHistory(["organist"]), false, "organist may not read audit history");
  assert.equal(canReadAuditHistory(["congregationMember"]), false, "congregation member may not read audit history");
  const auditPage = await readFile("app/admin/audit-history/page.tsx", "utf8");
  assert.match(auditPage, /canReadAuditHistory\(currentUser\.roles\)/, "admin page must use the tested visibility rule");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const dependencies: PlanningLifecycleDrizzleAdapterDependencies = {
    db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
    schema,
  };
  const planningSets = new DrizzlePlanningSetRepository(dependencies);
  const token = `${process.pid}-${Date.now()}`;
  const marker = `Issue 222 ${token}`;
  const actorUserId = `issue222-admin-${token}`;
  let actor: ActorIdentity = { userId: actorUserId, displayName: `${marker} Admin`, role: "admin" };
  const restoreActor = useProtectedActorForAcceptance(async () => actor);
  const previousRuntime = process.env.ORGANY_RUNTIME;
  process.env.ORGANY_RUNTIME = "db";
  let rollbackTriggerName: string | undefined;
  let rollbackFunctionName: string | undefined;

  try {
    const workingContext = {
      serviceDate: "2099-01-01",
      serviceTime: "10:00",
      language: "czech" as const,
      priest: { displayName: "Anonymous" },
      organist: { displayName: "Anonymous" },
      note: `${marker} working`,
    };
    const workingSet = {
      status: "working" as const,
      language: "czech" as const,
      rows: [{ note: `${marker} row 1` }, { note: `${marker} row 2` }],
    };

    const saveResponse = await planningLifecyclePost(requestFor("saveWorkingSet", {
      serviceContext: workingContext,
      set: workingSet,
    }));
    assert.equal(saveResponse.status, 200);
    const saveResult = await saveResponse.json() as { success: boolean; value?: { id: string }; error?: { code: string } };
    assert.equal(saveResult.success, true, "successful human mutation must succeed through the real DB route");
    assert.ok(saveResult.value?.id, "saved Working set id is required");
    const workingSetId = saveResult.value!.id;

    const humanEvents = await pool.query(
      `select actor_kind, actor_user_id, actor_display_name, actor_role, action, object_kind, object_ref, before_state, after_state
         from audit_events
        where actor_user_id = $1 and action = 'planning.working.save'`,
      [actorUserId],
    );
    assert.equal(humanEvents.rows.length, 1, "one successful logical human mutation creates exactly one audit event");
    assert.equal(humanEvents.rows[0].actor_kind, "human");
    assert.equal(humanEvents.rows[0].actor_display_name, actor.displayName);
    assert.equal(humanEvents.rows[0].actor_role, "admin");
    assert.equal(String(humanEvents.rows[0].object_ref), String(workingSetId));
    assert.equal(humanEvents.rows[0].before_state, null, "create action has no prior state");
    const createdState = humanEvents.rows[0].after_state as { id?: unknown } | null;
    assert.equal(String(createdState?.id), String(workingSetId), "event preserves meaningful created state");

    const persistedRows = await pool.query("select count(*)::int as count from service_set_rows where service_set_id = $1", [workingSetId]);
    assert.equal(persistedRows.rows[0].count, 2, "the audited action really persists multiple business rows");
    assert.equal(humanEvents.rows.length, 1, "multi-row persistence remains one logical audit event");

    actor = { ...actor, role: "congregationMember" };
    const deniedResponse = await planningLifecyclePost(requestFor("deletePlanningSet", { setId: workingSetId }));
    assert.equal(deniedResponse.status, 200);
    const deniedResult = await deniedResponse.json() as { success: boolean; error?: { code: string } };
    assert.equal(deniedResult.success, false);
    assert.equal(deniedResult.error?.code, "permissionDenied");
    const deniedEvents = await pool.query(
      "select count(*)::int as count from audit_events where actor_user_id = $1 and action = 'planning.plan.delete' and object_ref = $2",
      [actorUserId, workingSetId],
    );
    assert.equal(deniedEvents.rows[0].count, 0, "denied mutation creates no business audit event");

    actor = { ...actor, role: "admin" };
    const rollbackActorId = `issue222-rollback-${token}`;
    actor = { ...actor, userId: rollbackActorId, displayName: `${marker} Rollback Admin` };
    rollbackFunctionName = `issue222_fail_audit_${token}`.replace(/[^a-zA-Z0-9_]/g, "_");
    rollbackTriggerName = `${rollbackFunctionName}_trigger`;
    await pool.query(`create function ${rollbackFunctionName}() returns trigger language plpgsql as $$ begin if NEW.actor_user_id = '${rollbackActorId}' then raise exception 'issue-222-injected-audit-failure'; end if; return NEW; end $$`);
    await pool.query(`create trigger ${rollbackTriggerName} before insert on audit_events for each row execute function ${rollbackFunctionName}()`);
    const rollbackNote = `${marker} rollback-business`;
    const rollbackResponse = await planningLifecyclePost(requestFor("saveWorkingSet", {
      serviceContext: { ...workingContext, serviceDate: "2099-01-02", note: rollbackNote },
      set: workingSet,
    }));
    assert.equal(rollbackResponse.status, 500, "injected audit persistence failure reaches the route transaction");
    const rolledBackBusiness = await pool.query("select count(*)::int as count from service_contexts where note = $1", [rollbackNote]);
    assert.equal(rolledBackBusiness.rows[0].count, 0, "business mutation rolls back when its required audit event cannot persist");
    await pool.query(`drop trigger ${rollbackTriggerName} on audit_events`);
    await pool.query(`drop function ${rollbackFunctionName}()`);
    rollbackTriggerName = undefined;
    rollbackFunctionName = undefined;

    actor = { userId: actorUserId, displayName: `${marker} Admin`, role: "admin" };
    const pastFinal = await planningSets.saveFinalSet(
      { status: "final", language: "czech", rows: [{ note: `${marker} final row 1` }, { note: `${marker} final row 2` }] },
      {
        serviceDate: "2000-01-01",
        serviceTime: "10:00",
        language: "czech",
        priest: { displayName: `${marker} Auto Priest` },
        organist: { displayName: `${marker} Auto Organist` },
        note: `${marker} auto`,
      },
    );
    const reconcileResponse = await planningLifecyclePost(requestFor("listPlanningSets", {}));
    assert.equal(reconcileResponse.status, 200);
    const reconcileResult = await reconcileResponse.json() as { success: boolean };
    assert.equal(reconcileResult.success, true);
    const systemEvents = await pool.query(
      `select actor_kind, actor_user_id, actor_display_name, actor_role, action, before_state, after_state
         from audit_events
        where action = 'planning.final.autoComplete'
          and before_state->>'sourceFinalSetId' = $1`,
      [pastFinal.id],
    );
    assert.equal(systemEvents.rows.length, 1, "automatic Final → Completed reconciliation creates one audit event");
    assert.equal(systemEvents.rows[0].actor_kind, "system");
    assert.equal(systemEvents.rows[0].actor_user_id, null);
    assert.equal(systemEvents.rows[0].actor_display_name, null);
    assert.equal(systemEvents.rows[0].actor_role, null);

    const repeatResponse = await planningLifecyclePost(requestFor("listCompletedRecords", {}));
    assert.equal(repeatResponse.status, 200);
    const repeatedSystemEvents = await pool.query(
      "select count(*)::int as count from audit_events where action = 'planning.final.autoComplete' and before_state->>'sourceFinalSetId' = $1",
      [pastFinal.id],
    );
    assert.equal(repeatedSystemEvents.rows[0].count, 1, "repeat reconciliation is audit-idempotent");

    const sourceFiles = await sourceFilesUnder(["app", "src"]);
    for (const file of sourceFiles) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /\bdelete\s+from\s+audit_events\b|\bupdate\s+audit_events\b|\.delete\(\s*schema\.auditEvents\s*\)|\.update\(\s*schema\.auditEvents\s*\)/i, `normal application code must not update/delete audit rows: ${file}`);
    }

    console.log("Issue #222 audit history acceptance passed.");
  } finally {
    restoreActor();
    if (previousRuntime === undefined) delete process.env.ORGANY_RUNTIME;
    else process.env.ORGANY_RUNTIME = previousRuntime;
    if (rollbackTriggerName) await pool.query(`drop trigger if exists ${rollbackTriggerName} on audit_events`).catch(() => undefined);
    if (rollbackFunctionName) await pool.query(`drop function if exists ${rollbackFunctionName}()`).catch(() => undefined);
    await pool.query("delete from audit_events where actor_user_id like $1 or before_state::text like $2 or after_state::text like $2", [`issue222-%-${token}`, `%${marker}%`]).catch(() => undefined);
    await pool.query("delete from service_contexts where note like $1", [`${marker}%`]).catch(() => undefined);
    await pool.end();
  }
}

function requestFor(action: string, input: unknown): Request {
  return new Request("http://localhost/api/planning-lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
}

async function sourceFilesUnder(roots: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) await walk(root, files);
  return files;
}

async function walk(path: string, files: string[]): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(child, files);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(child);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
