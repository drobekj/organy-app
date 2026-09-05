import { cookies } from "next/headers";
import { getAppDbPool } from "../../src/db/app-pool";
import { CongregationVoterError, PostgresCongregationPreferenceService } from "../../src/application/congregation-preference-voter";
import { isTemporaryCongregationVoterMode } from "../../src/application/congregation-voter-mode";
import { PostgresReferenceCatalogProvider } from "../../src/application/postgres-reference-catalog";
import { CongregationPreferenceWorkspace } from "./congregation-preference-workspace";

const CONTEXT_COOKIE = "organy_congregation_voter";
const TEMPORARY_ACCOUNT_PREFIX = "congregation-account:temporary:";
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CongregationPreferencesPage({ searchParams }: PageProps) {
  if (process.env.ORGANY_RUNTIME !== "db") return configurationMessage("Congregation preferences are available in DB runtime.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return configurationMessage("DATABASE_URL is required for congregation preferences.");
  const params = await searchParams;
  if (first(params.entry) === "1") return entryPanel(params);
  const temporaryMode = isTemporaryCongregationVoterMode();

  const token = (await cookies()).get(CONTEXT_COOKIE)?.value;
  if (!token) return temporaryMode ? temporaryEntryPanel() : entryPanel(params);
  const pool = getAppDbPool(databaseUrl);
  const service = new PostgresCongregationPreferenceService(pool);
  let voter;
  try {
    voter = await service.resolveContext(token);
  } catch (error) {
    if (error instanceof CongregationVoterError && error.code === "unauthenticated") {
      return temporaryMode ? temporaryEntryPanel(true) : entryPanel({ ...params, notice: "sessionExpired" });
    }
    throw error;
  }
  if (temporaryMode && !voter.accountId.startsWith(TEMPORARY_ACCOUNT_PREFIX)) return temporaryEntryPanel();

  const catalog = new PostgresReferenceCatalogProvider(pool);
  const [records, preferences] = await Promise.all([catalog.listAll("all"), service.listOwnReferencePreferences(token)]);

  return (
    <main className="shell">
      <section className="card planning-form congregation-preferences-card" aria-label="Congregation preference voting">
        <div className="app-header">
          <div>
            <p className="eyebrow">Congregation preference</p>
            <h1>{temporaryMode ? "Congregation Preferences" : voter.nickname}</h1>
          </div>
          {!temporaryMode && (
            <div className="form-actions">
              <form action="/api/congregation-preferences" method="post">
                <input type="hidden" name="action" value="clearNickname" />
                <button type="submit">Change nickname</button>
              </form>
            </div>
          )}
        </div>

        {voter.status === "legacy_unverified" && !temporaryMode ? (
          <aside className="congregation-legacy-claim" role="status">
            <span>This existing nickname is not yet protected by a verified email.</span>
            <a href={`/congregation-preferences?entry=1&view=register&claim=1&nickname=${encodeURIComponent(voter.nickname)}`}>Verify email</a>
          </aside>
        ) : temporaryMode ? (
          <p className="field-help">Temporary test mode: your preferences are linked only to this browser. No registration or email is required.</p>
        ) : (
          <p className="field-help">Your preferences are linked to your stable voter profile.</p>
        )}

        <CongregationPreferenceWorkspace records={records} preferences={preferences} />
      </section>
    </main>
  );
}

function temporaryEntryPanel(expired = false) {
  return (
    <main className="auth-shell">
      <section className="auth-card congregation-entry-card" aria-label="Congregation Preferences temporary voting">
        <h1>Congregation Preferences</h1>
        <p className="field-help">Vote for your favorite songs to be considered.</p>
        <p className="field-help">Temporary test mode: no registration, nickname or email is required. Your votes remain linked to this browser.</p>
        {expired && <p role="alert" className="auth-error">This browser&apos;s previous test voter session has expired. Start a new test voter to continue.</p>}
        <form className="congregation-entry-sign-in" action="/api/congregation-preferences" method="post">
          <input type="hidden" name="action" value="startTemporaryVoting" />
          <button className="congregation-entry-button" type="submit">Start voting</button>
        </form>
        <div className="congregation-entry-divider" aria-hidden="true" />
        <div className="congregation-entry-options">
          <EntryOption href="/sign-in" label="Staff sign in" help="if you are a priest, organist or admin" />
        </div>
      </section>
    </main>
  );
}

function entryPanel(params: Record<string, string | string[] | undefined>) {
  if (isTemporaryCongregationVoterMode()) return temporaryEntryPanel();
  const view = first(params.view);
  const nickname = first(params.nickname) ?? "";
  const notice = first(params.notice);
  if (view === "register") return registrationPanel(nickname, notice, first(params.claim) === "1");
  if (view === "recover") return recoveryPanel(notice);
  return (
    <main className="auth-shell">
      <section className="auth-card congregation-entry-card" aria-label="Congregation Preferences sign in">
        <h1>Congregation Preferences</h1>
        <p className="field-help">Vote for your favorite songs to be considered.</p>
        <form className="congregation-entry-sign-in" action="/api/congregation-preferences" method="post">
          <input type="hidden" name="action" value="signIn" />
          <label>Nickname<input name="nickname" defaultValue={nickname} required autoFocus autoComplete="username" /></label>
          <button className="congregation-entry-button" type="submit">Sign in</button>
        </form>
        <Notice code={notice} nickname={nickname} />
        <div className="congregation-entry-divider" aria-hidden="true" />
        <div className="congregation-entry-options">
          <EntryOption href="/congregation-preferences?entry=1&view=register" label="Register" help="if you haven't registered yet" />
          <EntryOption href="/congregation-preferences?entry=1&view=recover" label="Recover nickname" help="if you forgot your nickname" />
          <EntryOption href="/sign-in" label="Staff sign in" help="if you are a priest, organist or admin" />
        </div>
      </section>
    </main>
  );
}

function registrationPanel(nickname: string, notice: string | undefined, claim: boolean) {
  return (
    <main className="auth-shell">
      <section className="auth-card congregation-entry-card">
        <h1>{claim ? "Verify email" : "Register"}</h1>
        {claim && <p className="field-help">Confirm an email for the signed-in legacy nickname without changing its preferences.</p>}
        <form className="congregation-entry-form" action="/api/congregation-preferences" method="post">
          <input type="hidden" name="action" value="register" />
          <label>Nickname<input name="nickname" defaultValue={nickname} readOnly={claim} required autoFocus={!claim} autoComplete="username" /></label>
          <label>Email<input name="email" type="email" required autoFocus={claim} autoComplete="email" /></label>
          <div className="congregation-form-actions">
            <a className="congregation-entry-button" href="/congregation-preferences?entry=1">Cancel</a>
            <button className="congregation-entry-button" type="submit">Register</button>
          </div>
        </form>
        <Notice code={notice} nickname={nickname} />
      </section>
    </main>
  );
}

function recoveryPanel(notice: string | undefined) {
  return (
    <main className="auth-shell">
      <section className="auth-card congregation-entry-card">
        <h1>Recover nickname</h1>
        <form className="congregation-entry-form" action="/api/congregation-preferences" method="post">
          <input type="hidden" name="action" value="recoverNickname" />
          <label>Email<input name="email" type="email" required autoFocus autoComplete="email" /></label>
          <div className="congregation-form-actions">
            <a className="congregation-entry-button" href="/congregation-preferences?entry=1">Cancel</a>
            <button className="congregation-entry-button" type="submit">Recover nickname</button>
          </div>
        </form>
        <Notice code={notice} nickname="" />
      </section>
    </main>
  );
}

function EntryOption({ href, label, help }: { href: string; label: string; help: string }) {
  return <div className="congregation-entry-option"><a className="congregation-entry-button" href={href}>{label}</a><span>{help}</span></div>;
}

function Notice({ code, nickname }: { code: string | undefined; nickname: string }) {
  if (!code) return null;
  const copy: Record<string, string> = {
    pending: "This registration has not been confirmed yet. Check your email.",
    registrationCreated: "Registration request created. Check your email and confirm your registration.",
    awaitingConfirmation: "This registration is already awaiting email confirmation.",
    alreadyRegistered: "You are already registered. Sign in using the nickname you just entered.",
    reservedNickname: "This nickname is already reserved. Choose another nickname.",
    registeredEmail: "This email address is already registered. Use Recover nickname to recover your existing nickname.",
    invalidEmail: "Enter a valid email address.",
    invalidNickname: "Enter a valid nickname.",
    recoverySent: "Your nickname has been sent to the registered email address.",
    recoveryMissing: "This email address was not found. Try again or register.",
    confirmationResent: "A new confirmation email has been sent.",
    confirmationMissing: "No pending registration was found for this nickname.",
    confirmationExpired: "This confirmation link has expired.",
    confirmationInvalid: "This confirmation link is invalid.",
    alreadyConfirmed: "This registration has already been confirmed. Sign in with your nickname.",
    missingNickname: "This nickname is not registered.",
    sessionExpired: "Your voter session is missing or expired. Sign in again.",
    rateLimited: "Too many requests. Try again later.",
    registrationFrozen: "Registration is temporarily unavailable.",
    quotaReached: "The registration limit has been reached. Try again later.",
    mailUnavailable: "Email could not be sent. Try again later.",
    requestFailed: "The request could not be completed. Try again later.",
  };
  const message = copy[code];
  if (!message) return null;
  const canResend = Boolean(nickname) && ["pending", "awaitingConfirmation", "confirmationExpired"].includes(code);
  const positive = code.includes("Sent") || code === "registrationCreated";
  return (
    <div className="congregation-entry-notice">
      {positive
        ? <p role="status" className="saved-summary">{message}</p>
        : <p role="alert" className="auth-error">{message}</p>}
      {canResend && (
        <form action="/api/congregation-preferences" method="post">
          <input type="hidden" name="action" value="resendConfirmation" />
          <input type="hidden" name="nickname" value={nickname} />
          <button type="submit">Resend confirmation</button>
        </form>
      )}
      {code === "missingNickname" && <a href={`/congregation-preferences?entry=1&view=register&nickname=${encodeURIComponent(nickname)}`}>Register this nickname</a>}
      {code === "recoveryMissing" && <a href="/congregation-preferences?entry=1&view=register">Register</a>}
    </div>
  );
}

function configurationMessage(message: string) {
  return <main className="auth-shell"><div className="auth-card"><h1>Congregation Preferences</h1><p>{message}</p><a href="/">Back</a></div></main>;
}

function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
