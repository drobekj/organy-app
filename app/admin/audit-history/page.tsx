import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { canReadAuditHistory, listAuditEvents } from "../../../src/application/audit-history";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";

export default async function AuditHistoryPage() {
  if (process.env.ORGANY_RUNTIME !== "db") redirect("/");
  const requestHeaders = await headers();
  let currentUser;
  try { currentUser = await resolveProtectedUser(requestHeaders, authPool); }
  catch (error) { if (error instanceof ProtectedActorError) redirect("/sign-in"); throw error; }
  if (!canReadAuditHistory(currentUser.roles)) redirect("/");

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
