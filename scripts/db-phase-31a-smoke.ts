import { Pool } from "pg";
import { assertRuntimeCounts, getRealCatalogFingerprint } from "../src/application/real-catalog";
import { decodeCatalogNumberForDisplay } from "../src/application/catalog-number";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for Phase 31A DB verification.");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await assertRuntimeCounts(pool);
    const dirty = await pool.query(`
      select
        (select count(*)::int from catalog_persons) as people,
        (select count(*)::int from app_users) as users,
        (select count(*)::int from service_contexts) as lifecycle,
        (select count(*)::int from completed_services) as completed,
        (select count(*)::int from melody_equivalence_classes) as melody,
        (select count(*)::int from catalog_songs where song_id like 'phase29-demo-%' or song_id like 'demo-%' or number like 'PH29-DEMO-%' or song_id like 'synthetic-scale-%' or title ilike 'Synthetic Scale Song%') as demo_songs,
        (select count(*)::int from catalog_songs where trim(title) = '') as empty_titles,
        (select count(*)::int from (select language, number from catalog_songs group by language, number having count(*) > 1) d) as duplicate_keys,
        (select count(*)::int from catalog_songs where sheet_music_url is not null) as url_violations`);
    const row = dirty.rows[0];
    if (row.people || row.users || row.lifecycle || row.completed || row.melody || row.demo_songs || row.empty_titles || row.duplicate_keys || row.url_violations) throw new Error(`Phase 31A DB verification found contamination: ${JSON.stringify(row)}`);
    const samples = await pool.query("select language, number, title, source_url from catalog_songs where (language = 'czech' and number in ('298', '5210')) or (language = 'polish' and number in ('955', '3478')) order by language, number::int");
    const byKey = new Map(samples.rows.map((sample) => [`${sample.language}:${sample.number}`, sample]));
    assertSample(byKey.get("czech:298"), "Otevři své srdce", "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce");
    assertSample(byKey.get("polish:955"), "Żegnamy was w Bogu naszym", "https://hymnary.org/hymn/SE2002/955");
    if (decodeCatalogNumberForDisplay("5210") !== "52/1" || decodeCatalogNumberForDisplay("3478") !== "347/8") throw new Error("Variant number display decoding failed.");
    const fingerprint = await getRealCatalogFingerprint(pool);
    console.log(`Phase 31A DB verification passed: Czech ${fingerprint.czech}, Polish ${fingerprint.polish}, Total ${fingerprint.total}, keyHash ${fingerprint.keyHash}, contentHash ${fingerprint.contentHash}.`);
  } finally {
    await pool.end();
  }
}

function assertSample(row: Record<string, unknown> | undefined, title: string, sourceUrl: string) {
  if (!row || row.title !== title || row.source_url !== sourceUrl) throw new Error(`Required sample missing or changed: ${title}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
