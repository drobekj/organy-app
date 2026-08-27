import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../../../src/application/active-role";
import { canReadAuditHistory, listAuditEvents } from "../../../src/application/audit-history";
import { presentAuditEvent, type AuditServiceField, type AuditStatePresentation } from "../../../src/application/audit-history-view";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";

export default async function AuditHistoryPage() {
  if (process.env.ORGANY_RUNTIME !== "db") redirect("/");
  const requestHeaders = await headers();
  let currentUser;
  try { currentUser = await resolveProtectedUser(requestHeaders, authPool); }
  catch (error) { if (error instanceof ProtectedActorError) redirect("/sign-in"); throw error; }
  const activeRole = resolveOwnedActiveRole(currentUser.roles, (await cookies()).get(ACTIVE_ROLE_COOKIE_NAME)?.value);
  if (!canReadAuditHistory(currentUser.roles) || activeRole !== "admin") redirect("/");

  const events = await listAuditEvents(authPool);
  return <main className="shell"><section className="card planning-form audit-history-card" aria-label="Audit history">
    <div className="app-header"><div><h1>Audit history</h1></div><a href="/">Back to planning</a></div>
    <p className="field-help">Successful business changes only. Audit history is append-only and read-only.</p>
    <div className="audit-event-list">
      {events.length === 0 && <p>No audit events recorded yet.</p>}
      {events.map((event) => {
        const view = presentAuditEvent(event);
        return <article className="audit-event" key={event.id}>
          <p className="audit-event-header">
            <strong>{view.objectLabel}</strong>
            <span>{view.action}</span>
            <Separator />
            <span>Actor: {view.actorLabel}</span>
            <Separator />
            <span>{view.occurredAtLabel}</span>
          </p>
          <AuditStateLine label="before" state={view.before} />
          <AuditStateLine label="after" state={view.after} />
        </article>;
      })}
    </div>
  </section></main>;
}

function AuditStateLine({ label, state }: { label: "before" | "after"; state: AuditStatePresentation }) {
  return <div className="audit-state-line">
    <strong className="audit-state-label">{label}:</strong>
    {state.kind === "service" && <AuditServiceState fields={state.fields} />}
    {state.kind === "generic" && <code className="audit-generic-state">{state.text}</code>}
  </div>;
}

function AuditServiceState({ fields }: { fields: AuditServiceField[] }) {
  const primary = fields.filter((field) => field.key !== "rows" && field.key !== "lifecycle");
  const rows = fields.find((field) => field.key === "rows");
  const lifecycle = fields.find((field) => field.key === "lifecycle");

  return <div className="audit-service-state">
    <div className="audit-service-primary">
      {primary.map((field, index) => <span className="audit-state-field-group" key={field.key}>
        {index > 0 && <Separator />}
        <AuditField field={field} />
      </span>)}
    </div>
    <div className="audit-service-secondary">
      {rows && <AuditField field={rows} />}
      {lifecycle && <span className="audit-lifecycle-slot"><Separator /><AuditField field={lifecycle} /></span>}
    </div>
  </div>;
}

function AuditField({ field }: { field: AuditServiceField }) {
  return <span className={field.tone === "muted" ? "audit-state-muted" : field.tone === "changed" ? "audit-state-changed" : undefined}>
    {field.text}
  </span>;
}

function Separator() {
  return <span className="audit-separator" aria-hidden="true">·</span>;
}
