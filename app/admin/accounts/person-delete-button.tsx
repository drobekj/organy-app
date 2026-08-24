"use client";

import { useState } from "react";

export function PersonDeleteButton({ personId, displayName }: { personId: string; displayName: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function deletePerson() {
    if (!window.confirm(`Permanently delete Person ${displayName}? This succeeds only when no account or service history references it.`)) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/protected-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deletePerson", personId }),
      });
      const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
      if (!response.ok) {
        setError(body?.error?.message ?? "Person was not deleted.");
        return;
      }
      window.location.assign("/admin/accounts?message=Person%20permanently%20deleted.");
    } catch {
      setError("Person was not deleted. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <div>
    <button type="button" disabled={pending} onClick={deletePerson}>{pending ? "Deleting…" : "Delete Person permanently"}</button>
    {error && <p className="auth-error" role="alert">{error}</p>}
  </div>;
}
