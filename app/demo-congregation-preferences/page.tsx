import type { CongregationOwnPreferenceEntry } from "../../src/application/congregation-preference-voter";
import type { ReferenceCatalogRecord } from "../../src/application/reference-catalog-contract";
import { DEMO_D2_SONGS } from "../../src/demo/d2-planning-fixture";
import { DemoCongregationPreferenceWorkspace } from "./demo-congregation-preference-workspace";

export const REFERENCE_DEMO_NICKNAME = "PresbyterDemo";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const DEMO_REFERENCE_PREFERENCES: CongregationOwnPreferenceEntry[] = [
  { referenceSongId: "demo-cz-101", score: 1 },
  { referenceSongId: "demo-cz-310", score: 1 },
  { referenceSongId: "demo-cz-530", score: 1 },
  { referenceSongId: "demo-pl-220", score: 1 },
];

const DEMO_REFERENCE_RECORDS: ReferenceCatalogRecord[] = DEMO_D2_SONGS.map((song) => ({
  id: song.songId,
  language: song.language,
  canonicalNumber: Number(song.number),
  displayNumber: song.number,
  title: song.title,
  sourceUrl: song.sheetMusicUrl,
}));

export default async function DemoCongregationPreferencesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nickname = normalizeDemoNickname(first(params.nickname));
  const signedIn = first(params.demo) === "1";

  if (first(params.entry) === "1" || !signedIn) return demoEntryPanel(nickname);

  return (
    <main className="shell">
      <section className="card planning-form congregation-preferences-card" aria-label="Reference congregation preference voting">
        <div className="app-header">
          <div>
            <p className="eyebrow">Congregation preference · Reference Demo</p>
            <h1>{nickname}</h1>
          </div>
          <div className="form-actions">
            <form action="/congregation-preferences" method="get">
              <input type="hidden" name="entry" value="1" />
              <input type="hidden" name="nickname" value={nickname} />
              <button type="submit">Change nickname</button>
            </form>
          </div>
        </div>

        <p className="field-help">
          Reference voting profile. Changes are presentation-only in this Demo view and are not stored.
        </p>

        <DemoCongregationPreferenceWorkspace
          records={DEMO_REFERENCE_RECORDS}
          preferences={DEMO_REFERENCE_PREFERENCES}
        />
      </section>
    </main>
  );
}

function demoEntryPanel(nickname: string) {
  return (
    <main className="auth-shell">
      <section className="auth-card congregation-entry-card" aria-label="Congregation Preferences reference Demo sign in">
        <h1>Congregation Preferences</h1>
        <p className="field-help">Vote for your favorite songs to be considered.</p>
        <form className="congregation-entry-sign-in" action="/congregation-preferences" method="get">
          <input type="hidden" name="demo" value="1" />
          <label>
            Nickname
            <input name="nickname" defaultValue={nickname} required autoFocus autoComplete="off" />
          </label>
          <button className="congregation-entry-button" type="submit">Sign in</button>
        </form>
        <p className="field-help">
          Reference Demo only: this sign-in does not use a real account, database or Production session.
        </p>
        <a href="/">Back to Demo</a>
      </section>
    </main>
  );
}

function normalizeDemoNickname(value: string | undefined): string {
  const normalized = value?.trim().normalize("NFC").slice(0, 64) ?? "";
  return normalized || REFERENCE_DEMO_NICKNAME;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
