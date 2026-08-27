import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";

export type AuditActorSnapshot =
  | { kind: "system" }
  | { kind: "human"; userId: string; displayName: string; role: string; personId?: string };

export type AuditEventInput = {
  actor: AuditActorSnapshot;
  action: string;
  objectKind: string;
  objectRef: string;
  beforeState?: unknown;
  afterState?: unknown;
};

export type AuditEventRecord = {
  id: number;
  occurredAt: Date;
  actorKind: "human" | "system";
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorRole: string | null;
  actorPersonId: string | null;
  action: string;
  objectKind: string;
  objectRef: string;
  beforeState: unknown | null;
  afterState: unknown | null;
};

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export function humanAuditActor(actor: ActorIdentity): AuditActorSnapshot {
  return {
    kind: "human",
    userId: actor.userId,
    displayName: actor.displayName,
    role: actor.role,
    ...(actor.personId ? { personId: actor.personId } : {}),
  };
}

export function systemAuditActor(): AuditActorSnapshot { return { kind: "system" }; }

export function canReadAuditHistory(roles: readonly string[]): boolean {
  return roles.includes("admin");
}

export function auditEventValues(input: AuditEventInput) {
  return {
    actorKind: input.actor.kind,
    actorUserId: input.actor.kind === "human" ? input.actor.userId : null,
    actorDisplayName: input.actor.kind === "human" ? input.actor.displayName : null,
    actorRole: input.actor.kind === "human" ? input.actor.role : null,
    actorPersonId: input.actor.kind === "human" ? input.actor.personId ?? null : null,
    action: input.action,
    objectKind: input.objectKind,
    objectRef: input.objectRef,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
  };
}

export async function appendAuditEvent(db: Queryable, input: AuditEventInput): Promise<void> {
  const value = auditEventValues(input);
  await db.query(
    `insert into audit_events
      (actor_kind, actor_user_id, actor_display_name, actor_role, actor_person_id, action, object_kind, object_ref, before_state, after_state)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
    [
      value.actorKind,
      value.actorUserId,
      value.actorDisplayName,
      value.actorRole,
      value.actorPersonId,
      value.action,
      value.objectKind,
      value.objectRef,
      value.beforeState === null ? null : JSON.stringify(value.beforeState),
      value.afterState === null ? null : JSON.stringify(value.afterState),
    ],
  );
}

export async function listAuditEvents(db: Queryable, limit = 200): Promise<AuditEventRecord[]> {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 1000)) : 200;
  const { rows } = await db.query(
    `select id, occurred_at, actor_kind, actor_user_id, actor_display_name, actor_role, actor_person_id,
            action, object_kind, object_ref, before_state, after_state
       from audit_events
      order by occurred_at desc, id desc
      limit $1`,
    [safeLimit],
  );
  return mapAuditRows(rows);
}

export async function listPlanningAuditEvents(db: Queryable): Promise<AuditEventRecord[]> {
  const { rows } = await db.query(
    `select id, occurred_at, actor_kind, actor_user_id, actor_display_name, actor_role, actor_person_id,
            action, object_kind, object_ref, before_state, after_state
       from audit_events
      where action like 'planning.%'
      order by occurred_at asc, id asc`,
  );
  return mapAuditRows(rows);
}

function mapAuditRows(rows: Record<string, unknown>[]): AuditEventRecord[] {
  return rows.map((row) => ({
    id: Number(row.id),
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(String(row.occurred_at)),
    actorKind: row.actor_kind as "human" | "system",
    actorUserId: row.actor_user_id === null ? null : String(row.actor_user_id),
    actorDisplayName: row.actor_display_name === null ? null : String(row.actor_display_name),
    actorRole: row.actor_role === null ? null : String(row.actor_role),
    actorPersonId: row.actor_person_id === null ? null : String(row.actor_person_id),
    action: String(row.action),
    objectKind: String(row.object_kind),
    objectRef: String(row.object_ref),
    beforeState: row.before_state ?? null,
    afterState: row.after_state ?? null,
  }));
}
