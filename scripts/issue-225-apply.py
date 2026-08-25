from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_count(path: str, old: str, new: str, expected: int) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new))


# Shared application/auth pool. Vercel's attachDatabasePool manages idle pg clients
# when Fluid Compute suspends an instance; the global map preserves warm reuse and
# prevents HMR from multiplying pools locally.
write("src/db/app-pool.ts", '''import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

type AppDbGlobal = typeof globalThis & { __organyAppDbPools?: Map<string, Pool> };
const appDbGlobal = globalThis as AppDbGlobal;
const appDbPools = appDbGlobal.__organyAppDbPools ?? new Map<string, Pool>();
appDbGlobal.__organyAppDbPools = appDbPools;

export function getAppDbPool(databaseUrl: string | undefined = process.env.DATABASE_URL): Pool {
  const key = databaseUrl?.trim();
  if (!key) throw new Error("DATABASE_URL is required for DB runtime.");
  const existing = appDbPools.get(key);
  if (existing) return existing;

  const pool = new Pool({
    connectionString: key,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  attachDatabasePool(pool);
  appDbPools.set(key, pool);
  return pool;
}
''')

# Auth uses the same managed pool as the rest of the function bundle.
replace_once(
    "src/auth/server.ts",
    'import { Pool } from "pg";\nimport * as schema from "../db/schema";\n',
    'import * as schema from "../db/schema";\nimport { getAppDbPool } from "../db/app-pool";\n',
)
replace_once(
    "src/auth/server.ts",
    'type AuthGlobal = typeof globalThis & { __organyAuthPool?: Pool };\nconst authGlobal = globalThis as AuthGlobal;\n\n// Build/test module construction may use this inert local fallback. Protected runtime access\n// always passes through assertProtectedAuthConfigured() before Better Auth session work.\nconst databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/organy_app";\nexport const authPool = authGlobal.__organyAuthPool ?? new Pool({ connectionString: databaseUrl });\nif (process.env.NODE_ENV !== "production") authGlobal.__organyAuthPool = authPool;\n',
    '// Build/test module construction may use this inert local fallback. Protected runtime access\n// always passes through assertProtectedAuthConfigured() before Better Auth session work.\nconst databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/organy_app";\nexport const authPool = getAppDbPool(databaseUrl);\n',
)

# Catalog batch operations remove N-per-row HTTP/SQL lookups.
replace_once(
    "src/application/catalog.ts",
    '  findSongById(id: string): Promise<CatalogSong | undefined>;\n  searchSongs(languages: ConcreteSongLanguage[], query: string): Promise<CatalogSong[]>;\n',
    '  findSongById(id: string): Promise<CatalogSong | undefined>;\n  findSongsByIds(ids: string[]): Promise<CatalogSong[]>;\n  searchSongs(languages: ConcreteSongLanguage[], query: string): Promise<CatalogSong[]>;\n',
)
replace_once(
    "src/application/catalog.ts",
    '  async getSong(input: { songId: string }) { const song = await this.repo.findSongById(input.songId); return song ? success(song) : failure({ code: "notFound", message: "Song was not found." }); }\n  async searchPeople',
    '  async getSong(input: { songId: string }) { const song = await this.repo.findSongById(input.songId); return song ? success(song) : failure({ code: "notFound", message: "Song was not found." }); }\n  async getSongs(input: { songIds: string[] }) { return success(await this.repo.findSongsByIds(input.songIds)); }\n  async searchPeople',
)
replace_once(
    "src/application/catalog.ts",
    '  async findSongById(id: string) { return this.songs.find((s) => s.songId === id); }\n  async searchSongs',
    '  async findSongById(id: string) { return this.songs.find((s) => s.songId === id); }\n  async findSongsByIds(ids: string[]) { const wanted = new Set(ids); return this.songs.filter((song) => wanted.has(song.songId)); }\n  async searchSongs',
)
replace_once(
    "src/application/catalog.ts",
    '  async findSongById(id: string) { const [r] = await this.db.select().from(catalogSongs).where(eq(catalogSongs.songId, id)).limit(1); return r && mapSong(r); }\n  async searchSongs',
    '  async findSongById(id: string) { const [r] = await this.db.select().from(catalogSongs).where(eq(catalogSongs.songId, id)).limit(1); return r && mapSong(r); }\n  async findSongsByIds(ids: string[]) { if (ids.length === 0) return []; return (await this.db.select().from(catalogSongs).where(inArray(catalogSongs.songId, ids))).map(mapSong); }\n  async searchSongs',
)

# Catalog route: managed warm pool + compact planning/admin/batch snapshots.
replace_once(
    "app/api/catalog/route.ts",
    'import { auditEventValues, humanAuditActor } from "../../../src/application/audit-history";\n',
    'import { auditEventValues, humanAuditActor } from "../../../src/application/audit-history";\nimport { getAppDbPool } from "../../../src/db/app-pool";\n',
)
replace_once(
    "app/api/catalog/route.ts",
    'type CatalogAction = "getPerson" | "getSong" | "searchPeople" | "listPeople" | "savePerson" | "searchSongs" | "listSongs" | "setSongActive";',
    'type CatalogAction = "getPerson" | "getSong" | "getSongs" | "getPlanningPeople" | "getAdminCatalogSnapshot" | "searchPeople" | "listPeople" | "savePerson" | "searchSongs" | "listSongs" | "setSongActive";',
)
replace_once(
    "app/api/catalog/route.ts",
    'if (!action || !["getPerson", "getSong", "searchPeople", "listPeople", "savePerson", "searchSongs", "listSongs", "setSongActive"].includes(action))',
    'if (!action || !["getPerson", "getSong", "getSongs", "getPlanningPeople", "getAdminCatalogSnapshot", "searchPeople", "listPeople", "savePerson", "searchSongs", "listSongs", "setSongActive"].includes(action))',
)
replace_once(
    "app/api/catalog/route.ts",
    '  const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);\n  const pool = new Pool({ connectionString: process.env.DATABASE_URL });\n',
    '  const { drizzle } = await import("drizzle-orm/node-postgres");\n  const pool = getAppDbPool();\n',
)
replace_once(
    "app/api/catalog/route.ts",
    '    const service = new CatalogService(new DrizzleCatalogRepository(db));\n    return NextResponse.json(await service[action](input as never));\n',
    '''    const service = new CatalogService(new DrizzleCatalogRepository(db));
    if (action === "getPlanningPeople") {
      const [priests, organists] = await Promise.all([
        service.searchPeople({ role: "priest", query: "" }),
        service.searchPeople({ role: "organist", query: "" }),
      ]);
      if (!priests.success) return NextResponse.json(priests);
      if (!organists.success) return NextResponse.json(organists);
      return NextResponse.json({ success: true, value: { priests: priests.value, organists: organists.value } });
    }
    if (action === "getAdminCatalogSnapshot") {
      if (actor.role !== "admin") return NextResponse.json({ success: false, error: { code: "permissionDenied", message: "Only admin can load the management catalog." } });
      const [people, songs] = await Promise.all([service.listPeople(), service.listSongs()]);
      if (!people.success) return NextResponse.json(people);
      if (!songs.success) return NextResponse.json(songs);
      return NextResponse.json({ success: true, value: { people: people.value, songs: songs.value } });
    }
    return NextResponse.json(await service[action](input as never));
''',
)
replace_once(
    "app/api/catalog/route.ts",
    '  } finally { await pool.end(); }\n}',
    '  }\n}',
)
replace_once(
    "app/api/catalog/route.ts",
    '  if (action === "listPeople" || action === "listSongs") return undefined;\n',
    '  if (action === "listPeople" || action === "listSongs" || action === "getPlanningPeople" || action === "getAdminCatalogSnapshot") return undefined;\n',
)
replace_once(
    "app/api/catalog/route.ts",
    '  if (action === "getSong") return typeof input.songId === "string" && input.songId.trim() ? undefined : "Non-empty song ID is required.";\n',
    '  if (action === "getSong") return typeof input.songId === "string" && input.songId.trim() ? undefined : "Non-empty song ID is required.";\n  if (action === "getSongs") return Array.isArray(input.songIds) && input.songIds.length <= 100 && input.songIds.every((id) => typeof id === "string" && id.trim()) ? undefined : "songIds must be an array of at most 100 non-empty IDs.";\n',
)

# Interaction route keeps its acceptance seam but production lease no longer owns/closes a per-request pool.
replace_once(
    "app/api/interaction/route.ts",
    'import { Pool, type PoolClient } from "pg";\n',
    'import type { Pool, PoolClient } from "pg";\nimport { getAppDbPool } from "../../../src/db/app-pool";\n',
)
replace_once(
    "app/api/interaction/route.ts",
    '''const productionPoolLease: InteractionPoolLeaseFactory = (databaseUrl) => {
  const pool = new Pool({ connectionString: databaseUrl });
  return { pool, release: () => pool.end() };
};
''',
    '''const productionPoolLease: InteractionPoolLeaseFactory = (databaseUrl) => ({
  pool: getAppDbPool(databaseUrl),
  release: async () => undefined,
});
''',
)
replace_once(
    "app/api/interaction/route.ts",
    '/** Narrow acceptance seam. Production continues to own and close one Pool per request. */',
    '/** Narrow acceptance seam. Production uses the warm process-level managed pool. */',
)

# Planning route: warm pool + one reconciliation/snapshot request replacing four client requests.
replace_once(
    "app/api/planning-lifecycle/route.ts",
    'import { auditEventValues, humanAuditActor, systemAuditActor } from "../../../src/application/audit-history";\n',
    'import { auditEventValues, humanAuditActor, systemAuditActor } from "../../../src/application/audit-history";\nimport { DrizzleCatalogRepository, getEligiblePersonDefaultById } from "../../../src/application/catalog";\nimport { getDraftPeopleDefaults } from "../../../src/planning-lifecycle/ui-session";\nimport { getAppDbPool } from "../../../src/db/app-pool";\n',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    'type PlanningLifecycleAction =\n  | "listPlanningSets"',
    'type PlanningLifecycleAction =\n  | "getWorkspaceSnapshot"\n  | "listPlanningSets"',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '  const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);\n  const pool = new Pool({ connectionString: process.env.DATABASE_URL });\n',
    '  const { drizzle } = await import("drizzle-orm/node-postgres");\n  const pool = getAppDbPool();\n',
)
snapshot_anchor = '    // List reads are the normal reconciliation boundary. Each actual automatic\n'
snapshot_block = '''    if (action === "getWorkspaceSnapshot") {
      const snapshot = await db.transaction(async (tx) => {
        const txDependencies: PlanningLifecycleDrizzleAdapterDependencies = { db: tx as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"], schema };
        const planningSets = new DrizzlePlanningSetRepository(txDependencies);
        const completedRepository = new DrizzleCompletedServiceRecordRepository(txDependencies);
        const finalSetCompletion = new DrizzleFinalSetCompletionRepository(txDependencies);
        const completedAt = new Date();
        const overdue = (await planningSets.list())
          .filter((set) => set.status === "final" && isPastPragueDate(set.serviceContext.serviceDate, completedAt))
          .sort((left, right) => left.serviceContext.serviceDate.localeCompare(right.serviceContext.serviceDate) || left.id.localeCompare(right.id));

        for (const finalSet of overdue) {
          const outcome = await finalSetCompletion.completeFinalSet(finalSet.id, completedAt);
          if (outcome.status !== "completed") continue;
          await tx.insert(schema.auditEvents).values(auditEventValues({
            actor: systemAuditActor(),
            action: "planning.final.autoComplete",
            objectKind: "completedService",
            objectRef: outcome.record.id,
            beforeState: { sourceFinalSetId: finalSet.id },
            afterState: outcome.record,
          }));
        }

        return {
          activeSets: await planningSets.list(),
          completedRecords: await completedRepository.list(),
        };
      });
      const melodyWindow = await new PostgresNonRepetitionPeriodService(pool).get(actor);
      const activeSets = await enrichRevisionRowIndexes({
        plans: snapshot.activeSets,
        completedRecords: snapshot.completedRecords,
        melodyClasses,
        months: melodyWindow.success ? melodyWindow.value.months : 2,
      });
      const rawDefaults = getDraftPeopleDefaults(snapshot.completedRecords);
      const catalog = new DrizzleCatalogRepository(db);
      const [priest, organist] = await Promise.all([
        getEligiblePersonDefaultById(catalog, rawDefaults.priest.id, "priest"),
        getEligiblePersonDefaultById(catalog, rawDefaults.organist.id, "organist"),
      ]);
      return NextResponse.json({
        success: true,
        value: {
          activeSets,
          completedRecords: snapshot.completedRecords,
          draftPeopleDefaults: {
            priest: priest ?? { displayName: "Anonymous" },
            organist: organist ?? { displayName: "Anonymous" },
          },
        },
      });
    }

'''
replace_once("app/api/planning-lifecycle/route.ts", snapshot_anchor, snapshot_block + snapshot_anchor)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '  } finally {\n    await pool.end();\n  }\n}',
    '  }\n}',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '  return ["listPlanningSets", "listCompletedRecords", "loadPlanningSet", "loadCompletedRecord", "previewCompletedRecordInvalidation", "saveWorkingSet", "finalizeWorkingSet", "reopenFinalSet", "completeFinalSet", "deletePlanningSet", "updateCompletedRecord", "deleteCompletedRecord"].includes(action);',
    '  return ["getWorkspaceSnapshot", "listPlanningSets", "listCompletedRecords", "loadPlanningSet", "loadCompletedRecord", "previewCompletedRecordInvalidation", "saveWorkingSet", "finalizeWorkingSet", "reopenFinalSet", "completeFinalSet", "deletePlanningSet", "updateCompletedRecord", "deleteCompletedRecord"].includes(action);',
)

# Reference and congregation runtime entry points reuse the same managed pool.
replace_once(
    "app/api/reference-catalog/route.ts",
    'import type { ReferenceCatalogQuery } from "../../../src/application/reference-catalog-contract";\n',
    'import type { ReferenceCatalogQuery } from "../../../src/application/reference-catalog-contract";\nimport { getAppDbPool } from "../../../src/db/app-pool";\n',
)
replace_once(
    "app/api/reference-catalog/route.ts",
    '  const { Pool } = await import("pg");\n  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });\n',
    '  const pool = getAppDbPool();\n',
)
replace_once("app/api/reference-catalog/route.ts", '  } finally { await pool.end(); }\n}', '  }\n}')

replace_once(
    "app/api/reference-antiphons/route.ts",
    'import type { ReferenceAntiphonQuery } from "../../../src/application/reference-antiphon-contract";\n',
    'import type { ReferenceAntiphonQuery } from "../../../src/application/reference-antiphon-contract";\nimport { getAppDbPool } from "../../../src/db/app-pool";\n',
)
replace_once(
    "app/api/reference-antiphons/route.ts",
    'const {Pool}=await import("pg");const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});',
    'const pool=getAppDbPool();',
)
replace_once("app/api/reference-antiphons/route.ts", '}finally{await pool.end();}}', '}}')

replace_once(
    "app/api/reference-topics/route.ts",
    'import { PostgresReferenceThematicSectionProvider } from "../../../src/application/postgres-reference-thematic-section";\n',
    'import { PostgresReferenceThematicSectionProvider } from "../../../src/application/postgres-reference-thematic-section";\nimport { getAppDbPool } from "../../../src/db/app-pool";\n',
)
replace_once(
    "app/api/reference-topics/route.ts",
    '  const { Pool } = await import("pg");\n  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });\n',
    '  const pool = getAppDbPool();\n',
)
replace_once(
    "app/api/reference-topics/route.ts",
    '  } finally {\n    await pool.end();\n  }\n}',
    '  }\n}',
)

replace_once(
    "app/api/congregation-preferences/route.ts",
    'import { Pool } from "pg";\n',
    'import { getAppDbPool } from "../../../src/db/app-pool";\n',
)
replace_once(
    "app/api/congregation-preferences/route.ts",
    '  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });\n',
    '  const pool = getAppDbPool();\n',
)
replace_once(
    "app/api/congregation-preferences/route.ts",
    '  } finally {\n    await pool.end();\n  }\n}',
    '  }\n}',
)

replace_once(
    "app/congregation-preferences/page.tsx",
    'import { Pool } from "pg";\n',
    'import { getAppDbPool } from "../../src/db/app-pool";\n',
)
replace_once(
    "app/congregation-preferences/page.tsx",
    '  const pool = new Pool({ connectionString: databaseUrl, max: 4 });\n',
    '  const pool = getAppDbPool(databaseUrl);\n',
)
replace_once(
    "app/congregation-preferences/page.tsx",
    '  } finally {\n    await pool.end();\n  }\n}',
    '  }\n}',
)

# Client transport compaction and lazy loading.
replace_once(
    "app/planning-lifecycle-client.tsx",
    '  async listPlanningSets() {\n    return callPlanningLifecycleApi("listPlanningSets", {});\n  }\n',
    '  async getWorkspaceSnapshot() {\n    return callPlanningLifecycleApi("getWorkspaceSnapshot", {});\n  }\n\n  async listPlanningSets() {\n    return callPlanningLifecycleApi("listPlanningSets", {});\n  }\n',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '  async getSong(input: { songId: string }) { return callCatalogApi("getSong", input); }\n  async searchPeople',
    '  async getSong(input: { songId: string }) { return callCatalogApi("getSong", input); }\n  async getSongs(input: { songIds: string[] }) { return callCatalogApi("getSongs", input); }\n  async getPlanningPeople() { return callCatalogApi("getPlanningPeople", {}); }\n  async getAdminCatalogSnapshot() { return callCatalogApi("getAdminCatalogSnapshot", {}, { role: "admin", userId: "active" }); }\n  async searchPeople',
)
# getAdminCatalogSnapshot needs the real active actor, so do not use the method above directly; refreshCatalogAdmin calls callCatalogApi with current actor.
replace_once(
    "app/planning-lifecycle-client.tsx",
    '  async getAdminCatalogSnapshot() { return callCatalogApi("getAdminCatalogSnapshot", {}, { role: "admin", userId: "active" }); }\n',
    '',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''  useEffect(() => {
    void refreshCatalogAdmin();
    void catalogClient.searchPeople({ role: "priest", query: "" }).then((r) => { if (r.success) setPriestResults(r.value); });
    void catalogClient.searchPeople({ role: "organist", query: "" }).then((r) => { if (r.success) setOrganistResults(r.value); });
  }, [selectedRole, runtimeMode, catalogClient]);
''',
    '''  useEffect(() => {
    if (workspace !== "planning") return;
    if (runtimeMode === "db" && catalogClient instanceof DbCatalogClient) {
      void catalogClient.getPlanningPeople().then((result) => {
        if (!result.success) return;
        setPriestResults(result.value.priests);
        setOrganistResults(result.value.organists);
      });
      return;
    }
    void Promise.all([
      catalogClient.searchPeople({ role: "priest", query: "" }),
      catalogClient.searchPeople({ role: "organist", query: "" }),
    ]).then(([priests, organists]) => {
      if (priests.success) setPriestResults(priests.value);
      if (organists.success) setOrganistResults(organists.value);
    });
  }, [workspace, runtimeMode, catalogClient]);

  useEffect(() => {
    if (workspace === "catalog" && selectedRole === "admin") void refreshCatalogAdmin();
  }, [workspace, selectedRole, runtimeMode, catalogClient]);
''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''  async function refreshDbSets() {
    const result = await planningLifecycleService.listPlanningSets();
    const completedResult = await planningLifecycleService.listCompletedRecords();
    const activeSets = result.success ? result.value : savedDbSets;
    const completed = completedResult.success ? completedResult.value : completedRecords;
    const defaults = await getEligibleDraftPeopleDefaults(completed);

    if (result.success) setSavedDbSets(activeSets);
    if (completedResult.success) {
      setCompletedRecords(completed);
      setDraftPeopleDefaults(defaults);
    }

    return { activeSets, completedRecords: completed, draftPeopleDefaults: defaults };
  }
''',
    '''  async function refreshDbSets() {
    if (runtimeMode === "db" && planningLifecycleService instanceof DbPlanningLifecycleClient) {
      const snapshot = await planningLifecycleService.getWorkspaceSnapshot();
      if (snapshot.success) {
        setSavedDbSets(snapshot.value.activeSets);
        setCompletedRecords(snapshot.value.completedRecords);
        setDraftPeopleDefaults(snapshot.value.draftPeopleDefaults);
        return snapshot.value;
      }
      return { activeSets: savedDbSets, completedRecords, draftPeopleDefaults };
    }

    const [result, completedResult] = await Promise.all([
      planningLifecycleService.listPlanningSets(),
      planningLifecycleService.listCompletedRecords(),
    ]);
    const activeSets = result.success ? result.value : savedDbSets;
    const completed = completedResult.success ? completedResult.value : completedRecords;
    const defaults = await getEligibleDraftPeopleDefaults(completed);

    if (result.success) setSavedDbSets(activeSets);
    if (completedResult.success) {
      setCompletedRecords(completed);
      setDraftPeopleDefaults(defaults);
    }

    return { activeSets, completedRecords: completed, draftPeopleDefaults: defaults };
  }
''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''  async function refreshCatalogAdmin() {
    if (selectedRole !== "admin") return;
    const [people, songs] = await Promise.all([catalogClient.listPeople(), catalogClient.listSongs()]);
    if (people.success) setPeopleAdmin(people.value);
    if (songs.success) setSongsAdmin(songs.value);
  }
''',
    '''  async function refreshCatalogAdmin() {
    if (selectedRole !== "admin") return;
    if (runtimeMode === "db" && catalogClient instanceof DbCatalogClient) {
      const snapshot = await callCatalogApi("getAdminCatalogSnapshot", {}, activeActor);
      if (snapshot.success) {
        setPeopleAdmin(snapshot.value.people);
        setSongsAdmin(snapshot.value.songs);
      }
      return;
    }
    const [people, songs] = await Promise.all([catalogClient.listPeople(), catalogClient.listSongs()]);
    if (people.success) setPeopleAdmin(people.value);
    if (songs.success) setSongsAdmin(songs.value);
  }
''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '  async function hydrateEditableRows(rowsToHydrate: EditableRow[], context: { organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string }): Promise<EditableRow[]> {\n',
    '''  async function enrichEditableRowsWithCurrentSheetMusic(rowsToEnrich: EditableRow[]): Promise<EditableRow[]> {
    const songIds = [...new Set(rowsToEnrich.flatMap((row) => row.selectedSong?.songId ? [row.selectedSong.songId] : []))];
    if (songIds.length === 0) return rowsToEnrich;
    if (runtimeMode === "db" && catalogClient instanceof DbCatalogClient) {
      const result = await catalogClient.getSongs({ songIds });
      if (!result.success) return rowsToEnrich;
      const byId = new Map(result.value.map((song: CatalogSong) => [song.songId, song]));
      return rowsToEnrich.map((row) => {
        if (!row.selectedSong?.songId) return row;
        const current = byId.get(row.selectedSong.songId);
        return current?.sheetMusicUrl ? { ...row, selectedSong: { ...row.selectedSong, sheetMusicUrl: current.sheetMusicUrl } } : row;
      });
    }
    return enrichRowsWithCurrentSheetMusic(rowsToEnrich, { findSongById: async (songId) => { const result = await catalogClient.getSong({ songId }); return result.success ? result.value : undefined; } });
  }

  async function hydrateEditableRows(rowsToHydrate: EditableRow[], context: { organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string }): Promise<EditableRow[]> {
''',
)
replace_count(
    "app/planning-lifecycle-client.tsx",
    'await enrichRowsWithCurrentSheetMusic(editableRows, { findSongById: async (songId) => { const result = await catalogClient.getSong({ songId }); return result.success ? result.value : undefined; } })',
    'await enrichEditableRowsWithCurrentSheetMusic(editableRows)',
    2,
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''      await openCompletedRecord(result.value);
      setWorkspace(getWorkspaceAfterOpenRecord());
      await refreshDbSets();
      return;
''',
    '''      await openCompletedRecord(result.value);
      setWorkspace(getWorkspaceAfterOpenRecord());
      return;
''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '''      await openPersistedSet(result.value);
      setWorkspace(getWorkspaceAfterOpenRecord());
      await refreshDbSets();
      return;
''',
    '''      await openPersistedSet(result.value);
      setWorkspace(getWorkspaceAfterOpenRecord());
      return;
''',
)
replace_once(
    "app/planning-lifecycle-client.tsx",
    '  async function startNewDbDraft() {\n    const { draftPeopleDefaults: defaults } = await refreshDbSets();\n',
    '  async function startNewDbDraft() {\n    const defaults = draftPeopleDefaults;\n',
)

# Runtime guard: no request/render path may construct or close its own pg Pool after this patch.
offenders = []
for path in (ROOT / "app").rglob("*.ts*"):
    text = path.read_text(encoding="utf-8")
    if "new Pool(" in text or "pool.end()" in text:
        offenders.append(str(path.relative_to(ROOT)))
if offenders:
    raise SystemExit("Per-request/render pg Pool lifecycle remains in app runtime: " + ", ".join(offenders))

print("Issue #225 guarded latency patch applied.")
