import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { appendAuditEvent, systemAuditActor } from "../application/audit-history";
import {
  AUDIT_RETENTION_FAILURE_ACTION,
  AUDIT_RETENTION_OBJECT_KIND,
  AUDIT_RETENTION_SUCCESS_ACTION,
  auditRetentionDryRun,
  type AuditRetentionDryRunReport,
} from "../application/audit-retention-maintenance";

export const AUDIT_RETENTION_LOCK_KEY = "organy.audit-retention";

export type AuditRetentionApplyReport = AuditRetentionDryRunReport & {
  mode: "apply";
  runRef: string;
  deletedPlanningAuditEvents: number;
  deletedResolvedFailureEvents: number;
};

export class AuditRetentionMaintenanceConflictError extends Error {
  constructor() {
    super("Another audit-retention maintenance run is already active.");
    this.name = "AuditRetentionMaintenanceConflictError";
  }
}

export async function applyAuditRetentionMaintenance(db: Pool): Promise<AuditRetentionApplyReport> {
  const runRef = `audit-retention:${new Date().toISOString()}:${randomUUID()}`;
  let client: PoolClient | undefined;

  try {
    client = await db.connect();
    await client.query("begin isolation level repeatable read");

    const lock = await client.query(
      "select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked",
      [AUDIT_RETENTION_LOCK_KEY],
    );
    if (lock.rows[0]?.locked !== true) throw new AuditRetentionMaintenanceConflictError();

    const dryRun = await auditRetentionDryRun(client);
    let deletedPlanningAuditEvents = 0;
    let deletedResolvedFailureEvents = 0;

    if (dryRun.eligible && dryRun.cutoffServiceDate) {
      const planningDelete = await client.query(
        `delete from audit_events e
          where e.action like 'planning.%'
            and e.occurred_at < $1::date
            and not (
              e.object_kind = 'planningSet'
              and exists (
                select 1
                  from service_sets active_set
                 where active_set.id::text = e.object_ref
                   and active_set.status in ('working', 'final')
              )
            )) returning e.id`,
        [dryRun.cutoffServiceDate],
      );
      deletedPlanningAuditEvents = planningDelete.rows.length;

      const failureDelete = await client.query(
        `delete from audit_events failure
          where failure.action = $2
            and failure.occurred_at < $1::date
            and exists (
              select 1
                from audit_events success
               where success.action = $3
                 and (success.occurred_at, success.id) > (failure.occurred_at, failure.id)
            ) returning failure.id`,
        [dryRun.cutoffServiceDate, AUDIT_RETENTION_FAILURE_ACTION, AUDIT_RETENTION_SUCCESS_ACTION],
      );
      deletedResolvedFailureEvents = failureDelete.rows.length;
    }

    const report: AuditRetentionApplyReport = {
      ...dryRun,
      mode: "apply",
      runRef,
      deletedPlanningAuditEvents,
      deletedResolvedFailureEvents,
    };

    await appendAuditEvent(client, {
      actor: systemAuditActor(),
      action: AUDIT_RETENTION_SUCCESS_ACTION,
      objectKind: AUDIT_RETENTION_OBJECT_KIND,
      objectRef: runRef,
      afterState: {
        status: "success",
        ...report,
      },
    });

    await client.query("commit");
    return report;
  } catch (error) {
    if (client) {
      await client.query("rollback").catch(() => undefined);
      await appendFailureAudit(client, runRef, error).catch((auditError) => {
        console.error(
          "Audit retention failure event could not be persisted.",
          auditError instanceof Error ? auditError.message : "Unknown audit persistence error.",
        );
      });
    }
    throw error;
  } finally {
    client?.release();
  }
}

async function appendFailureAudit(client: PoolClient, runRef: string, error: unknown): Promise<void> {
  await appendAuditEvent(client, {
    actor: systemAuditActor(),
    action: AUDIT_RETENTION_FAILURE_ACTION,
    objectKind: AUDIT_RETENTION_OBJECT_KIND,
    objectRef: runRef,
    afterState: {
      status: "failure",
      mode: "apply",
      conflict: error instanceof AuditRetentionMaintenanceConflictError,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown maintenance error.",
    },
  });
}
