import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import {
  AUDIT_RETENTION_FAILURE_ACTION,
  AUDIT_RETENTION_SUCCESS_ACTION,
  auditRetentionDryRun,
  getUnresolvedAuditRetentionIncident,
} from "../src/application/audit-retention-maintenance";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 314 acceptance.");
  const pool = new Pool({ connectionString: databaseUrl });
  const marker = `issue314-${process.pid}-${Date.now()}`;
  const contextIds: number[] = [];

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

    await insertAudit(pool, "2079-12-01T08:00:00Z", "planning.completed.update", "completedService", `${marker}-old-deletable`);
    await insertAudit(pool, "2079-12-02T08:00:00Z", "planning.working.save", "planningSet", activeSetId);
    await insertAudit(pool, "2080-01-01T08:00:00Z", "planning.completed.update", "completedService", `${marker}-cutoff-day-preserved`);
    await insertAudit(pool, "2079-11-01T08:00:00Z", AUDIT_RETENTION_FAILURE_ACTION, "auditRetentionMaintenance", `${marker}-resolved-failure`);
    await insertAudit(pool, "2079-11-02T08:00:00Z", AUDIT_RETENTION_SUCCESS_ACTION, "auditRetentionMaintenance", `${marker}-protected-success`);
    await insertAudit(pool, "2080-02-01T08:00:00Z", AUDIT_RETENTION_FAILURE_ACTION, "auditRetentionMaintenance", `${marker}-unresolved-failure`);

    const before = await pool.query("select count(*)::int as count from audit_events where object_ref like $1", [`${marker}%`]);
    const report = await auditRetentionDryRun(pool);
    assert.equal(report.eligible, true);
    assert.equal(report.completedServiceCountConsidered, 5);
    assert.equal(report.cutoffServiceDate, "2080-01-01");
    assert.equal(report.planningAuditCandidates, 1, "only old non-active planning audit is a deletion candidate");
    assert.equal(report.resolvedFailureCandidates, 1, "old failure resolved by a later success is retention-eligible");
    assert.ok(report.protectedSuccessEvents >= 1, "success maintenance event is counted as protected, never a deletion candidate");

    const unresolved = await getUnresolvedAuditRetentionIncident(pool);
    assert.ok(unresolved, "latest failure without a later success must trigger an admin incident");
    assert.equal(unresolved?.objectRef, `${marker}-unresolved-failure`);

    const command = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/audit-retention-maintenance.ts", "--dry-run"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout, /Audit retention maintenance dry-run: PASS/);
    assert.match(command.stdout, /No audit rows or business rows were changed/);

    const after = await pool.query("select count(*)::int as count from audit_events where object_ref like $1", [`${marker}%`]);
    assert.equal(after.rows[0].count, before.rows[0].count, "dry-run must be mutation-free");

    const applyAttempt = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/audit-retention-maintenance.ts"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    assert.notEqual(applyAttempt.status, 0, "deletion/apply mode must remain disabled in the dry-run phase");
    assert.match(applyAttempt.stderr, /Only --dry-run is enabled/);

    await insertAudit(pool, "2080-02-02T08:00:00Z", AUDIT_RETENTION_SUCCESS_ACTION, "auditRetentionMaintenance", `${marker}-recovery-success`);
    assert.equal(await getUnresolvedAuditRetentionIncident(pool), null, "a later successful run automatically resolves the admin alert");

    const homeSource = await readFile("app/page.tsx", "utf8");
    assert.match(homeSource, /authenticatedUser\.roles\.includes\("admin"\)/, "incident check is restricted to signed-in admins");
    assert.match(homeSource, /role="alert"/);
    assert.match(homeSource, /Audit maintenance requires attention/);
    assert.match(homeSource, /Open Audit History/);

    const issue222 = await readFile("scripts/issue-222-audit-tests.ts", "utf8");
    assert.match(issue222, /normal application code must not update\/delete audit rows/, "normal application remains append-only; future retention deletion belongs only to the maintenance operator");

    console.log("Issue 314 audit retention dry-run acceptance passed.");
  } finally {
    await pool.query("delete from audit_events where object_ref like $1", [`${marker}%`]).catch(() => undefined);
    await pool.query("delete from service_contexts where name like $1", [`${marker}%`]).catch(() => undefined);
    await pool.end();
  }
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
