import { cookies } from "next/headers";
import { getAppDbPool } from "../../src/db/app-pool";
import { CongregationVoterError, PostgresCongregationPreferenceService } from "../../src/application/congregation-preference-voter";
import { PostgresReferenceCatalogProvider } from "../../src/application/postgres-reference-catalog";

const CONTEXT_COOKIE = "organy_congregation_voter";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CongregationPreferencesPage({ searchParams }: PageProps) {
  if (process.env.ORGANY_RUNTIME !== "db") return configurationMessage("Congregation preferences are available in DB runtime.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return configurationMessage("DATABASE_URL is required for congregation preferences.");

  const cookieStore = await cookies();
  const token = cookieStore.get(CONTEXT_COOKIE)?.value;
  if (!token) return nicknameEntry();

  const params = await searchParams;
  const search = first(params.q) ?? "";
  const selectedId = first(params.song);
  const saved = first(params.saved) === "1";
  const pool = getAppDbPool(databaseUrl);
  const service = new PostgresCongregationPreferenceService(pool);
    let voter;
    try {
      voter = await service.resolveContext(token);
    } catch (error) {
      if (error instanceof CongregationVoterError && error.code === "unauthenticated") return nicknameEntry(error.message);
      throw error;
    }

    const catalog = new PostgresReferenceCatalogProvider(pool);
    const page = await catalog.list({ language: "all", search, page: 0, pageSize: 25 });
    const selected = selectedId ? await catalog.getById(selectedId) : undefined;
    const preference = selected ? await service.getOwnReferencePreference(token, selected.id) : undefined;

    return (
      <main className="shell">
        <section className="card planning-form" aria-label="Congregation preference voting">
          <div className="app-header">
            <div>
              <p className="eyebrow">Congregation preference</p>
              <h1>{voter.nickname}</h1>
            </div>
            <div className="form-actions">
              <form action="/api/congregation-preferences" method="post">
                <input type="hidden" name="action" value="clearNickname" />
                <button type="submit">Change nickname</button>
              </form>
              <a href="/sign-in">Staff sign in</a>
            </div>
          </div>

          <p className="field-help">This nickname is deliberately unverified. It can change only this nickname profile's congregation preferences.</p>

          <form method="get" className="form-actions">
            <label>
              Find song
              <input name="q" defaultValue={search} placeholder="Number or title" />
            </label>
            <button type="submit">Search</button>
          </form>

          <p className="field-help">Showing {page.records.length} of {page.total} matching songs.</p>
          <ul className="saved-set-list" aria-label="Reference songs">
            {page.records.map((record) => (
              <li key={record.id} className={selected?.id === record.id ? "selected-record" : undefined}>
                <a href={songHref(record.id, search)}>
                  <strong>{record.displayNumber}</strong> · {record.title} <span className="field-help">({record.language})</span>
                </a>
              </li>
            ))}
          </ul>

          {page.records.length === 0 && <p className="field-help">No songs found.</p>}

          {selected && preference && (
            <section className="detail-panel" aria-label="Selected congregation preference">
              <h2>{selected.displayNumber} · {selected.title}</h2>
              <p className="field-help">Current preference: <strong>{preference.score === null ? "not set" : preference.score}</strong>. Allowed values: 0 or 1.</p>
              <form action="/api/congregation-preferences" method="post" className="form-actions">
                <input type="hidden" name="action" value="saveOwnPreference" />
                <input type="hidden" name="referenceSongId" value={selected.id} />
                <button type="submit" name="score" value="0">Set 0</button>
                <button type="submit" name="score" value="1">Set 1</button>
                {saved && <span className="saved-summary" role="status">Saved.</span>}
              </form>
            </section>
          )}
        </section>
      </main>
    );
}

function nicknameEntry(message?: string) {
  return (
    <main className="auth-shell">
      <form className="auth-card" action="/api/congregation-preferences" method="post">
        <h1>Congregation preferences</h1>
        <p className="field-help">Enter a nickname. No password or email is required.</p>
        <input type="hidden" name="action" value="enterNickname" />
        <label>
          Nickname
          <input name="nickname" required autoFocus />
        </label>
        {message && <p role="alert" className="auth-error">{message}</p>}
        <button type="submit">Continue</button>
        <a href="/sign-in">Staff sign in</a>
      </form>
    </main>
  );
}

function configurationMessage(message: string) {
  return <main className="auth-shell"><div className="auth-card"><h1>Congregation preferences</h1><p>{message}</p><a href="/">Back</a></div></main>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function songHref(songId: string, search: string): string {
  const params = new URLSearchParams({ song: songId });
  if (search) params.set("q", search);
  return `/congregation-preferences?${params.toString()}`;
}
