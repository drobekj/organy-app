"use client";

import { FormEvent, useState } from "react";
import { authClient } from "../src/auth/client";
import { PasswordVisibilityField } from "./password-visibility-field";

export function ProtectedAccountControls({ displayName }: { displayName: string }) {
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await authClient.signOut();
      window.location.assign("/sign-in");
    } finally {
      setPending(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
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
      setPending(false);
    }
  }

  return (
    <section className="protected-account-controls" aria-label="Signed-in account">
      <strong>{displayName}</strong>
      <button type="button" onClick={() => { setEditingPassword((value) => !value); setFeedback(null); }}>Change password</button>
      <button type="button" onClick={signOut} disabled={pending}>Sign out</button>
      {editingPassword && (
        <form onSubmit={changePassword}>
          <PasswordVisibilityField
            id="current-account-password"
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <PasswordVisibilityField
            id="new-account-password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />
          <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
        </form>
      )}
      {feedback && <span role="status">{feedback}</span>}
    </section>
  );
}
