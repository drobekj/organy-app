import { Pool } from "pg";
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new Error("Refusing destructive reset outside local/test execution.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for local reset.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("begin");
    await pool.query("truncate completed_service_rows, completed_services, service_set_rows, service_sets, service_contexts, song_preferences, organist_repertoire, song_melody_equivalence, antiphon_mappings, liturgical_season_mappings, melody_equivalence_classes, preference_profiles, app_user_roles, app_users, catalog_persons, catalog_songs restart identity cascade");
    await pool.query("commit");
    console.log("Destructive local-only catalog acceptance reset complete.");
  } catch (e) { await pool.query("rollback"); throw e; } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
