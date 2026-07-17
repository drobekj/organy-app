import { and, eq, like } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { CatalogService, DrizzleCatalogRepository } from "../src/application/catalog";
import { createDbBackedPlanningLifecycleService } from "../src/application/planning-lifecycle";
import * as schema from "../src/db/schema";
import type { ServiceContext } from "../src/planning-lifecycle";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(1); }
const marker = `Phase29 DB Catalog Smoke ${Date.now()}-${process.pid}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
const catalogRepo = new DrizzleCatalogRepository(db);
const catalog = new CatalogService(catalogRepo);
const service = createDbBackedPlanningLifecycleService({ db: db as never, schema, now: () => new Date("2026-01-01T00:00:00Z") });

async function main() {
  try {
    await cleanup();
    const priest = await catalog.savePerson({ role: "admin", person: { id: `${marker} priest`, displayName: `${marker} Priest`, active: true, priest: true, organist: false } });
    const organist = await catalog.savePerson({ role: "admin", person: { id: `${marker} organist`, displayName: `${marker} Organist`, active: true, priest: false, organist: true } });
    await catalogRepo.upsertSong({ songId: `${marker} cz`, language: "czech", number: marker, title: `${marker} Czech Song`, active: true, sheetMusicUrl: "https://example.com/smoke.pdf" });
    const priestLookup = await catalog.searchPeople({ role: "priest", query: marker });
    const songLookup = await catalog.searchSongs({ language: "czech", query: marker });
    assert(priest.success && priestLookup.success && priestLookup.value.length === 1, "person lookup works");
    assert(songLookup.success && songLookup.value.length === 1 && songLookup.value[0].sheetMusicUrl, "song lookup works");
    if (!priest.success || !organist.success) throw new Error("fixture save failed");
    const identity = await findUnusedServiceIdentity();
    const ctx: ServiceContext = { serviceDate: identity.serviceDate, serviceTime: identity.serviceTime, language: "czech", priest: { id: priest.value.id, displayName: priest.value.displayName }, organist: { id: organist.value.id, displayName: organist.value.displayName } };
    const saved = await service.saveWorkingSet({ role: "admin", serviceContext: ctx, set: { status: "working", language: "czech", rows: [{ song: { songId: `${marker} cz`, language: "czech", number: marker, title: `${marker} Czech Song` } }, { note: `${marker} note` }] } });
    assert(saved.success, "working save works");
    if (!saved.success) throw new Error("save failed");
    const loaded = await service.loadPlanningSet(saved.value.id); assert(loaded.success && loaded.value.rows[0].song?.songId === `${marker} cz`, "working load keeps song id");
    const final = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id }); assert(final.success, "finalize works");
    const completed = await service.completeFinalSet({ role: "admin", finalSetId: final.success ? final.value.id : "missing" }); assert(completed.success, "complete works");
    const completedLoaded = await service.loadCompletedRecord(completed.success ? completed.value.id : "missing"); assert(completedLoaded.success && completedLoaded.value.set.rows[1].note === `${marker} note`, "completed load keeps note");
    await catalog.savePerson({ role: "admin", person: { ...priest.value, active: false, priest: false } });
    await catalog.setSongActive({ role: "admin", songId: `${marker} cz`, active: false });
    const unchanged = await service.updateCompletedRecord({ role: "admin", recordId: completed.success ? completed.value.id : "missing", serviceContext: completedLoaded.success ? completedLoaded.value.serviceContext : ctx, set: completedLoaded.success ? completedLoaded.value.set : { status: "final", language: "czech", rows: [] } });
    assert(unchanged.success, "unchanged deactivated snapshots can be saved");
    console.log("DB catalog lifecycle smoke passed.");
  } finally { try { await cleanup(); } finally { await pool.end(); } }
}
async function findUnusedServiceIdentity(): Promise<{ serviceDate: string; serviceTime: string }> {
  const start = new Date(Date.UTC(1899, 0, 1, 0, 0, 0));
  for (let offsetMinutes = 0; offsetMinutes < 525_600; offsetMinutes += 1) {
    const candidate = new Date(start.getTime() + offsetMinutes * 60_000);
    const serviceDate = candidate.toISOString().slice(0, 10);
    const serviceTime = candidate.toISOString().slice(11, 16);
    const existing = await db.select({ id: schema.serviceContexts.id }).from(schema.serviceContexts).where(and(eq(schema.serviceContexts.serviceDate, serviceDate), eq(schema.serviceContexts.serviceTime, serviceTime))).limit(1);
    if (existing.length === 0) return { serviceDate, serviceTime };
  }
  throw new Error("No free historical service identity found for smoke test.");
}

async function cleanup() { const contexts = await db.select({ id: schema.serviceContexts.id }).from(schema.serviceContexts).where(like(schema.serviceContexts.priestDisplayName, `${marker}%`)); for (const c of contexts) await db.delete(schema.serviceContexts).where(eq(schema.serviceContexts.id, c.id)); await db.delete(schema.catalogSongs).where(like(schema.catalogSongs.songId, `${marker}%`)); await db.delete(schema.catalogPersons).where(like(schema.catalogPersons.id, `${marker}%`)); }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
main().catch((e) => { console.error(e); process.exit(1); });
