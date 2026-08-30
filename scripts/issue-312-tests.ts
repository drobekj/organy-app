import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import {
  AUDIT_RETENTION_OBJECT_KIND,
  AUDIT_RETENTION_OBJECT_REF,
  AUDIT_RETENTION_PROBLEM_ACTION,
  AUDIT_RETENTION_SUCCESS_ACTION,
  inspectAuditRetentionDryRun,
  readAuditRetentionMaintenanceIncident,
} from "../src/application/audit-retention-maintenance";
import { presentAuditEvent } from "../src/application/audit-history-view";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 312 acceptance.");

const pool = new Pool({ connectionString: databaseUrl });
const token = `issue312-${process.pid}-${Date.now()}`;
const marker = `Issue 312 ${token}`;
const auditRefs = {
  oldCandidate: `${token}-old-candidate`,
  active: "",
  cutoffDay: `${token}-cutoff-day`,
  nonPlanning: `${token}-non-planning`,
  maintenance: AUDIT_RETENTION_OBJECT_REF,
};

async function main() {
  try {
    await seedCompletedServices();
    auditRefs.active = await seedActivePlan();
    await seedAuditEvents();

    const beforeAuditCount = await auditCount();
    const plan = await inspectAuditRetentionDryRun(pool);

    assert.equal(plan.completedServiceCount, 6);
    assert.equal(plan.cutoffServiceDate, "2088-01-02", "fifth newest Completed Service defines cutoff date");
    assert.equal(plan.candidateEventCount, 2, "old detached planning event and old maintenance problem are deletion candidates");
    assert.equal(plan.protectedActivePlanningEventCount, 1, "active Working/Final plan audit remains protected even before cutoff");
    assert.equal(plan.excludedNonPlanningEventCount, 1, "unrelated non-planning audit remains outside retention");

    const script = readFileSync("scripts/audit-retention-maintenance.ts", "utf8");
    assert.match(script, /only --dry-run is available/i, "destructive mode must remain disabled in first delivery");
    assert.doesNotMatch(script, /delete\s+from\s+audit_events/i, "dry-run operator must not contain an audit deletion");
    const moduleSource = readFileSync("src/application/audit-retention-maintenance.ts", "utf8");
    assert.doesNotMatch(moduleSource, /delete\s+from\s+audit_events/i, "dry-run planner must remain read-only");

    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const dryRun = spawnSync(npx, ["tsx", "scripts/audit-retention-maintenance.ts", "--dry-run"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /dry-run: PASS/);
    assert.match(dryRun.stdout, /Retention cutoff: 2088-01-02/);
    assert.match(dryRun.stdout, /Candidate audit events: 2/);
    assert.match(dryRun.stdout, /No database rows were changed/);
    assert.equal(await auditCount(), beforeAuditCount, "dry-run must not mutate audit history");

    const incident = await readAuditRetentionMaintenanceIncident(pool);
    assert.ok(incident, "latest maintenance problem must surface an incident");
    assert.match(incident!.message, /simulated retention conflict/i);

    const presentation = presentAuditEvent({
      id: incident!.eventId,
      occurredAt: incident!.occurredAt,
      actorKind: "system",
      actorUserId: null,
      actorDisplayName: null,
      actorRole: null,
      actorPersonId: null,
      action: AUDIT_RETENTION_PROBLEM_ACTION,
      objectKind: AUDIT_RETENTION_OBJECT_KIND,
      objectRef: AUDIT_RETENTION_OBJECT_REF,
      beforeState: null,
      afterState: { message: incident!.message },
    });
    assert.equal(presentation.objectLabel, "Audit retention:");
    assert.equal(presentation.action, "Maintenance problem");

    await pool.query(
      `insert into audit_events
        (occurred_at, actor_kind, action, object_kind, object_ref, after_state)
       values ('2088-02-01T12:00:00Z', 'system', $1, $2, $3, $4::jsonb)`,
      [
        AUDIT_RETENTION_SUCCESS_ACTION,
        AUDIT_RETENTION_OBJECT_KIND,
        AUDIT_RETENTION_OBJECT_REF,
        JSON.stringify({ candidateEventCount: 2, deletedEventCount: 2 }),
      ],
    );
    assert.equal(await readAuditRetentionMaintenanceIncident(pool), null, "later successful maintenance clears the admin incident without separate state");

    const page = readFileSync("app/page.tsx", "utf8");
    const controls = readFileSync("app/protected-account-controls.tsx", "utf8");
    assert.match(page, /readAuditRetentionMaintenanceIncident\(authPool\)/);
    assert.match(page, /authenticatedUser\.roles\.includes\("admin"\)/);
    assert.match(controls, /activeAdmin && maintenanceIncident/);
    assert.match(controls, /workspace-maintenance-alert/);
    assert.match(controls, /role="alert"/);
    assert.match(controls, /Open Audit History/);

    console.log("Issue 312 audit retention dry-run and admin incident acceptance passed.");
  } finally {
    await cleanup();
    await pool.end();
  }
}

async function seedCompletedServices() {
  for (let day = 1; day <= 6; day += 1) {
    const serviceDate = `2088-01-${String(day).padStart(2, "0")}`;
    const context = await pool.query(
      `insert into service_contexts
        (name, service_date, service_time, service_language, priest_display_name, organist_display_name)
       values ($1, $2, '10:00', 'czech', 'Test Priest', 'Test Organist')
       returning id`,
      [`${marker} completed ${day}`, serviceDate],
    );
    await pool.query(
      "insert into completed_services (service_context_id, completed_at) values ($1, $2)",
      [context.rows[0].id, `${serviceDate}T11:00:00Z`],
    );
  }
}

async function seedActivePlan(): Promise<string> {
  const context = await pool.query(
    `insert into service_contexts
      (name, service_date, service_time, service_language, priest_display_name, organist_display_name)
     values ($1, '2090-01-01', '10:00', 'czech', 'Test Priest', 'Test Organist')
     returning id`,
    [`${marker} active`],
  );
  const set = await pool.query(
    "insert into service_sets (service_context_id, status) values ($1, 'working') returning id::text id",
    [context.rows[0].id],
  );
  return String(set.rows[0].id);
}

async function seedAuditEvents() {
  await insertAudit("2087-12-28T12:00:00Z", "planning.working.save", "planningSet", auditRefs.oldCandidate, { marker: token });
  await insertAudit("2087-12-29T12:00:00Z", "planning.working.save", "planningSet", auditRefs.active, { marker: token });
  await insertAudit("2088-01-02T00:30:00Z", "planning.final.create", "planningSet", auditRefs.cutoffDay, { marker: token });
  await insertAudit("2087-12-30T12:00:00Z", "account.password.change", "account", auditRefs.nonPlanning, { marker: token });
  await insertAudit(
    "2087-12-31T12:00:00Z",
    AUDIT_RETENTION_PROBLEM_ACTION,
    AUDIT_RETENTION_OBJECT_KIND,
    AUDIT_RETENTION_OBJECT_REF,
    { message: "Simulated retention conflict", marker: token },
  );
  await insertAudit(
    "2087-12-27T12:00:00Z",
    AUDIT_RETENTION_SUCCESS_ACTION,
    AUDIT_RETENTION_OBJECT_KIND,
    AUDIT_RETENTION_OBJECT_REF,
    { candidateEventCount: 3, deletedEventCount: 3, marker: token },
  );
}

async function insertAudit(occurredAt: string, action: string, objectKind: string, objectRef: string, afterState: unknown) {
  await pool.query(
    `insert into audit_events
      (occurred_at, actor_kind, action, object_kind, object_ref, after_state)
     values ($1, 'system', $2, $3, $4, $5::jsonb)`,
    [occurredAt, action, objectKind, objectRef, JSON.stringify(afterState)],
  );
}

async function auditCount(): Promise<number> {
  const result = await pool.query("select count(*)::int count from audit_events");
  return Number(result.rows[0].count);
}

async function cleanup() {
  await pool.query(
    "delete from audit_events where object_ref like $1 or (object_kind = $2 and object_ref = $3 and after_state::text like $4)",
    [`${token}%`, AUDIT_RETENTION_OBJECT_KIND, AUDIT_RETENTION_OBJECT_REF, `%${token}%`],
  ).catch(() => undefined);
  await pool.query("delete from service_contexts where name like $1", [`${marker}%`]).catch(() => undefined);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
