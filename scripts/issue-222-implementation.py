from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")

def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f"Expected text not found in {path}: {old[:160]!r}")
    write(path, text.replace(old, new, 1))

# ---------------------------------------------------------------------------
# Persistence model + shared audit application helper
# ---------------------------------------------------------------------------
replace_once(
    "src/db/schema/index.ts",
    '  integer,\n  time,',
    '  integer,\n  jsonb,\n  time,',
)

schema_marker = 'export const serviceContextsRelations = relations(serviceContexts, ({ many }) => ({'
audit_schema = '''export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorKind: text("actor_kind").notNull(),
  actorUserId: text("actor_user_id"),
  actorDisplayName: text("actor_display_name"),
  actorRole: text("actor_role"),
  actorPersonId: text("actor_person_id"),
  action: text("action").notNull(),
  objectKind: text("object_kind").notNull(),
  objectRef: text("object_ref").notNull(),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
}, (table) => ({
  occurredAtIndex: index("audit_events_occurred_at_idx").on(table.occurredAt),
  objectIndex: index("audit_events_object_idx").on(table.objectKind, table.objectRef),
  actorKindValid: check("audit_events_actor_kind_valid", sql`${table.actorKind} in ('human', 'system')`),
  actorSnapshotValid: check("audit_events_actor_snapshot_valid", sql`(
    ${table.actorKind} = 'system' and ${table.actorUserId} is null and ${table.actorDisplayName} is null and ${table.actorRole} is null
  ) or (
    ${table.actorKind} = 'human' and ${table.actorUserId} is not null and btrim(${table.actorUserId}) <> '' and
    ${table.actorDisplayName} is not null and btrim(${table.actorDisplayName}) <> '' and
    ${table.actorRole} is not null and btrim(${table.actorRole}) <> ''
  )`),
  actionNonEmpty: check("audit_events_action_non_empty", sql`btrim(${table.action}) <> ''`),
  objectKindNonEmpty: check("audit_events_object_kind_non_empty", sql`btrim(${table.objectKind}) <> ''`),
  objectRefNonEmpty: check("audit_events_object_ref_non_empty", sql`btrim(${table.objectRef}) <> ''`),
}));

'''
replace_once("src/db/schema/index.ts", schema_marker, audit_schema + schema_marker)

write("src/application/audit-history.ts", '''import type { Pool, PoolClient } from "pg";
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
''')

# ---------------------------------------------------------------------------
# Admin-only read UI and navigation
# ---------------------------------------------------------------------------
write("app/admin/audit-history/page.tsx", '''import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { listAuditEvents } from "../../../src/application/audit-history";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";

export default async function AuditHistoryPage() {
  if (process.env.ORGANY_RUNTIME !== "db") redirect("/");
  const requestHeaders = await headers();
  let currentUser;
  try { currentUser = await resolveProtectedUser(requestHeaders, authPool); }
  catch (error) { if (error instanceof ProtectedActorError) redirect("/sign-in"); throw error; }
  if (!currentUser.roles.includes("admin")) redirect("/");

  const events = await listAuditEvents(authPool);
  return <main className="shell"><section className="card planning-form" aria-label="Audit history">
    <div className="app-header"><div><p className="eyebrow">Administration</p><h1>Audit history</h1></div><a href="/">Back to planning</a></div>
    <p className="field-help">Successful business changes only. Audit history is append-only and read-only.</p>
    <div style={{ display: "grid", gap: "0.75rem" }}>
      {events.length === 0 && <p>No audit events recorded yet.</p>}
      {events.map((event) => <article className="detail-panel" key={event.id}>
        <div className="rows-header"><strong>{event.action}</strong><span>{event.occurredAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}</span></div>
        <p><strong>Actor:</strong> {event.actorKind === "system" ? "System" : `${event.actorDisplayName} · ${event.actorRole}`}</p>
        <p><strong>Object:</strong> {event.objectKind} · {event.objectRef}</p>
        {event.beforeState !== null && <details><summary>Before</summary><pre>{formatState(event.beforeState)}</pre></details>}
        {event.afterState !== null && <details><summary>After / delta</summary><pre>{formatState(event.afterState)}</pre></details>}
      </article>)}
    </div>
  </section></main>;
}

function formatState(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
''')

replace_once(
    "app/protected-account-controls.tsx",
    '{roles.includes("admin") && <a href="/admin/accounts">Manage accounts</a>}',
    '{roles.includes("admin") && <><a href="/admin/accounts">Manage accounts</a><a href="/admin/audit-history">Audit history</a></>}',
)

# ---------------------------------------------------------------------------
# Catalog mutations: same Drizzle transaction as audit event
# ---------------------------------------------------------------------------
replace_once(
    "app/api/catalog/route.ts",
    'import { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";\n',
    'import { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";\nimport { auditEventValues, humanAuditActor } from "../../../src/application/audit-history";\n',
)
old_catalog = '''    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    const service = new CatalogService(new DrizzleCatalogRepository(drizzle(pool, { schema })));
    let input = body.input as Record<string, unknown>;
    if (body.action === "savePerson" || body.action === "setSongActive") input = { ...input, role: actor.role };
    return NextResponse.json(await service[body.action](input as never));'''
new_catalog = '''    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    const db = drizzle(pool, { schema });
    let input = body.input as Record<string, unknown>;
    if (body.action === "savePerson" || body.action === "setSongActive") input = { ...input, role: actor.role };
    if (body.action === "savePerson" || body.action === "setSongActive") {
      const result = await db.transaction(async (tx) => {
        const repo = new DrizzleCatalogRepository(tx);
        const service = new CatalogService(repo);
        const before = body.action === "savePerson"
          ? (isRecord(input.person) && typeof input.person.id === "string" ? await repo.findPersonById(input.person.id) : undefined)
          : await repo.findSongById(String(input.songId));
        const mutation = await service[body.action](input as never);
        if (mutation.success) {
          await tx.insert(schema.auditEvents).values(auditEventValues({
            actor: humanAuditActor(actor),
            action: body.action === "savePerson" ? "catalog.person.save" : "catalog.song.setActive",
            objectKind: body.action === "savePerson" ? "person" : "song",
            objectRef: body.action === "savePerson" ? mutation.value.id : mutation.value.songId,
            beforeState: before ?? null,
            afterState: mutation.value,
          }));
        }
        return mutation;
      });
      return NextResponse.json(result);
    }
    const service = new CatalogService(new DrizzleCatalogRepository(db));
    return NextResponse.json(await service[body.action](input as never));'''
replace_once("app/api/catalog/route.ts", old_catalog, new_catalog)

# ---------------------------------------------------------------------------
# Planning lifecycle: human mutations and automatic reconciliation
# ---------------------------------------------------------------------------
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '  createDbBackedPlanningLifecycleService,\n  type PlanningLifecycleDrizzleAdapterDependencies,\n',
    '  createDbBackedPlanningLifecycleService,\n  DrizzleCompletedServiceRecordRepository,\n  DrizzlePlanningSetRepository,\n  type PlanningLifecycleDrizzleAdapterDependencies,\n',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    'import { PostgresReferenceMelodyClassProvider } from "../../../src/application/reference-melody-class-provider";\n',
    'import { PostgresReferenceMelodyClassProvider } from "../../../src/application/reference-melody-class-provider";\nimport { auditEventValues, humanAuditActor, systemAuditActor } from "../../../src/application/audit-history";\n',
)
old_planning = '''    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    const db = drizzle(pool, { schema });
    const adapterDependencies: PlanningLifecycleDrizzleAdapterDependencies = {
      db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
      schema,
    };

    // List reads are the normal reconciliation boundary for Phase 31.25.
    // They still pass through authenticated DB runtime in Phase 31.28.
    const readService = createDbBackedPlanningLifecycleService(adapterDependencies);
    if (body.action === "listPlanningSets") {
      return NextResponse.json(await readService.listPlanningSets());
    }
    if (body.action === "listCompletedRecords") {
      return NextResponse.json(await readService.listCompletedRecords());
    }

    const planningSets = new (await import("../../../src/application/planning-lifecycle")).DrizzlePlanningSetRepository(adapterDependencies);
    if (body.action === "loadCompletedRecord") {
      const recordId = isObjectWithRecordId(body.input) ? body.input.recordId : undefined;
      if (!recordId) return invalidInput("recordId is required.");
      const records = new (await import("../../../src/application/planning-lifecycle")).DrizzleCompletedServiceRecordRepository(adapterDependencies);
      const record = await records.findById(recordId);
      return NextResponse.json(record ? { success: true, value: record } : { success: false, error: { code: "notFound", message: "Completed record was not found." } });
    }
    if (body.action === "loadPlanningSet") {
      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;
      if (!setId) return invalidInput("setId is required.");
      return NextResponse.json(await readService.loadPlanningSet(setId));
    }

    const service = createDbBackedPlanningLifecycleService({
      ...adapterDependencies,
      referenceAntiphons: new PostgresReferenceAntiphonProvider(pool),
      referenceTopics: new PostgresReferenceThematicSectionProvider(pool),
      referenceSongs: new PostgresReferenceCatalogProvider(pool),
      referenceMelodyClasses: new PostgresReferenceMelodyClassProvider(pool),
    });
    if (!isRecord(body.input)) return invalidInput("Planning mutation input object is required.");
    if (body.action === "saveWorkingSet" && (!isRecord(body.input.serviceContext) || !isRecord(body.input.set))) return invalidInput("saveWorkingSet requires serviceContext and set objects.");
    const input = { ...body.input, role: actor.role };
    const result = await service[body.action](input as never);

    return NextResponse.json(result);'''
new_planning = '''    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    const db = drizzle(pool, { schema });
    const adapterDependencies: PlanningLifecycleDrizzleAdapterDependencies = {
      db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
      schema,
    };

    // List reads are the normal reconciliation boundary. Any Final → Completed
    // conversion they cause is a system action and is audited in the same transaction.
    if (body.action === "listPlanningSets" || body.action === "listCompletedRecords") {
      const result = await db.transaction(async (tx) => {
        const txDependencies: PlanningLifecycleDrizzleAdapterDependencies = { db: tx as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"], schema };
        const records = new DrizzleCompletedServiceRecordRepository(txDependencies);
        const beforeIds = new Set((await records.list()).map((record) => record.id));
        const readService = createDbBackedPlanningLifecycleService(txDependencies);
        const value = body.action === "listPlanningSets" ? await readService.listPlanningSets() : await readService.listCompletedRecords();
        if (value.success) {
          for (const record of await records.list()) {
            if (beforeIds.has(record.id)) continue;
            await tx.insert(schema.auditEvents).values(auditEventValues({
              actor: systemAuditActor(),
              action: "planning.final.autoComplete",
              objectKind: "completedService",
              objectRef: record.id,
              beforeState: { sourceFinalSetId: record.sourceFinalSetId },
              afterState: record,
            }));
          }
        }
        return value;
      });
      return NextResponse.json(result);
    }

    const readService = createDbBackedPlanningLifecycleService(adapterDependencies);
    if (body.action === "loadCompletedRecord") {
      const recordId = isObjectWithRecordId(body.input) ? body.input.recordId : undefined;
      if (!recordId) return invalidInput("recordId is required.");
      const record = await new DrizzleCompletedServiceRecordRepository(adapterDependencies).findById(recordId);
      return NextResponse.json(record ? { success: true, value: record } : { success: false, error: { code: "notFound", message: "Completed record was not found." } });
    }
    if (body.action === "loadPlanningSet") {
      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;
      if (!setId) return invalidInput("setId is required.");
      return NextResponse.json(await readService.loadPlanningSet(setId));
    }

    if (!isRecord(body.input)) return invalidInput("Planning mutation input object is required.");
    if (body.action === "saveWorkingSet" && (!isRecord(body.input.serviceContext) || !isRecord(body.input.set))) return invalidInput("saveWorkingSet requires serviceContext and set objects.");
    const input = { ...body.input, role: actor.role };
    const result = await db.transaction(async (tx) => {
      const txDependencies: PlanningLifecycleDrizzleAdapterDependencies = { db: tx as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"], schema };
      const before = await planningBeforeState(body.action, body.input as Record<string, unknown>, txDependencies);
      const service = createDbBackedPlanningLifecycleService({
        ...txDependencies,
        referenceAntiphons: new PostgresReferenceAntiphonProvider(pool),
        referenceTopics: new PostgresReferenceThematicSectionProvider(pool),
        referenceSongs: new PostgresReferenceCatalogProvider(pool),
        referenceMelodyClasses: new PostgresReferenceMelodyClassProvider(pool),
      });
      const mutation = await service[body.action](input as never);
      if (mutation.success) {
        await tx.insert(schema.auditEvents).values(auditEventValues({
          actor: humanAuditActor(actor),
          action: planningAuditAction(body.action),
          objectKind: planningObjectKind(body.action),
          objectRef: planningObjectRef(body.action, body.input as Record<string, unknown>, mutation.value),
          beforeState: before ?? null,
          afterState: mutation.value ?? { request: body.input },
        }));
      }
      return mutation;
    });

    return NextResponse.json(result);'''
replace_once("app/api/planning-lifecycle/route.ts", old_planning, new_planning)

planning_helpers = '''
async function planningBeforeState(action: PlanningLifecycleAction, input: Record<string, unknown>, dependencies: PlanningLifecycleDrizzleAdapterDependencies): Promise<unknown> {
  const plans = new DrizzlePlanningSetRepository(dependencies);
  const completed = new DrizzleCompletedServiceRecordRepository(dependencies);
  if (action === "saveWorkingSet" && typeof input.existingSetId === "string") return plans.findById(input.existingSetId);
  if (action === "finalizeWorkingSet" && typeof input.workingSetId === "string") return plans.findById(input.workingSetId);
  if (action === "reopenFinalSet" && typeof input.finalSetId === "string") return plans.findById(input.finalSetId);
  if (action === "completeFinalSet" && typeof input.finalSetId === "string") return plans.findById(input.finalSetId);
  if (action === "deletePlanningSet" && typeof input.setId === "string") return plans.findById(input.setId);
  if ((action === "updateCompletedRecord" || action === "deleteCompletedRecord") && typeof input.recordId === "string") return completed.findById(input.recordId);
  return null;
}

function planningAuditAction(action: PlanningLifecycleAction): string {
  const labels: Partial<Record<PlanningLifecycleAction, string>> = {
    saveWorkingSet: "planning.working.save",
    finalizeWorkingSet: "planning.final.create",
    reopenFinalSet: "planning.final.reopen",
    completeFinalSet: "planning.final.complete",
    deletePlanningSet: "planning.plan.delete",
    updateCompletedRecord: "planning.completed.update",
    deleteCompletedRecord: "planning.completed.delete",
  };
  return labels[action] ?? `planning.${action}`;
}

function planningObjectKind(action: PlanningLifecycleAction): string {
  return action === "updateCompletedRecord" || action === "deleteCompletedRecord" || action === "completeFinalSet" ? "completedService" : "planningSet";
}

function planningObjectRef(action: PlanningLifecycleAction, input: Record<string, unknown>, value: unknown): string {
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  for (const key of action === "updateCompletedRecord" || action === "deleteCompletedRecord" ? ["recordId"] : ["existingSetId", "workingSetId", "finalSetId", "setId"]) {
    if (typeof input[key] === "string" && input[key]) return String(input[key]);
  }
  return "new";
}
'''
replace_once("app/api/planning-lifecycle/route.ts", '\nfunction isRecord(value: unknown): value is Record<string, unknown>', planning_helpers + '\nfunction isRecord(value: unknown): value is Record<string, unknown>')

# ---------------------------------------------------------------------------
# Existing transaction-owning knowledge services
# ---------------------------------------------------------------------------
replace_once(
    "src/application/postgres-non-repetition-period.ts",
    'import type { ActorIdentity } from "./interaction-contracts";\n',
    'import type { ActorIdentity } from "./interaction-contracts";\nimport { appendAuditEvent, humanAuditActor } from "./audit-history";\n',
)
replace_once(
    "src/application/postgres-non-repetition-period.ts",
    '      await client.query("lock table service_contexts, service_sets, service_set_rows, reference_song_melody_memberships in share mode");\n      const usages = await listSavedPlanMelodyUsages(client);',
    '      await client.query("lock table service_contexts, service_sets, service_set_rows, reference_song_melody_memberships in share mode");\n      const currentResult = await client.query("select months from melody_non_repetition_config where id = \'global\' for update");\n      const beforeMonths = Number(currentResult.rows[0]?.months ?? 2);\n      const usages = await listSavedPlanMelodyUsages(client);',
)
replace_once(
    "src/application/postgres-non-repetition-period.ts",
    '''      await client.query(
        "insert into melody_non_repetition_config (id, months) values ('global', $1) on conflict (id) do update set months = excluded.months, updated_at = now()",
        [months],
      );
      await client.query("commit");''',
    '''      if (beforeMonths !== months) {
        await client.query(
          "insert into melody_non_repetition_config (id, months) values ('global', $1) on conflict (id) do update set months = excluded.months, updated_at = now()",
          [months],
        );
        await appendAuditEvent(client, {
          actor: humanAuditActor(actor),
          action: "knowledge.nonRepetition.set",
          objectKind: "nonRepetitionConfig",
          objectRef: "global",
          beforeState: { months: beforeMonths },
          afterState: { months },
        });
      }
      await client.query("commit");''',
)

replace_once(
    "src/application/reference-melody.ts",
    'import { displayReferenceNumber } from "./reference-catalog-contract";\n',
    'import { displayReferenceNumber } from "./reference-catalog-contract";\nimport { appendAuditEvent, humanAuditActor } from "./audit-history";\n',
)
replace_once("src/application/reference-melody.ts", '  mergeReferenceMelodyClasses(referenceSongId: string, mergeWithReferenceSongId: string): Promise<ReferenceMelodyClass | undefined>;', '  mergeReferenceMelodyClasses(referenceSongId: string, mergeWithReferenceSongId: string, actor: ActorIdentity): Promise<ReferenceMelodyClass | undefined>;')
replace_once("src/application/reference-melody.ts", '  async mergeReferenceMelodyClasses(anchor: string, target: string) {', '  async mergeReferenceMelodyClasses(anchor: string, target: string, actor: ActorIdentity) {')
replace_once(
    "src/application/reference-melody.ts",
    '      const memberships = await client.query("select reference_song_id,class_id from reference_song_melody_memberships where reference_song_id=any($1::text[]) order by class_id for update", [[anchor, target]]);',
    '      const beforeAnchor = await readClass(client, anchor);\n      const beforeTarget = anchor === target ? beforeAnchor : await readClass(client, target);\n      const memberships = await client.query("select reference_song_id,class_id from reference_song_melody_memberships where reference_song_id=any($1::text[]) order by class_id for update", [[anchor, target]]);',
)
replace_once(
    "src/application/reference-melody.ts",
    '''      const result = await readClass(client, anchor);
      await client.query("commit");''',
    '''      const result = await readClass(client, anchor);
      if (anchorClass !== targetClass && result) {
        await appendAuditEvent(client, {
          actor: humanAuditActor(actor),
          action: "knowledge.melody.merge",
          objectKind: "melodyClass",
          objectRef: result.classId,
          beforeState: { anchor: beforeAnchor, target: beforeTarget },
          afterState: result,
        });
      }
      await client.query("commit");''',
)
replace_once("src/application/reference-melody.ts", '    const value = await this.repo.mergeReferenceMelodyClasses(anchor, target);', '    const value = await this.repo.mergeReferenceMelodyClasses(anchor, target, actor);')

replace_once(
    "src/application/reference-antiphon-recommendation.ts",
    'import { displayReferenceNumber } from "./reference-catalog-contract";\n',
    'import { displayReferenceNumber } from "./reference-catalog-contract";\nimport { appendAuditEvent, humanAuditActor } from "./audit-history";\n',
)
replace_once("src/application/reference-antiphon-recommendation.ts", '  set(antiphonId: string, referenceSongId: string | null): Promise<SetResult>;', '  set(antiphonId: string, referenceSongId: string | null, actor: ActorIdentity): Promise<SetResult>;')
replace_once("src/application/reference-antiphon-recommendation.ts", '  async set(antiphonId: string, referenceSongId: string | null): Promise<SetResult> {', '  async set(antiphonId: string, referenceSongId: string | null, actor: ActorIdentity): Promise<SetResult> {')
replace_once(
    "src/application/reference-antiphon-recommendation.ts",
    '      const antiphon = (await client.query("select language from reference_antiphons where id=$1 for update", [antiphonId])).rows[0] as { language: "czech" | "polish" } | undefined;',
    '      const before = await joinedRead(client, antiphonId);\n      const antiphon = (await client.query("select language from reference_antiphons where id=$1 for update", [antiphonId])).rows[0] as { language: "czech" | "polish" } | undefined;',
)
replace_once(
    "src/application/reference-antiphon-recommendation.ts",
    '''      const value = await joinedRead(client, antiphonId);
      await client.query("commit");''',
    '''      const value = await joinedRead(client, antiphonId);
      const beforeSongId = before?.recommendedSong?.referenceSongId ?? null;
      const afterSongId = value?.recommendedSong?.referenceSongId ?? null;
      if (value && beforeSongId !== afterSongId) {
        await appendAuditEvent(client, {
          actor: humanAuditActor(actor),
          action: "knowledge.antiphonRecommendation.set",
          objectKind: "antiphon",
          objectRef: antiphonId,
          beforeState: before ?? null,
          afterState: value,
        });
      }
      await client.query("commit");''',
)
replace_once("src/application/reference-antiphon-recommendation.ts", '    const result = await this.repo.set(antiphonId, referenceSongId);', '    const result = await this.repo.set(antiphonId, referenceSongId, actor);')

# ---------------------------------------------------------------------------
# Congregation preference mutation is atomic with its human audit event
# ---------------------------------------------------------------------------
replace_once(
    "src/application/congregation-preference-voter.ts",
    'import type { Pool, PoolClient } from "pg";\n',
    'import type { Pool, PoolClient } from "pg";\nimport { appendAuditEvent } from "./audit-history";\n',
)
old_cong_save = '''    await this.pool.query(
      `insert into reference_song_preferences (profile_id, reference_song_id, score)
       values ($1, $2, $3)
       on conflict (profile_id, reference_song_id)
       do update set score = excluded.score, updated_at = now()`,
      [context.profileId, songId, score],
    );
    return { nickname: context.nickname, referenceSongId: songId, score, limit: 1 };'''
new_cong_save = '''    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query(
        "select score from reference_song_preferences where profile_id = $1 and reference_song_id = $2 for update",
        [context.profileId, songId],
      );
      const beforeScore = existing.rows[0] ? Number(existing.rows[0].score) : null;
      if (beforeScore !== score) {
        await client.query(
          `insert into reference_song_preferences (profile_id, reference_song_id, score)
           values ($1, $2, $3)
           on conflict (profile_id, reference_song_id)
           do update set score = excluded.score, updated_at = now()`,
          [context.profileId, songId, score],
        );
        await appendAuditEvent(client, {
          actor: { kind: "human", userId: context.userId, displayName: context.nickname, role: context.role },
          action: "preference.reference.save",
          objectKind: "referencePreference",
          objectRef: `${context.profileId}:${songId}`,
          beforeState: { score: beforeScore },
          afterState: { score },
        });
      }
      await client.query("commit");
      return { nickname: context.nickname, referenceSongId: songId, score, limit: 1 };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }'''
replace_once("src/application/congregation-preference-voter.ts", old_cong_save, new_cong_save)

# ---------------------------------------------------------------------------
# Simple Interaction API mutations use one raw PostgreSQL transaction.
# Existing complex knowledge services keep their own transactions above.
# ---------------------------------------------------------------------------
replace_once(
    "src/application/db-interaction-repository.ts",
    '  constructor(private readonly pool: Pool) {}',
    '  constructor(private readonly pool: Pick<Pool, "query">) {}',
)
replace_once(
    "app/api/interaction/route.ts",
    'import { Pool } from "pg";\n',
    'import { Pool, type PoolClient } from "pg";\n',
)
replace_once(
    "app/api/interaction/route.ts",
    'import type { CandidateHydrationInput, CandidateQueryInput, CandidateUsage } from "../../../src/application/interaction-contracts";\n',
    'import type { CandidateHydrationInput, CandidateQueryInput, CandidateUsage } from "../../../src/application/interaction-contracts";\nimport { appendAuditEvent, humanAuditActor } from "../../../src/application/audit-history";\n',
)
replace_once("app/api/interaction/route.ts", 'const pgCatalog = (pool: Pool) => ({ listSongs: async () => {', 'const pgCatalog = (pool: Pick<Pool, "query">) => ({ listSongs: async () => {')
replace_once(
    "app/api/interaction/route.ts",
    '      case "saveOwnPreference": { const input = asRecord(body.input); return NextResponse.json(await service.saveOwnPreference(actor, String(input.songId), Number(input.score))); }',
    '      case "saveOwnPreference": { const input = asRecord(body.input); return NextResponse.json(await auditedInteractionMutation(pool, actor, "preference.local.save", "songPreference", String(input.songId), body.input, (client) => new InteractionService(new PgInteractionRepository(client), pgCatalog(client)).saveOwnPreference(actor, String(input.songId), Number(input.score)))); }',
)
replace_once(
    "app/api/interaction/route.ts",
    '      case "saveOwnReferencePreference":\n      case "saveReferenceOwnPreference": { const input = referencePreferenceInput(body.input, true); return respond(await service.saveReferenceOwnPreference(actor, input.referenceSongId, input.score!)); }',
    '      case "saveOwnReferencePreference":\n      case "saveReferenceOwnPreference": { const input = referencePreferenceInput(body.input, true); return respond(await auditedInteractionMutation(pool, actor, "preference.reference.save", "referencePreference", input.referenceSongId, body.input, (client) => new InteractionService(new PgInteractionRepository(client), pgCatalog(client)).saveReferenceOwnPreference(actor, input.referenceSongId, input.score!))); }',
)
replace_once(
    "app/api/interaction/route.ts",
    '      case "setReferenceRepertoireMembership": { const input = referenceRepertoireInput(body.input, true); validateRepertoireActor(body.actor); return respond(await referenceRepertoire.set(actor, input.referenceSongId, input.organistPersonId, input.active!)); }',
    '      case "setReferenceRepertoireMembership": { const input = referenceRepertoireInput(body.input, true); validateRepertoireActor(body.actor); return respond(await auditedInteractionMutation(pool, actor, "repertoire.reference.set", "referenceRepertoire", `${input.organistPersonId ?? actor.personId ?? actor.userId}:${input.referenceSongId}`, body.input, (client) => new ReferenceRepertoireService(new PgReferenceRepertoireRepository(client)).set(actor, input.referenceSongId, input.organistPersonId, input.active!))); }',
)
replace_once(
    "app/api/interaction/route.ts",
    '      case "setRepertoire": { const input = asRecord(body.input); return NextResponse.json(await service.setRepertoire(actor, String(input.organistPersonId), String(input.songId), Boolean(input.active))); }',
    '      case "setRepertoire": { const input = asRecord(body.input); return NextResponse.json(await auditedInteractionMutation(pool, actor, "repertoire.local.set", "repertoire", `${String(input.organistPersonId)}:${String(input.songId)}`, body.input, (client) => new InteractionService(new PgInteractionRepository(client), pgCatalog(client)).setRepertoire(actor, String(input.organistPersonId), String(input.songId), Boolean(input.active)))); }',
)
interaction_helper = '''
async function auditedInteractionMutation<T>(
  pool: Pool,
  actor: ActorIdentity,
  action: string,
  objectKind: string,
  objectRef: string,
  requestDelta: unknown,
  mutate: (client: PoolClient) => Promise<{ success: true; value: T } | { success: false; error: { code: string; message: string } }>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await mutate(client);
    if (result.success) {
      await appendAuditEvent(client, {
        actor: humanAuditActor(actor),
        action,
        objectKind,
        objectRef,
        beforeState: null,
        afterState: { request: requestDelta, result: result.value },
      });
    }
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
'''
replace_once("app/api/interaction/route.ts", '\nfunction asRecord(value: unknown): Record<string, unknown>', interaction_helper + '\nfunction asRecord(value: unknown): Record<string, unknown>')

# ---------------------------------------------------------------------------
# Static + database acceptance for persistence contract
# ---------------------------------------------------------------------------
write("scripts/issue-222-audit-tests.ts", '''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { appendAuditEvent, listAuditEvents } from "../src/application/audit-history";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 222 audit acceptance.");
const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query("delete from audit_events where action like 'acceptance.issue222.%'");
  await appendAuditEvent(pool, {
    actor: { kind: "human", userId: "acceptance-admin", displayName: "Acceptance Admin", role: "admin" },
    action: "acceptance.issue222.human",
    objectKind: "test",
    objectRef: "human",
    beforeState: { value: 1 },
    afterState: { value: 2 },
  });
  let events = (await listAuditEvents(pool, 100)).filter((event) => event.action.startsWith("acceptance.issue222."));
  assert.equal(events.length, 1);
  assert.equal(events[0].actorKind, "human");
  assert.equal(events[0].actorDisplayName, "Acceptance Admin");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await appendAuditEvent(client, { actor: { kind: "system" }, action: "acceptance.issue222.rollback", objectKind: "test", objectRef: "rollback", afterState: { rowsChanged: 4 } });
    await client.query("rollback");
  } finally { client.release(); }
  events = (await listAuditEvents(pool, 100)).filter((event) => event.action.startsWith("acceptance.issue222."));
  assert.equal(events.some((event) => event.action === "acceptance.issue222.rollback"), false, "rolled-back audit event must not survive");

  await appendAuditEvent(pool, { actor: { kind: "system" }, action: "acceptance.issue222.logical", objectKind: "test", objectRef: "multi-row", afterState: { rowsChanged: 4 } });
  events = (await listAuditEvents(pool, 100)).filter((event) => event.action === "acceptance.issue222.logical");
  assert.equal(events.length, 1, "one logical action must be one event");

  const planningRoute = await readFile("app/api/planning-lifecycle/route.ts", "utf8");
  assert.match(planningRoute, /planning\.final\.autoComplete/);
  assert.match(planningRoute, /systemAuditActor\(\)/);
  assert.match(planningRoute, /db\.transaction/);
  const auditPage = await readFile("app/admin/audit-history/page.tsx", "utf8");
  assert.match(auditPage, /roles\.includes\("admin"\)/);
  assert.doesNotMatch(auditPage, /delete from audit_events|update audit_events/i);
  const interactionRoute = await readFile("app/api/interaction/route.ts", "utf8");
  assert.match(interactionRoute, /auditedInteractionMutation/);
  const policy = await readFile("docs/audit-change-history-policy.md", "utf8");
  assert.match(policy, /append-only/i);
  console.log("Issue #222 audit history acceptance passed.");
} finally {
  await pool.query("delete from audit_events where action like 'acceptance.issue222.%'").catch(() => undefined);
  await pool.end();
}
''')

package = json.loads(read("package.json"))
package["scripts"]["verify:issue-222"] = "tsx scripts/issue-222-audit-tests.ts"
write("package.json", json.dumps(package, indent=2, ensure_ascii=False) + "\n")

replace_once(
    ".github/workflows/ci.yml",
    '''      - name: Database migration
        run: |
          set -o pipefail
          npm run db:migrate 2>&1 | tee db-migrate.log
      - name: Phase 30.1 DB lifecycle smoke''',
    '''      - name: Database migration
        run: |
          set -o pipefail
          npm run db:migrate 2>&1 | tee db-migrate.log
      - name: Issue 222 append-only audit history acceptance
        run: npm run verify:issue-222
      - name: Phase 30.1 DB lifecycle smoke''',
)

print("Issue #222 source patches applied.")
