import { cookies } from "next/headers";
import { getAppDbPool } from "../../src/db/app-pool";
import { CongregationVoterError, PostgresCongregationPreferenceService } from "../../src/application/congregation-preference-voter";
import { PostgresReferenceCatalogProvider } from "../../src/application/postgres-reference-catalog";
import { CongregationPreferenceWorkspace } from "./congregation-preference-workspace";

const CONTEXT_COOKIE = "organy_congregation_voter";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CongregationPreferencesPage({ searchParams }: PageProps) {
  if (process.env.ORGANY_RUNTIME !== "db") {
    return configurationMessage("Congregation preferences are available in DB runtime.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return configurationMessage("DATABASE_URL is required for congregation preferences.");
  }

  const params = await searchParams;
  if (first(params.entry) === "1") return nicknameEntry();

  const cookieStore = await cookies();
  const token = cookieStore.get(CONTEXT_COOKIE)?.value;
  if (!token) return nicknameEntry();

  const pool = getAppDbPool(databaseUrl);
  const service = new PostgresCongregationPreferenceService(pool);

  let voter;
  try {
    voter = await service.resolveContext(token);
  } catch (error) {
    if (error instanceof CongregationVoterError && error.code === "unauthenticated") {
      return nicknameEntry(error.message);
    }
    throw error;
  }

  const catalog = new PostgresReferenceCatalogProvider(pool);
  const [records, preferences] = await Promise.all([
    catalog.listAll("all"),
    service.listOwnReferencePreferences(token),
  ]);

  return (
    <main className="shell">
      <section className="card planning-form congregation-preferences-card" aria-label="Congregation preference voting">
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

        <p className="field-help">
          This nickname is deliberately unverified. It can change only this nickname profile&apos;s congregation preferences.
        </p>

        <CongregationPreferenceWorkspace records={records} preferences={preferences} />
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
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1>Congregation preferences</h1>
        <p>{message}</p>
        <a href="/">Back</a>
      </div>
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
