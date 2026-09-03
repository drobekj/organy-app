import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../../../src/application/active-role";
import {
  PostgresCongregationPreferenceAdminService,
  type CongregationPreferenceAdminLanguage,
} from "../../../src/application/congregation-preference-admin";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";
import { ConfirmSubmitButton } from "../accounts/confirm-submit-button";
import { PreferenceLanguageFilter } from "./preference-language-filter";

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
  const voters = await new PostgresCongregationPreferenceAdminService(authPool).list(requestHeaders, language);
  const message = first(params.message);
  const error = first(params.error);

  return (
    <main className="shell">
      <section className="card planning-form preference-admin-card" aria-label="Congregation preference administration">
        <div className="app-header">
          <div>
            <h1>Manage Preferences</h1>
            <p className="field-help">Current positive preferences and Admin-set zero preferences are listed. Ordinary voter-set zero preferences stay hidden.</p>
          </div>
          <a href="/">Back to planning</a>
        </div>

        <div className="preference-admin-toolbar">
          <PreferenceLanguageFilter language={language} />
        </div>

        {message && (
          <div className="preference-admin-feedback">
            <p className="saved-summary" role="status">{message}</p>
          </div>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}

        <section className="preference-admin-list" aria-label="Congregation nickname preferences">
          {voters.length === 0 && (
            <p className="field-help">No visible {language} congregation preferences.</p>
          )}

          {voters.map((voter) => (
            <article className="preference-admin-row" key={voter.profileId}>
              <strong className="preference-admin-nickname">{voter.nickname}</strong>

              {voter.songs.length > 0 ? (
                <details className="preference-song-menu">
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
                <ConfirmSubmitButton message={`Delete nickname ${voter.nickname} and all of its congregation preferences?`}>
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
