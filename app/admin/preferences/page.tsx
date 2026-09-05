import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../../../src/application/active-role";
import {
  PostgresCongregationPreferenceAdminService,
  type CongregationPreferenceAdminLanguage,
} from "../../../src/application/congregation-preference-admin";
import { congregationAdminVoterLabel } from "../../../src/application/congregation-voter-admin-label";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";
import { ConfirmSubmitButton } from "../accounts/confirm-submit-button";
import { PreferenceLanguageFilter } from "./preference-language-filter";
import { PreferenceSongMenuBehavior } from "./preference-song-menu-behavior";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CongregationPreferencesAdminPage({ searchParams }: PageProps) {
  if (process.env.ORGANY_RUNTIME !== "db") redirect("/");

  const requestHeaders = await headers();
  let currentUser;
  try {
    currentUser = await resolveProtectedUser(requestHeaders, authPool);
  } catch (error) {
    if (error instanceof ProtectedActorError) redirect("/sign-in");
    throw error;
  }

  const activeRole = resolveOwnedActiveRole(
    currentUser.roles,
    (await cookies()).get(ACTIVE_ROLE_COOKIE_NAME)?.value,
  );
  if (!currentUser.roles.includes("admin") || activeRole !== "admin") redirect("/");

  const params = await searchParams;
  const language = normalizeLanguage(first(params.language));
  const service = new PostgresCongregationPreferenceAdminService(authPool);
  const [voters, registration] = await Promise.all([
    service.list(requestHeaders, language),
    service.registrationOverview(requestHeaders),
  ]);
  const message = first(params.message);
  const error = first(params.error);

  return (
    <main className="shell">
      <section className="card planning-form preference-admin-card" aria-label="Congregation preference administration">
        <div className="app-header">
          <div><h1>Manage Preferences</h1></div>
          <a href="/">Back to planning</a>
        </div>

        <p className="field-help">Current positive preferences and Admin-set zero preferences are listed. Ordinary voter-set zero preferences stay hidden.</p>

        <section className="registration-admin-panel" aria-label="Congregation registration status">
          <div>
            <strong>Registration</strong>
            <span>Bootstrap {registration.bootstrapUsed}/{registration.bootstrapLimit}</span>
            <span>Current ISO week {registration.weeklyUsed}/{registration.weeklyLimit}</span>
            <span>Pending {registration.pendingCount} · Active {registration.activeCount} · Legacy unverified {registration.legacyUnverifiedCount}</span>
            <span>Suspicious rate-limit buckets (24 h) {registration.suspiciousBuckets24h}</span>
          </div>
          <form action="/api/admin/congregation-preferences" method="post">
            <input type="hidden" name="action" value="setRegistrationFrozen" />
            <input type="hidden" name="frozen" value={registration.frozen ? "false" : "true"} />
            <input type="hidden" name="language" value={language} />
            <button type="submit">{registration.frozen ? "Resume registration" : "Emergency freeze"}</button>
          </form>
          <details>
            <summary>Recent registration states</summary>
            <div className="registration-admin-recent">
              {registration.recent.map((item) => (
                <span key={item.accountId}>{item.createdAt.toISOString()} · {congregationAdminVoterLabel(item.accountId, item.nickname)} · {item.status}</span>
              ))}
            </div>
          </details>
          <form className="registration-admin-note" action="/api/admin/congregation-preferences" method="post">
            <input type="hidden" name="action" value="recordSuspiciousRegistrationActivity" />
            <input type="hidden" name="language" value={language} />
            <label>Record suspicious activity<input name="note" maxLength={500} required placeholder="Brief observation; do not enter email addresses" /></label>
            <button type="submit">Record</button>
          </form>
        </section>

        <div className="planning-context-header preference-admin-context-header">
          <div className="planning-context-info preference-admin-feedback" aria-label="Preference administration status">
            {message && <p className="saved-summary" role="status">{message}</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
          </div>
          <div className="planning-melody-protection-slot preference-language-slot" aria-label="Language reserved area">
            <PreferenceLanguageFilter language={language} />
          </div>
        </div>

        <section className="preference-admin-list" aria-label="Congregation nickname preferences">
          {voters.length === 0 && (
            <p className="field-help">No visible {language} congregation preferences.</p>
          )}

          {voters.map((voter) => (
            <article className="preference-admin-row" key={voter.profileId}>
              <strong className="preference-admin-nickname">{congregationAdminVoterLabel(voter.userId, voter.nickname)}</strong>

              {voter.songs.length > 0 ? (
                <details className="preference-song-menu" id={`preference-song-menu-${voter.profileId}`}>
                  <PreferenceSongMenuBehavior menuId={`preference-song-menu-${voter.profileId}`} />
                  <summary>
                    <span>Songs</span>
                    <span className="preference-song-count">{voter.songs.length}</span>
                  </summary>
                  <div className="preference-song-popover">
                    {voter.songs.map((song) => (
                      <div className="preference-song-item" key={song.referenceSongId}>
                        <span className="preference-song-label">
                          <strong>{song.displayNumber}</strong> · {song.title}
                          {language === "mixed" && <span className="field-help"> ({song.language})</span>}
                          {song.adminZero && <span className="preference-song-state">Admin 0</span>}
                        </span>
                        <div className="preference-song-actions">
                          <form action="/api/admin/congregation-preferences" method="post">
                            <input type="hidden" name="action" value="setScore" />
                            <input type="hidden" name="profileId" value={voter.profileId} />
                            <input type="hidden" name="referenceSongId" value={song.referenceSongId} />
                            <input type="hidden" name="score" value={song.adminZero ? "1" : "0"} />
                            <input type="hidden" name="language" value={language} />
                            <button type="submit">{song.adminZero ? "Undo to 1" : "Set 0"}</button>
                          </form>
                          <form action="/api/admin/congregation-preferences" method="post">
                            <input type="hidden" name="action" value="removePreference" />
                            <input type="hidden" name="profileId" value={voter.profileId} />
                            <input type="hidden" name="referenceSongId" value={song.referenceSongId} />
                            <input type="hidden" name="language" value={language} />
                            <button type="submit">Remove</button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <span className="preference-song-empty">Songs <span className="preference-song-count">0</span></span>
              )}

              <form action="/api/admin/congregation-preferences" method="post" className="preference-delete-nickname">
                <input type="hidden" name="action" value="deleteNickname" />
                <input type="hidden" name="userId" value={voter.userId} />
                <input type="hidden" name="language" value={language} />
                <ConfirmSubmitButton message={`Delete nickname ${congregationAdminVoterLabel(voter.userId, voter.nickname)} and all of its congregation preferences?`}>
                  Delete nickname
                </ConfirmSubmitButton>
              </form>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

function normalizeLanguage(value: string | undefined): CongregationPreferenceAdminLanguage {
  return value === "polish" ? "polish" : value === "mixed" ? "mixed" : "czech";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
