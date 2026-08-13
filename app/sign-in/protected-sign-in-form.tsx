"use client";

import { FormEvent, useState } from "react";
import { authClient } from "../../src/auth/client";
import { PasswordVisibilityField } from "../password-visibility-field";

export function ProtectedSignInForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signIn.username({ username, password });
      if (result.error) {
        setError("Invalid username or password.");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Sign in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <label>
          Username
          <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <PasswordVisibilityField
          id="sign-in-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <a href="/congregation-preferences">Congregation preferences</a>
      </form>
    </main>
  );
}
