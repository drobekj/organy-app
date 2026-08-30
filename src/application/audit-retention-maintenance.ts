import type { Pool, PoolClient } from "pg";

export const AUDIT_RETENTION_SUCCESS_ACTION = "maintenance.audit-retention.success";
export const AUDIT_RETENTION_FAILURE_ACTION = "maintenance.audit-retention.failure";
export const AUDIT_RETENTION_OBJECT_KIND = "auditRetentionMaintenance";

export type AuditRetentionDryRunReport = {
  eligible: boolean;
  completedServiceCountConsidered: number;
  cutoffServiceDate: string | null;
  planningAuditCandidates: number;
  resolvedFailureCandidates: number;
  protectedSuccessEvents: number;
};

export type AuditRetentionIncident = {
  id: number;
  occurredAt: Date;
  objectRef: string;
  afterState: unknown | null;
};

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export async function auditRetentionDryRun(db: Queryable): Promise<AuditRetentionDryRunReport> {
  const completed = await db.query(`
    select sc.service_date::text as service_date
      from completed_services cs
      join service_contexts sc on sc.id = cs.service_context_id
     order by sc.service_date desc, coalesce(sc.service_time, '') desc, cs.id desc
     limit 5
  `);

  if (completed.rows.length < 5) {
    return {
      eligible: false,
      completedServiceCountConsidered: completed.rows.length,
      cutoffServiceDate: null,
      planningAuditCandidates: 0,
      resolvedFailureCandidates: 0,
      protectedSuccessEvents: await countProtectedSuccessEvents(db),
    };
  }

  const cutoffServiceDate = String(completed.rows[4].service_date);
  const [planningCandidates, resolvedFailures, protectedSuccessEvents] = await Promise.all([
    db.query(`
      select count(*)::int as count
        from audit_events e
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
         )
    `, [cutoffServiceDate]),
    db.query(`
      select count(*)::int as count
        from audit_events failure
       where failure.action = $2
         and failure.occurred_at < $1::date
         and exists (
           select 1
             from audit_events success
            where success.action = $3
              and (success.occurred_at, success.id) > (failure.occurred_at, failure.id)
         )
    `, [cutoffServiceDate, AUDIT_RETENTION_FAILURE_ACTION, AUDIT_RETENTION_SUCCESS_ACTION]),
    countProtectedSuccessEvents(db),
  ]);

  return {
    eligible: true,
    completedServiceCountConsidered: completed.rows.length,
    cutoffServiceDate,
    planningAuditCandidates: Number(planningCandidates.rows[0]?.count ?? 0),
    resolvedFailureCandidates: Number(resolvedFailures.rows[0]?.count ?? 0),
    protectedSuccessEvents,
  };
}

export async function getUnresolvedAuditRetentionIncident(db: Queryable): Promise<AuditRetentionIncident | null> {
  const result = await db.query(`
    select failure.id, failure.occurred_at, failure.object_ref, failure.after_state
      from audit_events failure
     where failure.action = $1
       and not exists (
         select 1
           from audit_events success
          where success.action = $2
            and (success.occurred_at, success.id) > (failure.occurred_at, failure.id)
       )
     order by failure.occurred_at desc, failure.id desc
     limit 1
  `, [AUDIT_RETENTION_FAILURE_ACTION, AUDIT_RETENTION_SUCCESS_ACTION]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(String(row.occurred_at)),
    objectRef: String(row.object_ref),
    afterState: row.after_state ?? null,
  };
}

async function countProtectedSuccessEvents(db: Queryable): Promise<number> {
  const result = await db.query(
    "select count(*)::int as count from audit_events where action = $1",
    [AUDIT_RETENTION_SUCCESS_ACTION],
  );
  return Number(result.rows[0]?.count ?? 0);
}
