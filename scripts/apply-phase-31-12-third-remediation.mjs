import { readFileSync, writeFileSync } from "node:fs";

function patch(path, from, to) {
  const current = readFileSync(path, "utf8");
  if (current.includes(to)) return;
  if (!current.includes(from)) throw new Error(`Expected source was not found in ${path}: ${from.slice(0, 120)}`);
  const next = current.replace(from, to);
  writeFileSync(path, next, "utf8");
}

patch(
  "src/application/planning-lifecycle/service.ts",
  'import type { ReferenceAntiphonProvider, ReferenceAntiphonRecord } from "../reference-antiphon-contract";\n',
  'import type { ReferenceAntiphonProvider, ReferenceAntiphonRecord } from "../reference-antiphon-contract";\nimport type { ReferenceCatalogRecord } from "../reference-catalog-contract";\n',
);

patch(
  "src/application/planning-lifecycle/service.ts",
  '  referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  now?: () => Date;\n',
  '  referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  referenceSongs?: { getById(id: string): ReferenceCatalogRecord | undefined | Promise<ReferenceCatalogRecord | undefined> };\n  now?: () => Date;\n',
);

patch(
  "src/application/planning-lifecycle/service.ts",
  '  private readonly referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  private readonly enforceCatalogSelections: boolean;\n',
  '  private readonly referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  private readonly referenceSongs?: { getById(id: string): ReferenceCatalogRecord | undefined | Promise<ReferenceCatalogRecord | undefined> };\n  private readonly enforceCatalogSelections: boolean;\n',
);

patch(
  "src/application/planning-lifecycle/service.ts",
  '    this.referenceAntiphons = dependencies.referenceAntiphons;\n    this.enforceCatalogSelections = dependencies.enforceCatalogSelections ?? true;\n',
  '    this.referenceAntiphons = dependencies.referenceAntiphons;\n    this.referenceSongs = dependencies.referenceSongs;\n    this.enforceCatalogSelections = dependencies.enforceCatalogSelections ?? true;\n',
);

patch(
  "src/application/planning-lifecycle/service.ts",
  '      const song = await this.catalog.findSongById(row.song.songId);\n      if (!song) { issues.push({ path: `rows.${index}.song`, message: "Song was not found in the catalog." }); continue; }\n',
  '      const referenceSong = await this.referenceSongs?.getById(row.song.songId);\n      if (referenceSong) {\n        if (!allowLanguageDeviations && !languagesForService(normalizedContext.language).includes(referenceSong.language)) { issues.push({ path: `rows.${index}.song`, message: "Song is not active for this service language." }); continue; }\n        row.song = { songId: referenceSong.id, language: referenceSong.language, number: referenceSong.displayNumber, title: referenceSong.title };\n        continue;\n      }\n      const song = await this.catalog.findSongById(row.song.songId);\n      if (!song) { issues.push({ path: `rows.${index}.song`, message: "Song was not found in the catalog." }); continue; }\n',
);

patch(
  "src/application/planning-lifecycle/drizzle-repository-adapters.ts",
  '  dependencies: PlanningLifecycleDrizzleAdapterDependencies & Partial<Pick<PlanningLifecycleServiceDependencies, "now" | "referenceAntiphons">>,\n',
  '  dependencies: PlanningLifecycleDrizzleAdapterDependencies & Partial<Pick<PlanningLifecycleServiceDependencies, "now" | "referenceAntiphons" | "referenceSongs">>,\n',
);

patch(
  "src/application/planning-lifecycle/drizzle-repository-adapters.ts",
  '    referenceAntiphons: dependencies.referenceAntiphons,\n    now: dependencies.now,\n',
  '    referenceAntiphons: dependencies.referenceAntiphons,\n    referenceSongs: dependencies.referenceSongs,\n    now: dependencies.now,\n',
);

patch(
  "app/api/planning-lifecycle/route.ts",
  'import { PostgresReferenceAntiphonProvider } from "../../../src/application/postgres-reference-antiphon";\n',
  'import { PostgresReferenceAntiphonProvider } from "../../../src/application/postgres-reference-antiphon";\nimport { PostgresReferenceCatalogProvider } from "../../../src/application/postgres-reference-catalog";\n',
);

patch(
  "app/api/planning-lifecycle/route.ts",
  '    const service = createDbBackedPlanningLifecycleService({ ...adapterDependencies, referenceAntiphons: new PostgresReferenceAntiphonProvider(pool) });\n',
  '    const service = createDbBackedPlanningLifecycleService({\n      ...adapterDependencies,\n      referenceAntiphons: new PostgresReferenceAntiphonProvider(pool),\n      referenceSongs: new PostgresReferenceCatalogProvider(pool),\n    });\n',
);

patch(
  "scripts/verify-phase-31-12.ts",
  'import { POST, useInteractionPoolForAcceptance } from "../app/api/interaction/route";\n',
  'import { POST, useInteractionPoolForAcceptance } from "../app/api/interaction/route";\nimport { POST as planningLifecyclePOST } from "../app/api/planning-lifecycle/route";\n',
);

patch(
  "scripts/verify-phase-31-12.ts",
  'const PASS_LINE = "Phase 31.12 authoritative Planning candidates: PASS";\n',
  'const PASS_LINE = "Phase 31.12 authoritative Planning candidates: PASS";\nconst ACTOR = { userId: "demo-admin-user", role: "admin" } as const;\n',
);

patch(
  "scripts/verify-phase-31-12.ts",
  'async function databaseFingerprint(pool: Pool): Promise<string> {\n',
  'async function invokePlanning(action: string, input: unknown) {\n  const response = await planningLifecyclePOST(new Request("http://localhost/api/planning-lifecycle", {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({ action, input, actor: ACTOR }),\n  }));\n  return { status: response.status, body: await response.json() as any };\n}\n\nasync function databaseFingerprint(pool: Pool): Promise<string> {\n',
);

patch(
  "scripts/verify-phase-31-12.ts",
  '  assert.equal(highlighted[0].signal, "antiphon");\n\n  const legacyOnly = await query(baseQuery({ antiphonKey: "synthetic-entry", liturgicalSeasonKey: "synthetic-advent", queryText: "1" }));\n',
  '  assert.equal(highlighted[0].signal, "antiphon");\n\n  assert.equal(Number((await pool.query("select count(*)::int n from catalog_songs where song_id=\\\'czech:1\\\'")).rows[0].n), 0, "focused Reference song unexpectedly existed in the legacy catalog");\n  const savedReferenceCandidate = await invokePlanning("saveWorkingSet", {\n    serviceContext: {\n      serviceDate: "2026-08-09",\n      serviceTime: "13:12",\n      language: "czech",\n      priest: { id: "demo-priest", displayName: "Demo Priest" },\n      organist: { id: "demo-organist", displayName: "Demo Organist" },\n      antiphonKey: "legacy-test",\n    },\n    set: {\n      status: "working",\n      language: "czech",\n      rows: [{ song: { songId: highlighted[0].songId, language: highlighted[0].language, number: highlighted[0].number, title: highlighted[0].title } }],\n    },\n  });\n  assert.equal(savedReferenceCandidate.status, 200);\n  assert.equal(savedReferenceCandidate.body.success, true, JSON.stringify(savedReferenceCandidate.body));\n  assert.deepEqual(savedReferenceCandidate.body.value.rows[0].song, { songId: "czech:1", language: "czech", number: "1", title: "Phase 31.12 Authoritative Candidate" });\n  const loadedReferenceCandidate = await invokePlanning("loadPlanningSet", { setId: String(savedReferenceCandidate.body.value.id) });\n  assert.equal(loadedReferenceCandidate.body.success, true);\n  assert.deepEqual(loadedReferenceCandidate.body.value.rows[0].song, savedReferenceCandidate.body.value.rows[0].song, "Reference song snapshot did not persist through Working save/reload");\n\n  const legacyOnly = await query(baseQuery({ antiphonKey: "synthetic-entry", liturgicalSeasonKey: "synthetic-advent", queryText: "1" }));\n',
);

patch(
  "scripts/phase-31-12-tests.tsx",
  '  assert.doesNotMatch(migrationJournal, /phase_31_12/);\n}\n',
  '  assert.doesNotMatch(migrationJournal, /phase_31_12/);\n  const [lifecycleRoute, lifecycleService] = await Promise.all([\n    readFile("app/api/planning-lifecycle/route.ts", "utf8"),\n    readFile("src/application/planning-lifecycle/service.ts", "utf8"),\n  ]);\n  assert.match(lifecycleRoute, /referenceSongs: new PostgresReferenceCatalogProvider\\(pool\\)/);\n  assert.match(lifecycleService, /const referenceSong = await this\\.referenceSongs\\?\\.getById\\(row\\.song\\.songId\\)/);\n  assert.match(lifecycleService, /number: referenceSong\\.displayNumber, title: referenceSong\\.title/);\n}\n',
);

console.log("Applied Phase 31.12 third HUMAN remediation.");
