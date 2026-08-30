import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  AUDIT_RETENTION_FAILURE_ACTION,
  AUDIT_RETENTION_SUCCESS_ACTION,
  getUnresolvedAuditRetentionIncident,
} from "../src/application/audit-retention-maintenance";
import {
  AUDIT_RETENTION_LOCK_KEY,
  AuditRetentionMaintenanceConflictError,
  applyAuditRetentionMaintenance,
} from "../src/maintenance/audit-retention-operator";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 314 apply acceptance.");

  const pool = new Pool({ connectionString: databaseUrl });
  const marker = `issue314-apply-${process.pid}-${Date.now()}`;
  const contextIds: number[] = [];
  const createdRunRefs = new Set<string>();
  let triggerName: string | undefined;
  let functionName: string | undefined;

  try {
    for (const [date, time] of [
      ["2080-01-05", "10:00"],
      ["2080-01-04", "10:00"],
      ["2080-01-03", "10:00"],
      ["2080-01-02", "10:00"],
      ["2080-01-01", "10:00"],
    ]) {
      const context = await pool.query(
        `insert into service_contexts (name, service_date, service_time, service_language, priest_display_name, organist_display_name)
         values ($1,$2,$3,'czech','Issue 314 Priest','Issue 314 Organist') returning id`,
        [`${marker}-${date}`, date, time],
      );
      const contextId = Number(context.rows[0].id);
      contextIds.push(contextId);
      await pool.query("insert into completed_services (service_context_id, completed_at) values ($1,$2)", [contextId, `${date}T12:00:00Z`]);
    }

    const activeContext = await pool.query(
      `insert into service_contexts (name, service_date, service_time, service_language, priest_display_name, organist_display_name)
       values ($1,'2080-02-01','10:00','czech','Issue 314 Priest','Issue 314 Organist') returning id`,
      [`${marker}-active`],
    );
    const activeContextId = Number(activeContext.rows[0].id);
    contextIds.push(activeContextId);
    const activeSet = await pool.query("insert into service_sets (service_context_id, status) values ($1,'working') returning id", [activeContextId]);
    const activeSetId = String(activeSet.rows[0].id);

    await insertAudit(pool, "2079-12-01T08:00:00Z", "planning.completed.update", "completedService", `${marker}-old-deletable-1`);
    await insertAudit(pool, "2079-12-02T08:00:00Z", "planning.working.save", "planningSet", activeSetId);
    await insertAudit(pool, "2080-01-01T08:00:00Z", "planning.completed.update", "completedService", `${marker}-cutoff-day-preserved`);
    await insertAudit(pool, "2020-01-01T08:00:00Z", AUDIT_RETENTION_FAILURE_ACTION, "auditRetentionMaintenance", `${marker}-resolved-failure`);
    await insertAudit(pool, "2021-01-01T08:00:00Z", AUDIT_RETENTION_SUCCESS_ACTION, "auditRetentionMaintenance", `${marker}-protected-success`);

    const first = await applyAuditRetentionMaintenance(pool);
    createdRunRefs.add(first.runRef);
    assert.equal(first.eligible, true);
    assert.equal(first.cutoffServiceDate, "2080-01-01");
    assert.equal(first.planningAuditCandidates, 1);
    assert.equal(first.resolvedFailureCandidates, 1);
    assert.equal(first.deletedPlanningAuditEvents, 1);
    assert.equal(first.deletedResolvedFailureEvents, 1);

    assert.equal(await auditExists(pool, `${marker}-old-deletable-1`), false, "old planning audit is deleted");
    assert.equal(await auditExists(pool, activeSetId), true, "audit for an active Working/Final plan is protected");
    assert.equal(await auditExists(pool, `${marker}-cutoff-day-preserved`), true, "audit on the fifth Completed Service date is preserved");
    assert.equal(await auditExists(pool, `${marker}-resolved-failure`), false, "old resolved maintenance failure is deletion-eligible");
    assert.equal(await auditExists(pool, `${marker}-protected-success`), true, "successful maintenance audit is never deleted");
    await assertSuccessAudit(pool, first.runRef);

    await insertAudit(pool, "2079-12-03T08:00:00Z", "planning.completed.update", "completedService", `${marker}-rollback-candidate`);
    functionName = `issue314_block_success_${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
    triggerName = `${functionName}_trigger`;
    await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin if NEW.action = '${AUDIT_RETENTION_SUCCESS_ACTION}' then raise exception 'issue-314-injected-success-audit-failure'; end if; return NEW; end $$`);
    await pool.query(`create trigger ${triggerName} before insert on audit_events for each row execute function ${functionName}()`);

    await assert.rejects(
      () => applyAuditRetentionMaintenance(pool),
      /issue-314-injected-success-audit-failure/,
      "success-audit failure must fail the maintenance transaction",
    );
    assert.equal(await auditExists(pool, `${marker}-rollback-candidate`), true, "deletion rolls back when success audit cannot persist");

    await pool.query(`drop trigger ${triggerName} on audit_events`);
    await pool.query(`drop function ${functionName}()`);
    triggerName = undefined;
    functionName = undefined;

    const failedAfterRollback = await getUnresolvedAuditRetentionIncident(pool);
    assert.ok(failedAfterRollback, "failed maintenance creates an admin-visible incident");
    const rollbackFailureRef = failedAfterRollback!.objectRef;
    createdRunRefs.add(rollbackFailureRef);

    const recovery = await applyAuditRetentionMaintenance(pool);
    createdRunRefs.add(recovery.runRef);
    assert.equal(recovery.deletedPlanningAuditEvents, 1, "the rolled-back candidate is deleted only by the later healthy run");
    assert.equal(await getUnresolvedAuditRetentionIncident(pool), null, "later success resolves the failure alert");

    const lockClient = await pool.connect();
    try {
      await lockClient.query("select pg_advisory_lock(hashtextextended($1, 0))", [AUDIT_RETENTION_LOCK_KEY]);
      await assert.rejects(
        () => applyAuditRetentionMaintenance(pool),
        AuditRetentionMaintenanceConflictError,
        "overlapping maintenance run must be rejected",
      );
    } finally {
      await lockClient.query("select pg_advisory_unlock(hashtextextended($1, 0))", [AUDIT_RETENTION_LOCK_KEY]).catch(() => undefined);
      lockClient.release();
    }

    const conflictIncident = await getUnresolvedAuditRetentionIncident(pool);
    assert.ok(conflictIncident, "maintenance conflict creates an admin-visible incident");
    const conflictFailureRef = conflictIncident!.objectRef;
    createdRunRefs.add(conflictFailureRef);
    const conflictState = await pool.query("select after_state from audit_events where object_ref = $1 and action = $2", [conflictFailureRef, AUDIT_RETENTION_FAILURE_ACTION]);
    const conflictAfterState = conflictState.rows[0]?.after_state as { conflict?: boolean } | undefined;
    assert.equal(conflictAfterState?.conflict, true);

    const postConflict = await applyAuditRetentionMaintenance(pool);
    createdRunRefs.add(postConflict.runRef);
    assert.equal(await getUnresolvedAuditRetentionIncident(pool), null, "successful retry resolves the conflict alert");
    assert.equal(await auditExists(pool, conflictFailureRef), true, "newly resolved failure remains until a later retention cycle");

    const cleanupCycle = await applyAuditRetentionMaintenance(pool);
    createdRunRefs.add(cleanupCycle.runRef);
    assert.ok(cleanupCycle.deletedResolvedFailureEvents >= 1, "a later cycle deletes old failure events already resolved by success");
    assert.equal(await auditExists(pool, conflictFailureRef), false, "resolved conflict failure becomes deletable");
    assert.equal(await auditExists(pool, `${marker}-protected-success`), true, "protected historical success survives every maintenance cycle");

    const successfulRuns = await pool.query(
      "select count(*)::int as count from audit_events where action = $1 and (object_ref = $2 or object_ref = any($3::text[]))",
      [AUDIT_RETENTION_SUCCESS_ACTION, `${marker}-protected-success`, [...createdRunRefs]],
    );
    assert.ok(Number(successfulRuns.rows[0]?.count ?? 0) >= 4, "successful maintenance history remains durable across cleanup cycles");

    console.log("Issue 314 transactional audit retention apply acceptance passed.");
  } finally {
    if (triggerName) await pool.query(`drop trigger if exists ${triggerName} on audit_events`).catch(() => undefined);
    if (functionName) await pool.query(`drop function if exists ${functionName}()`).catch(() => undefined);
    if (createdRunRefs.size) await pool.query("delete from audit_events where object_ref = any($1::text[])", [[...createdRunRefs]]).catch(() => undefined);
    await pool.query("delete from audit_events where object_ref like $1 or after_state::text like $1", [`%${marker}%`]).catch(() => undefined);
    await pool.query("delete from service_contexts where name like $1", [`${marker}%`]).catch(() => undefined);
    await pool.end();
  }
}

async function auditExists(pool: Pool, objectRef: string): Promise<boolean> {
  const result = await pool.query("select exists(select 1 from audit_events where object_ref = $1) as present", [objectRef]);
  return result.rows[0]?.present === true;
}

async function assertSuccessAudit(pool: Pool, objectRef: string): Promise<void> {
  const result = await pool.query(
    "select actor_kind, action, object_kind, after_state from audit_events where object_ref = $1",
    [objectRef],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].actor_kind, "system");
  assert.equal(result.rows[0].action, AUDIT_RETENTION_SUCCESS_ACTION);
  assert.equal(result.rows[0].object_kind, "auditRetentionMaintenance");
  const afterState = result.rows[0].after_state as { status?: string; mode?: string } | undefined;
  assert.equal(afterState?.status, "success");
  assert.equal(afterState?.mode, "apply");
}

async function insertAudit(pool: Pool, occurredAt: string, action: string, objectKind: string, objectRef: string) {
  await pool.query(
    `insert into audit_events (occurred_at, actor_kind, action, object_kind, object_ref, after_state)
     values ($1,'system',$2,$3,$4,$5::jsonb)`,
    [occurredAt, action, objectKind, objectRef, JSON.stringify({ test: true, objectRef })],
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
