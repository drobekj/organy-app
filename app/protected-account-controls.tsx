"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PlanningRole } from "../src/planning-lifecycle";
import { ACTIVE_ROLE_CHANGED_EVENT, isPlanningRole } from "../src/application/active-role";
import { authClient } from "../src/auth/client";
import { PasswordVisibilityField } from "./password-visibility-field";

type PendingAccountAction = "signOut" | "changePassword" | null;

type TrackedButtonState = {
  button: HTMLButtonElement;
  originalDisabled: boolean;
  originalText: string;
  requests: number;
  releaseTimer: number | null;
};

function processingLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.startsWith("save")) return "Saving…";
  if (normalized.startsWith("finalize")) return "Finalizing…";
  if (normalized.startsWith("complete")) return "Completing…";
  if (normalized.startsWith("delete")) return "Deleting…";
  if (normalized.startsWith("reopen")) return "Reopening…";
  if (normalized.startsWith("refresh")) return "Refreshing…";
  if (normalized.startsWith("merge")) return "Merging…";
  if (normalized.startsWith("add")) return "Adding…";
  if (normalized.startsWith("remove")) return "Removing…";
  if (normalized.startsWith("toggle")) return "Updating…";
  if (normalized.startsWith("mark")) return "Updating…";
  if (normalized.startsWith("set")) return "Saving…";
  return "Processing…";
}

function formatRole(role: PlanningRole): string {
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

export function ProtectedAccountControls({ displayName, roles, initialActiveRole }: { displayName: string; roles: string[]; initialActiveRole: PlanningRole }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAccountAction>(null);
  const [activeRole, setActiveRole] = useState<PlanningRole>(initialActiveRole);
  const userMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let frame = 0;
    let attachedHeader: HTMLElement | null = null;
    let previousTabIndex: string | null = null;
    let previousDescribedBy: string | null = null;
    let helper: HTMLElement | null = null;
    let helperHadId = false;

    function attachToWorkspaceHeader() {
      const header = document.querySelector<HTMLElement>(".app-header");
      if (!header) {
        frame = window.requestAnimationFrame(attachToWorkspaceHeader);
        return;
      }

      attachedHeader = header;
      previousTabIndex = header.getAttribute("tabindex");
      previousDescribedBy = header.getAttribute("aria-describedby");
      helper = header.querySelector<HTMLElement>(".lede");
      helperHadId = Boolean(helper?.id);
      if (helper && !helper.id) helper.id = "workspace-helper-copy";
      header.tabIndex = 0;
      if (helper?.id) header.setAttribute("aria-describedby", helper.id);
      setPortalTarget(header);
    }

    attachToWorkspaceHeader();

    return () => {
      window.cancelAnimationFrame(frame);
      if (!attachedHeader) return;
      if (previousTabIndex === null) attachedHeader.removeAttribute("tabindex");
      else attachedHeader.setAttribute("tabindex", previousTabIndex);
      if (previousDescribedBy === null) attachedHeader.removeAttribute("aria-describedby");
      else attachedHeader.setAttribute("aria-describedby", previousDescribedBy);
      if (helper && !helperHadId && helper.id === "workspace-helper-copy") helper.removeAttribute("id");
    };
  }, []);

  useEffect(() => {
    function handleActiveRoleChange(event: Event) {
      const role = (event as CustomEvent<unknown>).detail;
      if (isPlanningRole(role) && roles.includes(role)) setActiveRole(role);
    }
    window.addEventListener(ACTIVE_ROLE_CHANGED_EVENT, handleActiveRoleChange);
    return () => window.removeEventListener(ACTIVE_ROLE_CHANGED_EVENT, handleActiveRoleChange);
  }, [roles]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window) as typeof window.fetch;
    let armedButton: HTMLButtonElement | null = null;
    let active: TrackedButtonState | null = null;

    function clearActive(expected: TrackedButtonState) {
      if (active !== expected || expected.requests !== 0) return;
      if (expected.releaseTimer !== null) window.clearTimeout(expected.releaseTimer);
      if (expected.button.isConnected) {
        expected.button.disabled = expected.originalDisabled;
        expected.button.removeAttribute("aria-busy");
        expected.button.classList.remove("workspace-action-pending");
        expected.button.textContent = expected.originalText;
      }
      active = null;
    }

    function scheduleRelease(state: TrackedButtonState) {
      if (state.releaseTimer !== null) window.clearTimeout(state.releaseTimer);
      state.releaseTimer = window.setTimeout(() => clearActive(state), 60);
    }

    function begin(button: HTMLButtonElement): TrackedButtonState {
      if (active?.button === button) {
        if (active.releaseTimer !== null) {
          window.clearTimeout(active.releaseTimer);
          active.releaseTimer = null;
        }
        return active;
      }
      if (active && active.requests === 0) clearActive(active);
      const state: TrackedButtonState = {
        button,
        originalDisabled: button.disabled,
        originalText: button.textContent ?? "",
        requests: 0,
        releaseTimer: null,
      };
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.classList.add("workspace-action-pending");
      button.textContent = processingLabel(state.originalText);
      active = state;
      return state;
    }

    const trackedFetch: typeof window.fetch = async (...args) => {
      const button = armedButton ?? active?.button ?? null;
      if (!button) return originalFetch(...args);
      const state = begin(button);
      armedButton = null;
      state.requests += 1;
      try {
        return await originalFetch(...args);
      } finally {
        state.requests -= 1;
        if (state.requests === 0) scheduleRelease(state);
      }
    };

    function captureWorkspaceAction(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button") ?? null;
      if (!button || button.disabled || button.closest(".workspace-account-panel")) return;
      if (!button.closest(".planning-card .form-actions, .planning-card .db-workspace")) return;
      armedButton = button;
      window.setTimeout(() => {
        if (armedButton === button) armedButton = null;
      }, 0);
    }

    document.addEventListener("click", captureWorkspaceAction, true);
    window.fetch = trackedFetch;

    return () => {
      document.removeEventListener("click", captureWorkspaceAction, true);
      if (window.fetch === trackedFetch) window.fetch = originalFetch;
      if (active) {
        active.requests = 0;
        clearActive(active);
      }
    };
  }, []);

  async function signOut() {
    if (pendingAction) return;
    setFeedback(null);
    setPendingAction("signOut");
    try {
      await authClient.signOut();
      window.location.assign("/sign-in");
    } finally {
      setPendingAction(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingAction) return;
    setFeedback(null);
    setPendingAction("changePassword");
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (result.error) {
        setFeedback("Password change failed. Check the current password and the new password requirements.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setEditingPassword(false);
      setFeedback("Password changed.");
    } catch {
      setFeedback("Password change failed.");
    } finally {
      setPendingAction(null);
    }
  }

  const activeAdmin = activeRole === "admin" && roles.includes("admin");
  const pending = pendingAction !== null;

  if (!portalTarget) return null;

  return createPortal(
    <div className="workspace-account-panel" aria-label="Signed-in account">
      <details className="workspace-account-menu" ref={userMenuRef}>
        <summary>
          <span>User <strong>{displayName}</strong></span>
          <span className="workspace-menu-dots" aria-hidden="true">⋯</span>
        </summary>
        <div className="workspace-account-popover">
          {!editingPassword ? (
            <>
              <button type="button" onClick={() => { setEditingPassword(true); setFeedback(null); }} disabled={pending}>Change Password</button>
              <button type="button" onClick={signOut} disabled={pending} aria-busy={pendingAction === "signOut"}>{pendingAction === "signOut" ? "Signing Out…" : "Sign Out"}</button>
            </>
          ) : (
            <form className="workspace-password-form" onSubmit={changePassword}>
              <PasswordVisibilityField id="current-account-password" label="Current password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              <PasswordVisibilityField id="new-account-password" label="New password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
              <div className="workspace-account-actions">
                <button type="submit" disabled={pending} aria-busy={pendingAction === "changePassword"}>{pendingAction === "changePassword" ? "Saving…" : "Save Password"}</button>
                <button type="button" disabled={pending} onClick={() => { setEditingPassword(false); setCurrentPassword(""); setNewPassword(""); setFeedback(null); }}>Cancel</button>
              </div>
            </form>
          )}
          {feedback && <span className="workspace-account-feedback" role="status">{feedback}</span>}
        </div>
      </details>

      {activeAdmin ? (
        <details className="workspace-account-menu workspace-role-menu">
          <summary>
            <span>Role <strong>Admin</strong></span>
            <span className="workspace-menu-dots" aria-hidden="true">⋯</span>
          </summary>
          <div className="workspace-account-popover">
            <a href="/admin/accounts">Manage Accounts</a>
            <a href="/admin/audit-history">Audit History</a>
          </div>
        </details>
      ) : (
        <span className="workspace-role-label">Role <strong>{formatRole(activeRole)}</strong></span>
      )}
    </div>,
    portalTarget,
  );
}
