import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export const AUDIT_RETENTION_SUCCESS_ACTION = "maintenance.auditRetention.success";
export const AUDIT_RETENTION_PROBLEM_ACTION = "maintenance.auditRetention.problem";
export const AUDIT_RETENTION_OBJECT_KIND = "maintenance";
export const AUDIT_RETENTION_OBJECT_REF = "auditRetention";

export type AuditRetentionDryRunPlan = {
  completedServiceCount: number;
  cutoffCompletedServiceId: string | null;
  cutoffServiceDate: string | null;
  cutoffServiceTime: string | null;
  candidateEventCount: number;
  protectedActivePlanningEventCount: number;
  excludedNonPlanningEventCount: number;
};

export type AuditRetentionMaintenanceIncident = {
  eventId: number;
  occurredAt: Date;
  message: string;
};

export async function inspectAuditRetentionDryRun(db: Queryable): Promise<AuditRetentionDryRunPlan> {
  const completed = await db.query(`
    select cs.id::text completed_service_id,
           sc.service_date::text service_date,
           coalesce(sc.service_time::text, '') service_time
      from completed_services cs
      join service_contexts sc on sc.id = cs.service_context_id
     order by sc.service_date desc, sc.service_time desc nulls last, cs.id desc
  `);

  const completedServiceCount = completed.rows.length;
  if (completedServiceCount < 5) {
    return {
      completedServiceCount,
      cutoffCompletedServiceId: null,
      cutoffServiceDate: null,
      cutoffServiceTime: null,
      candidateEventCount: 0,
      protectedActivePlanningEventCount: 0,
      excludedNonPlanningEventCount: 0,
    };
  }

  const cutoff = completed.rows[4] as Record<string, unknown>;
  const cutoffCompletedServiceId = String(cutoff.completed_service_id);
  const cutoffServiceDate = String(cutoff.service_date);
  const cutoffServiceTime = String(cutoff.service_time ?? "");

  const counts = await db.query(
    `
      with old_events as (
        select ae.*
          from audit_events ae
         where (ae.occurred_at at time zone 'Europe/Prague')::date < $1::date
      ),
      active_sets as (
        select id::text object_ref
          from service_sets
         where status in ('working', 'final')
      )
      select
        count(*) filter (
          where (
            action like 'planning.%'
            or action = $2
          )
          and not (
            object_kind = 'planningSet'
            and object_ref in (select object_ref from active_sets)
          )
          and action <> $3
        )::int candidate_event_count,
        count(*) filter (
          where action like 'planning.%'
            and object_kind = 'planningSet'
            and object_ref in (select object_ref from active_sets)
        )::int protected_active_planning_event_count,
        count(*) filter (
          where action not like 'planning.%'
            and action <> $2
            and action <> $3
        )::int excluded_non_planning_event_count
      from old_events
    `,
    [cutoffServiceDate, AUDIT_RETENTION_PROBLEM_ACTION, AUDIT_RETENTION_SUCCESS_ACTION],
  );

  const row = counts.rows[0] as Record<string, unknown>;
  return {
    completedServiceCount,
    cutoffCompletedServiceId,
    cutoffServiceDate,
    cutoffServiceTime: cutoffServiceTime || null,
    candidateEventCount: Number(row.candidate_event_count ?? 0),
    protectedActivePlanningEventCount: Number(row.protected_active_planning_event_count ?? 0),
    excludedNonPlanningEventCount: Number(row.excluded_non_planning_event_count ?? 0),
  };
}

export async function readAuditRetentionMaintenanceIncident(db: Queryable): Promise<AuditRetentionMaintenanceIncident | null> {
  const result = await db.query(
    `
      select id, occurred_at, action, after_state
        from audit_events
       where action in ($1, $2)
         and object_kind = $3
         and object_ref = $4
       order by occurred_at desc, id desc
       limit 1
    `,
    [
      AUDIT_RETENTION_SUCCESS_ACTION,
      AUDIT_RETENTION_PROBLEM_ACTION,
      AUDIT_RETENTION_OBJECT_KIND,
      AUDIT_RETENTION_OBJECT_REF,
    ],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.action === AUDIT_RETENTION_SUCCESS_ACTION) return null;

  return {
    eventId: Number(row.id),
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(String(row.occurred_at)),
    message: incidentMessage(row.after_state),
  };
}

function incidentMessage(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = (value as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Audit History maintenance requires attention.";
}
