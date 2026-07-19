import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { DrizzleCatalogRepository } from "../src/application/catalog";
import { seedCatalog } from "../src/application/catalog-seed";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
type PgModule = typeof import("pg");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { console.error("DATABASE_URL is required for Phase 30.1 DB smoke."); process.exit(1); }
async function main() {
  const { Pool } = await importPg();
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await seedCatalog(new DrizzleCatalogRepository(drizzle(pool, { schema })));
    await pool.query("insert into app_users (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name", ["phase30-db-user", "Phase 30 DB User"]);
    await pool.query("insert into app_user_roles (user_id, role) values ($1, 'priest') on conflict do nothing", ["phase30-db-user"]);
    await pool.query("insert into preference_profiles (id, user_id, category) values ($1, $2, 'priest') on conflict (user_id) do update set category = excluded.category", ["phase30-db-profile", "phase30-db-user"]);
    await pool.query("insert into melody_non_repetition_config (id, months) values ('global', 2) on conflict (id) do update set months = excluded.months");
    await seedDemoInteractionKnowledge(pool);
    const { rows } = await pool.query("select u.id, r.role, p.category, c.months from app_users u join app_user_roles r on r.user_id = u.id join preference_profiles p on p.user_id = u.id cross join melody_non_repetition_config c where u.id = $1", ["phase30-db-user"]);
    if (rows.length !== 1 || rows[0].months !== 2) throw new Error("Phase 30.1 persisted entities did not round-trip.");
    const knowledge = await pool.query("select count(*) as count from melody_equivalence_classes c join song_melody_equivalence s on s.class_id = c.id join antiphon_mappings a on a.song_id = s.song_id where c.id = $1", ["synthetic-melody-a"]);
    if (Number(knowledge.rows[0].count) < 1) throw new Error("Phase 30.1 candidate knowledge did not round-trip.");
    console.log("Phase 30.1 DB smoke passed.");
  } finally { await pool.end(); }
}
async function importPg(): Promise<PgModule> { return import("pg"); }
main().catch((error) => { console.error("Phase 30.1 DB smoke failed."); console.error(error); process.exit(1); });
