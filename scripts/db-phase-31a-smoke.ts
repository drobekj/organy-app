import { Pool } from "pg";
import { assertRuntimeCounts } from "../src/application/real-catalog";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for Phase 31A DB smoke.");
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
        (select count(*)::int from melody_equivalence_classes) as melody,
        (select count(*)::int from catalog_songs where song_id like 'phase29-demo-%' or song_id like 'demo-%' or number like 'PH29-DEMO-%') as demo_songs,
        (select count(*)::int from catalog_songs where sheet_music_url is not null) as url_violations`);
    const row = dirty.rows[0];
    if (row.people || row.users || row.lifecycle || row.melody || row.demo_songs || row.url_violations) throw new Error(`Phase 31A DB smoke found contamination: ${JSON.stringify(row)}`);
    const variants = await pool.query("select language, number from catalog_songs where (language = 'czech' and number = '52/1') or (language = 'polish' and number = '347/8') order by language");
    if (variants.rows.length !== 2) throw new Error("Phase 31A DB smoke did not find decoded variant display numbers 52/1 and 347/8.");
    console.log("Phase 31A DB smoke passed without writing acceptance data.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
