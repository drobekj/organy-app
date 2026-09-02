"use client";

import type { AuditStatePresentation } from "../src/application/audit-history-view";
import { presentAuditEvent } from "../src/application/audit-history-view";
import { DEMO_D5_ACCOUNTS, DEMO_D5_AUDIT_EVENTS } from "../src/demo/d5-admin-fixture";

export type DemoAdminView = "accounts" | "audit";

export function DemoResetButton() {
  return (
    <button
      type="button"
      className="demo-reset-button"
      onClick={() => window.location.reload()}
      title="Discard all local Demo changes and restore the original synthetic fixture."
    >
      Reset Demo
    </button>
  );
}

export function DemoAccountsWorkspace() {
  return (
    <section className="demo-admin-workspace" aria-label="Demo Accounts">
      <div className="demo-admin-intro">
        <strong>Synthetic read-only Accounts</strong>
        <span>No Production accounts, credentials or authentication records are loaded.</span>
      </div>
      <div className="demo-account-list">
        {DEMO_D5_ACCOUNTS.map((account) => (
          <article className="demo-account-card" key={account.id}>
            <div>
              <strong>{account.displayName}</strong>
              <span className="field-help">@{account.username}</span>
            </div>
            <dl>
              <div><dt>Status</dt><dd>{account.active ? "Active" : "Inactive"}</dd></div>
              <div><dt>Roles</dt><dd>{account.roles.map(formatRole).join(", ")}</dd></div>
              <div><dt>Linked person</dt><dd>{account.linkedPerson ?? "—"}</dd></div>
            </dl>
            <div className="demo-account-disabled-actions" aria-label="Account mutations disabled in Demo">
              <button type="button" disabled>Edit roles</button>
              <button type="button" disabled>Deactivate</button>
              <button type="button" disabled>Reset password</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DemoAuditWorkspace() {
  return (
    <section className="demo-admin-workspace audit-history-card" aria-label="Demo Audit history">
      <div className="demo-admin-intro">
        <strong>Synthetic Audit History</strong>
        <span>Read-only fixture only. No Production audit events are queried.</span>
      </div>
      <div className="audit-event-list">
        {DEMO_D5_AUDIT_EVENTS.map((event) => {
          const view = presentAuditEvent(event);
          return (
            <article className="audit-event" key={event.id}>
              <p className="audit-event-header">
                <strong>{view.objectLabel}</strong>
                <span>{view.action}</span>
                <Separator />
                <span>Actor: {view.actorLabel}</span>
                <Separator />
                <span>{view.occurredAtLabel}</span>
              </p>
              <AuditRule />
              <AuditState label="after" state={view.after} />
              <AuditRule />
              <AuditState label="before" state={view.before} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AuditRule() {
  return <div className="audit-section-rule" aria-hidden="true" />;
}

function AuditState({ label, state }: { label: "before" | "after"; state: AuditStatePresentation }) {
  return (
    <div className="audit-state-line">
      <strong className="audit-state-label">{label}:</strong>
      {state.kind === "empty" && <span className="audit-state-muted">—</span>}
      {state.kind === "generic" && <code className="audit-generic-state">{state.text}</code>}
      {state.kind === "service" && (
        <div className="audit-service-state">
          <div className="demo-audit-fields">
            {state.fields.map((field) => (
              <span
                key={field.key}
                className={field.tone === "muted" ? "audit-state-muted" : field.tone === "changed" ? "audit-state-changed" : undefined}
              >
                {field.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Separator() {
  return <span className="audit-separator" aria-hidden="true">·</span>;
}

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
