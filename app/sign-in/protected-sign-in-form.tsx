"use client";

import { FormEvent, useEffect, useState } from "react";
import type { CongregationVoterMode } from "../../src/application/congregation-voter-mode";
import { authClient } from "../../src/auth/client";
import { PasswordVisibilityField } from "../password-visibility-field";

type EntryInfo = "staff" | "vote";

const staffInfo = "For priest, organist, or admin.";
const temporaryVoteInfo = "Vote without signing in. Your votes stay linked to this browser.";
const registeredVoteInfo = "Sign in or register to vote.";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    'button, a, input, select, textarea, summary, label, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])',
  ));
}

export function ProtectedSignInForm({ congregationVoterMode }: { congregationVoterMode: CongregationVoterMode }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [openInfo, setOpenInfo] = useState<EntryInfo | null>(null);
  const temporaryVoting = congregationVoterMode === "temporaryBrowser";
  const voteInfo = temporaryVoting ? temporaryVoteInfo : registeredVoteInfo;

  useEffect(() => {
    if (!openInfo) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-auth-entry-info-panel], [data-auth-entry-info-trigger]")) return;
      if (isInteractiveTarget(target)) return;
      setOpenInfo(null);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openInfo]);

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
      <section className="auth-card">
        <h1>Sign in</h1>

        <form className="auth-staff-sign-in" onSubmit={submit}>
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
          <div className="auth-entry-action">
            <button
              className="auth-entry-primary"
              type="submit"
              disabled={pending}
              aria-describedby="auth-staff-info-desktop"
            >
              {pending ? "Signing in…" : "Sign In"}
            </button>
            <button
              className="auth-entry-info-button"
              type="button"
              data-auth-entry-info-trigger
              aria-label="About staff sign in"
              aria-expanded={openInfo === "staff"}
              aria-controls="auth-staff-info-mobile"
              onClick={() => setOpenInfo((current) => current === "staff" ? null : "staff")}
            >
              i
            </button>
            <p id="auth-staff-info-desktop" className="auth-entry-hover-info" role="tooltip">{staffInfo}</p>
            {openInfo === "staff" && (
              <p id="auth-staff-info-mobile" className="auth-entry-mobile-info" data-auth-entry-info-panel>
                {staffInfo}
              </p>
            )}
          </div>
        </form>

        {temporaryVoting ? (
          <form className="auth-vote-entry" action="/api/congregation-preferences" method="post">
            <input type="hidden" name="action" value="startTemporaryVoting" />
            <div className="auth-entry-action">
              <button
                className="auth-entry-primary"
                type="submit"
                aria-describedby="auth-vote-info-desktop"
              >
                Vote for Songs
              </button>
              <button
                className="auth-entry-info-button"
                type="button"
                data-auth-entry-info-trigger
                aria-label="About congregation voting"
                aria-expanded={openInfo === "vote"}
                aria-controls="auth-vote-info-mobile"
                onClick={() => setOpenInfo((current) => current === "vote" ? null : "vote")}
              >
                i
              </button>
              <p id="auth-vote-info-desktop" className="auth-entry-hover-info" role="tooltip">{voteInfo}</p>
              {openInfo === "vote" && (
                <p id="auth-vote-info-mobile" className="auth-entry-mobile-info" data-auth-entry-info-panel>
                  {voteInfo}
                </p>
              )}
            </div>
          </form>
        ) : (
          <div className="auth-vote-entry">
            <div className="auth-entry-action">
              <a
                className="auth-entry-primary"
                href="/congregation-preferences?entry=1"
                aria-describedby="auth-vote-info-desktop"
              >
                Vote for Songs
              </a>
              <button
                className="auth-entry-info-button"
                type="button"
                data-auth-entry-info-trigger
                aria-label="About congregation voting"
                aria-expanded={openInfo === "vote"}
                aria-controls="auth-vote-info-mobile"
                onClick={() => setOpenInfo((current) => current === "vote" ? null : "vote")}
              >
                i
              </button>
              <p id="auth-vote-info-desktop" className="auth-entry-hover-info" role="tooltip">{voteInfo}</p>
              {openInfo === "vote" && (
                <p id="auth-vote-info-mobile" className="auth-entry-mobile-info" data-auth-entry-info-panel>
                  {voteInfo}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
