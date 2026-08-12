"use client";
import { FormEvent, useEffect, useState } from "react";
import type { AppUser } from "../src/application/interaction-contracts";
import { authClient } from "../src/auth/client";
import PlanningLifecycleClient from "./planning-lifecycle-client";

type StaffSessionPayload = { success?: boolean; value?: AppUser; error?: { message?: string } };

export default function StaffAuthGate() {
  const [user, setUser] = useState<AppUser>();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  async function refreshSession() {
    const response = await fetch("/api/staff-session", { cache: "no-store" });
    if (!response.ok) { setUser(undefined); return false; }
    const payload = await response.json() as StaffSessionPayload;
    if (!payload.success || !payload.value) { setUser(undefined); return false; }
    setUser(payload.value); return true;
  }
  useEffect(() => { void refreshSession().finally(() => setLoading(false)); }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setError("");
    const result = await authClient.signIn.username({ username, password });
    if (result.error) { setError(result.error.message ?? "Sign-in failed."); return; }
    if (!await refreshSession()) { setError("Account signed in but has no valid active staff link."); return; }
    setPassword("");
  }
  async function signOut() { await authClient.signOut(); setUser(undefined); setUsername(""); setPassword(""); setError(""); }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordStatus("");
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) { setPasswordStatus(result.error.message ?? "Password change failed."); return; }
    event.currentTarget.reset(); setPasswordStatus("Password changed.");
  }

  if (loading) return <main style={{ maxWidth: 460, margin: "5rem auto", padding: "1.5rem" }}>Loading staff session…</main>;
  if (!user) return <main style={{ maxWidth: 420, margin: "5rem auto", padding: "1.5rem", border: "1px solid #d8dbe0", borderRadius: 10 }}><h1 style={{ marginTop: 0, fontSize: "1.35rem" }}>Staff sign in</h1><form onSubmit={signIn} style={{ display: "grid", gap: "0.8rem" }}><label>Username<input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "0.55rem" }} /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "0.55rem" }} /></label>{error ? <div role="alert">{error}</div> : null}<button type="submit">Sign in</button></form></main>;
  return <><div style={{ maxWidth: 1180, margin: "0.8rem auto 0", padding: "0 1rem", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.7rem", flexWrap: "wrap" }}><strong>{user.displayName}</strong><details><summary style={{ cursor: "pointer" }}>Change password</summary><form onSubmit={changePassword} style={{ display: "grid", gap: "0.45rem", paddingTop: "0.5rem" }}><input name="currentPassword" type="password" autoComplete="current-password" placeholder="Current password" required /><input name="newPassword" type="password" autoComplete="new-password" placeholder="New password" minLength={8} required /><button type="submit">Save password</button>{passwordStatus ? <small>{passwordStatus}</small> : null}</form></details><button type="button" onClick={() => void signOut()}>Sign out</button></div><PlanningLifecycleClient runtimeMode="db" authenticatedUser={user} /></>;
}
