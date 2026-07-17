from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f"Expected text not found in {path}: {old[:80]!r}")
    path.write_text(text.replace(old, new, 1))


adapter = Path("src/application/planning-lifecycle/drizzle-repository-adapters.ts")
replace_once(
    adapter,
    'import { asc, eq } from "drizzle-orm";\n',
    'import { asc, eq } from "drizzle-orm";\nimport type { NodePgDatabase } from "drizzle-orm/node-postgres";\n',
)
replace_once(
    adapter,
    'import { DrizzleCatalogRepository, type CatalogDrizzleExecutor } from "../catalog";\n',
    'import { DrizzleCatalogRepository } from "../catalog";\n',
)
replace_once(
    adapter,
    '''type DrizzleExecutor = {\n  select: () => unknown;\n  insert: (table: unknown) => unknown;\n  update: (table: unknown) => unknown;\n  delete: (table: unknown) => unknown;\n};\n\ntype TransactionalDrizzleExecutor = DrizzleExecutor & CatalogDrizzleExecutor & {\n  transaction: <T>(callback: (tx: DrizzleExecutor) => Promise<T>) => Promise<T>;\n};\n\nexport type PlanningLifecycleDrizzleAdapterDependencies = {\n  db: TransactionalDrizzleExecutor;\n  schema?: PlanningLifecycleDrizzleSchema;\n};\n''',
    '''type PlanningLifecycleDrizzleDatabase = NodePgDatabase<typeof planningLifecycleSchema>;\ntype DrizzleExecutor = Pick<PlanningLifecycleDrizzleDatabase, "select" | "insert" | "update" | "delete">;\ntype DrizzleTable = Parameters<PlanningLifecycleDrizzleDatabase["insert"]>[0];\n\nexport type PlanningLifecycleDrizzleAdapterDependencies = {\n  db: PlanningLifecycleDrizzleDatabase;\n  schema?: PlanningLifecycleDrizzleSchema;\n};\n''',
)
replace_once(adapter, "function insertInto(db: DrizzleExecutor, table: unknown) {", "function insertInto(db: DrizzleExecutor, table: DrizzleTable) {")
replace_once(adapter, "function updateTable(db: DrizzleExecutor, table: unknown) {", "function updateTable(db: DrizzleExecutor, table: DrizzleTable) {")
replace_once(adapter, "function deleteFrom(db: DrizzleExecutor, table: unknown) {", "function deleteFrom(db: DrizzleExecutor, table: DrizzleTable) {")

catalog = Path("src/application/catalog.ts")
replace_once(
    catalog,
    'export type CatalogDrizzleExecutor = NodePgDatabase<typeof schema>;',
    'type CatalogDrizzleDatabase = NodePgDatabase<typeof schema>;\nexport type CatalogDrizzleExecutor = Pick<CatalogDrizzleDatabase, "select" | "insert" | "update">;',
)

Path("scripts/db-catalog-seed-smoke.ts").write_text('''import { Pool } from "pg";\nimport { drizzle } from "drizzle-orm/node-postgres";\nimport { DrizzleCatalogRepository, type CatalogSong } from "../src/application/catalog";\nimport { phase29DemoPeople, phase29DemoSongs, seedCatalog } from "../src/application/catalog-seed";\nimport * as schema from "../src/db/schema";\n\nif (!process.env.DATABASE_URL) {\n  console.error("DATABASE_URL is required.");\n  process.exit(1);\n}\n\nconst marker = `Phase29 Seed Smoke ${Date.now()}-${process.pid}`;\nconst pool = new Pool({ connectionString: process.env.DATABASE_URL });\nconst db = drizzle(pool, { schema });\n\nclass RollbackSeedSmoke extends Error {}\n\nasync function main() {\n  let assertionsPassed = false;\n  try {\n    await db.transaction(async (tx) => {\n      const repo = new DrizzleCatalogRepository(tx);\n      const foreignPerson = { id: `${marker} person`, displayName: `${marker} Person`, active: true, priest: true, organist: false };\n      const czech101Witness = await findOrCreateSongWitness(repo, { songId: `${marker} czech 101`, language: "czech", number: "101", title: `${marker} Czech 101`, active: true });\n      const polish101Witness = await findOrCreateSongWitness(repo, { songId: `${marker} polish 101`, language: "polish", number: "101", title: `${marker} Polish 101`, active: true });\n\n      await repo.upsertPerson(foreignPerson);\n      await seedCatalog(repo);\n      await seedCatalog(repo);\n\n      const people = await repo.listPeople();\n      const songs = await repo.listSongs();\n      assert(phase29DemoPeople.every((person) => people.filter((row) => row.id === person.id).length === 1), "each demo person exists once");\n      assert(phase29DemoSongs.every((song) => songs.filter((row) => row.songId === song.songId).length === 1), "each demo song exists once");\n      assertEqual(people.find((row) => row.id === foreignPerson.id), foreignPerson, "foreign person unchanged");\n      assertEqual(songs.find((row) => row.songId === czech101Witness.songId), czech101Witness, "Czech 101 witness unchanged");\n      assertEqual(songs.find((row) => row.songId === polish101Witness.songId), polish101Witness, "Polish 101 witness unchanged");\n      assert(songs.some((song) => song.number === "PH29-DEMO-101"), "reserved demo number exists");\n      assert(songs.some((song) => song.language === "czech" && song.number === "101"), "regular Czech 101 can coexist");\n      assert(songs.some((song) => song.language === "polish" && song.number === "101"), "regular Polish 101 can coexist");\n      const languageNumbers = new Set<string>();\n      for (const song of phase29DemoSongs) {\n        const key = `${song.language}:${song.number}`;\n        assert(!languageNumbers.has(key), "demo language/number remains unique");\n        languageNumbers.add(key);\n      }\n      assertionsPassed = true;\n      throw new RollbackSeedSmoke();\n    });\n  } catch (error) {\n    if (!(error instanceof RollbackSeedSmoke)) throw error;\n  } finally {\n    await pool.end();\n  }\n  assert(assertionsPassed, "seed smoke assertions completed");\n  console.log("DB catalog seed smoke passed.");\n}\n\nasync function findOrCreateSongWitness(repo: DrizzleCatalogRepository, fallback: CatalogSong): Promise<CatalogSong> {\n  const existing = (await repo.listSongs()).find((song) => song.language === fallback.language && song.number === fallback.number);\n  if (existing) return { ...existing };\n  await repo.upsertSong(fallback);\n  return fallback;\n}\n\nfunction assert(value: unknown, message: string): asserts value {\n  if (!value) throw new Error(message);\n}\n\nfunction assertEqual(actual: unknown, expected: unknown, message: string) {\n  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);\n}\n\nmain().catch((error) => {\n  console.error(error);\n  process.exit(1);\n});\n''')

Path(".github/workflows/ci.yml").write_text('''name: CI\n\non:\n  pull_request:\n  push:\n    branches:\n      - main\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - name: Install dependencies\n        run: npm ci --no-audit --no-fund --loglevel=error\n      - name: Typecheck\n        run: npm run typecheck\n      - name: Test\n        run: npm run test\n      - name: Build\n        run: npm run build\n''')

Path(__file__).unlink()
