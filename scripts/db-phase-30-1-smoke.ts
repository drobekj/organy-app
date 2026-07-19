import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { DrizzleCatalogRepository } from "../src/application/catalog";
import { seedCatalog } from "../src/application/catalog-seed";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";
import { DrizzleCompletedServiceRecordRepository, DrizzlePlanningSetRepository, PlanningLifecycleService } from "../src/application/planning-lifecycle";
import type { ServiceContext } from "../src/planning-lifecycle";
type PgModule = typeof import("pg");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { console.error("DATABASE_URL is required for Phase 30.1 DB smoke."); process.exit(1); }
async function main() {
  const { Pool } = await importPg();
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  try {
    await seedCatalog(new DrizzleCatalogRepository(db));
    await pool.query("insert into app_users (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name", ["phase30-db-user", "Phase 30 DB User"]);
    await pool.query("insert into app_user_roles (user_id, role) values ($1, 'priest') on conflict do nothing", ["phase30-db-user"]);
    await pool.query("insert into preference_profiles (id, user_id, category) values ($1, $2, 'priest') on conflict (user_id) do update set category = excluded.category", ["phase30-db-profile", "phase30-db-user"]);
    await pool.query("insert into melody_non_repetition_config (id, months) values ('global', 2) on conflict (id) do update set months = excluded.months");
    await seedDemoInteractionKnowledge(pool);

    const lifecycle = new PlanningLifecycleService({
      planningSets: new DrizzlePlanningSetRepository({ db }),
      completedServiceRecords: new DrizzleCompletedServiceRecordRepository({ db }),
      catalog: new DrizzleCatalogRepository(db),
      enforceCatalogSelections: true,
      now: () => new Date("2026-07-19T09:00:00.000Z"),
    });
    const serviceContext: ServiceContext = { serviceDate: "2026-07-18", serviceTime: "08:11", language: "czech", priest: { id: "demo-priest", displayName: "Demo Priest" }, organist: { id: "demo-organist", displayName: "Demo Organist" }, antiphonKey: "phase30-antiphon", liturgicalSeasonKey: "phase30-season" };
    const working = await lifecycle.saveWorkingSet({ role: "admin", serviceContext, set: { status: "working", language: "czech", rows: [{ song: { songId: "demo-cz-101", language: "czech", number: "101", title: "Demo Czech Song" }, note: "DB smoke row" }] } });
    if (!working.success) throw new Error(`Working save failed: ${working.error.message}`);
    const loadedWorking = await lifecycle.loadPlanningSet(working.value.id);
    if (!loadedWorking.success || loadedWorking.value.serviceContext.antiphonKey !== "phase30-antiphon" || loadedWorking.value.serviceContext.liturgicalSeasonKey !== "phase30-season" || loadedWorking.value.rows[0]?.song?.songId !== "demo-cz-101") throw new Error("Working lifecycle context/song round-trip failed.");
    const finalized = await lifecycle.finalizeWorkingSet({ role: "admin", workingSetId: working.value.id });
    if (!finalized.success || finalized.value.serviceContext.antiphonKey !== "phase30-antiphon") throw new Error("Final lifecycle context round-trip failed.");
    const completed = await lifecycle.completeFinalSet({ role: "admin", finalSetId: finalized.value.id });
    if (!completed.success || completed.value.serviceContext.liturgicalSeasonKey !== "phase30-season" || completed.value.set.rows[0]?.song?.songId !== "demo-cz-101") throw new Error("Completed lifecycle context/song round-trip failed.");
    const loadedCompleted = await lifecycle.loadCompletedRecord(completed.value.id);
    if (!loadedCompleted.success || loadedCompleted.value.serviceContext.antiphonKey !== "phase30-antiphon") throw new Error("Completed reload context round-trip failed.");
    const updated = await lifecycle.updateCompletedRecord({ role: "admin", recordId: completed.value.id, serviceContext: { ...loadedCompleted.value.serviceContext, liturgicalSeasonKey: "phase30-updated-season" }, set: loadedCompleted.value.set });
    if (!updated.success) throw new Error(`Completed update failed: ${updated.error.message}`);
    const reloadedCompleted = await lifecycle.loadCompletedRecord(completed.value.id);
    if (!reloadedCompleted.success || reloadedCompleted.value.serviceContext.antiphonKey !== "phase30-antiphon" || reloadedCompleted.value.serviceContext.liturgicalSeasonKey !== "phase30-updated-season" || reloadedCompleted.value.set.rows[0]?.song?.songId !== "demo-cz-101") throw new Error("Completed update reload context/song round-trip failed.");

    const contextColumns = await pool.query("select column_name from information_schema.columns where table_name = 'service_contexts' and column_name in ('antiphon_key', 'liturgical_season_key')");
    const rowColumns = await pool.query("select table_name, column_name from information_schema.columns where table_name in ('service_set_rows', 'completed_service_rows') and column_name in ('antiphon_key', 'liturgical_season_key')");
    if (contextColumns.rows.length !== 2 || rowColumns.rows.length !== 0) throw new Error("Hydration keys must exist only on service_contexts.");
    const { rows } = await pool.query("select u.id, r.role, p.category, c.months from app_users u join app_user_roles r on r.user_id = u.id join preference_profiles p on p.user_id = u.id cross join melody_non_repetition_config c where u.id = $1", ["phase30-db-user"]);
    if (rows.length !== 1 || rows[0].months !== 2) throw new Error("Phase 30.1 persisted entities did not round-trip.");
    const knowledge = await pool.query("select count(*) as count from melody_equivalence_classes c join song_melody_equivalence s on s.class_id = c.id join antiphon_mappings a on a.song_id = s.song_id where c.id = $1", ["synthetic-melody-a"]);
    if (Number(knowledge.rows[0].count) < 1) throw new Error("Phase 30.1 candidate knowledge did not round-trip.");
    console.log("Phase 30.1 DB smoke passed.");
  } finally { await pool.end(); }
}
async function importPg(): Promise<PgModule> { return import("pg"); }
main().catch((error) => { console.error("Phase 30.1 DB smoke failed."); console.error(error); process.exit(1); });
