import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { getAppDbPool } from "../src/db/app-pool";
import { POST as planningLifecyclePost } from "../app/api/planning-lifecycle/route";
import {
  DrizzlePlanningSetRepository,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../src/application/planning-lifecycle";
import type { ActorIdentity } from "../src/application/interaction-contracts";
import { useProtectedActorForAcceptance } from "../src/application/protected-actor";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 225 acceptance.");

  await assertRuntimePoolDiscipline();
  await assertClientRequestCompaction();

  const firstManagedPool = getAppDbPool(databaseUrl);
  const secondManagedPool = getAppDbPool(databaseUrl);
  assert.strictEqual(firstManagedPool, secondManagedPool, "same DB URL must reuse one warm managed Pool instance");

  const fixturePool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(fixturePool, { schema });
  const dependencies: PlanningLifecycleDrizzleAdapterDependencies = {
    db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
    schema,
  };
  const plans = new DrizzlePlanningSetRepository(dependencies);
  const token = `${process.pid}-${Date.now()}`;
  const marker = `Issue 225 ${token}`;
  const actor: ActorIdentity = { userId: `issue225-admin-${token}`, displayName: `${marker} Admin`, role: "admin" };
  const restoreActor = useProtectedActorForAcceptance(async () => actor);
  const previousRuntime = process.env.ORGANY_RUNTIME;
  process.env.ORGANY_RUNTIME = "db";

  const day = String(1 + (Date.now() % 20)).padStart(2, "0");
  const minute = String(Date.now() % 60).padStart(2, "0");
  const serviceDate = `2026-07-${day}`;
  const serviceTime = `03:${minute}`;
  let finalSetId = "";

  try {
    const finalSet = await plans.saveFinalSet(
      { status: "final", language: "czech", rows: [] },
      {
        serviceDate,
        serviceTime,
        language: "czech",
        priest: { displayName: "Anonymous" },
        organist: { displayName: "Anonymous" },
        note: marker,
      },
    );
    finalSetId = finalSet.id;

    const firstResponse = await planningLifecyclePost(requestFor("getWorkspaceSnapshot", {}));
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json() as {
      success: boolean;
      value?: {
        activeSets: Array<{ id: string; status: string }>;
        completedRecords: Array<{ id: string; sourceFinalSetId?: string; serviceContext: { note?: string } }>;
        draftPeopleDefaults: { priest: { displayName: string }; organist: { displayName: string } };
      };
    };
    assert.equal(first.success, true, "workspace snapshot must succeed on the real DB route");
    assert.ok(first.value, "workspace snapshot value is required");
    assert.equal(first.value!.activeSets.some((set) => set.id === finalSetId), false, "past Final must reconcile out of active sets");
    const completed = first.value!.completedRecords.find((record) => record.serviceContext.note === marker);
    assert.ok(completed, "same snapshot must include the automatically completed service");
    assert.equal(first.value!.draftPeopleDefaults.priest.displayName, "Anonymous");
    assert.equal(first.value!.draftPeopleDefaults.organist.displayName, "Anonymous");

    const auditAfterFirst = await fixturePool.query(
      `select count(*)::int as count
       from audit_events
       where action = 'planning.final.autoComplete'
         and before_state ->> 'sourceFinalSetId' = $1`,
      [finalSetId],
    );
    assert.equal(auditAfterFirst.rows[0].count, 1, "snapshot reconciliation must retain exactly-one system audit semantics");

    const secondResponse = await planningLifecyclePost(requestFor("getWorkspaceSnapshot", {}));
    assert.equal(secondResponse.status, 200);
    const second = await secondResponse.json() as { success: boolean; value?: { completedRecords: Array<{ serviceContext: { note?: string } }> } };
    assert.equal(second.success, true);
    assert.equal(second.value?.completedRecords.filter((record) => record.serviceContext.note === marker).length, 1, "repeat snapshot must be idempotent");
    const auditAfterSecond = await fixturePool.query(
      `select count(*)::int as count
       from audit_events
       where action = 'planning.final.autoComplete'
         and before_state ->> 'sourceFinalSetId' = $1`,
      [finalSetId],
    );
    assert.equal(auditAfterSecond.rows[0].count, 1, "repeat snapshot must not duplicate the auto-completion audit event");

    console.log("Issue #225 DB-backed latency acceptance passed.");
  } finally {
    restoreActor();
    if (previousRuntime === undefined) delete process.env.ORGANY_RUNTIME;
    else process.env.ORGANY_RUNTIME = previousRuntime;
    if (finalSetId) {
      await fixturePool.query(
        "delete from audit_events where action = 'planning.final.autoComplete' and before_state ->> 'sourceFinalSetId' = $1",
        [finalSetId],
      ).catch(() => undefined);
    }
    await fixturePool.query("delete from service_contexts where note = $1", [marker]).catch(() => undefined);
    await fixturePool.end();
  }
}

async function assertRuntimePoolDiscipline() {
  const appFiles = await collectFiles("app");
  const offenders: string[] = [];
  for (const path of appFiles.filter((path) => /\.(?:ts|tsx)$/.test(path))) {
    const source = await readFile(path, "utf8");
    if (/new\s+Pool\s*\(/.test(source) || /pool\.end\s*\(/.test(source)) offenders.push(path);
  }
  assert.deepEqual(offenders, [], "request/render runtime must not own and tear down pg pools");

  const poolSource = await readFile("src/db/app-pool.ts", "utf8");
  assert.match(poolSource, /attachDatabasePool\(/, "managed pool must be attached to the Vercel Functions runtime");
  assert.match(poolSource, /__organyAppDbPools/, "managed pool must be reused across warm module instances/HMR");
  assert.equal((poolSource.match(/new\s+Pool\s*\(/g) ?? []).length, 1, "application pool module must have one construction site");
  assert.match(poolSource, /PostgreSQL idle client error\./, "shared pool must handle background idle-client errors instead of crashing the process");

  const authSource = await readFile("src/auth/server.ts", "utf8");
  assert.match(authSource, /getAppDbPool\(databaseUrl\)/, "auth must reuse the same managed pool infrastructure");
}

async function assertClientRequestCompaction() {
  const client = await readFile("app/planning-lifecycle-client.tsx", "utf8");
  const catalogWorkspace = await readFile("app/catalog-workspace.tsx", "utf8");
  const interactionRoute = await readFile("app/api/interaction/route.ts", "utf8");
  const planningRoute = await readFile("app/api/planning-lifecycle/route.ts", "utf8");
  const catalogRoute = await readFile("app/api/catalog/route.ts", "utf8");
  const catalog = await readFile("src/application/catalog.ts", "utf8");

  assert.match(client, /getWorkspaceSnapshot\(\)/, "DB refresh must use one workspace snapshot request");
  assert.match(client, /planningLifecycleService\.getWorkspaceSnapshot\(\)/, "refreshDbSets must call the compact DB snapshot");
  assert.match(planningRoute, /action === "getWorkspaceSnapshot"/, "server must expose the compact snapshot action");
  assert.match(client, /getPlanningPeople\(\)/, "planning people bootstrap must be batched into one catalog request");
  assert.doesNotMatch(client, /workspace === "catalog" && selectedRole === "admin"[^\n]*refreshCatalogAdmin/, "removed heavy admin catalog bootstrap must not run when Catalog opens");
  assert.match(client, /<CatalogWorkspace/, "Catalog must render the scoped Catalog workspace instead of bootstrapping the legacy admin snapshot");
  const catalogReload = extractFunction(catalogWorkspace, "async function reloadCandidates", "useEffect(() => {");
  assert.match(catalogReload, /queryCandidates\(candidateInput\(\)\)/, "Catalog candidates must load on demand through the scoped Catalog query input");
  assert.doesNotMatch(catalogReload, /getAdminCatalogSnapshot|refreshCatalogAdmin/, "scoped Catalog candidate reload must not restore the removed heavy admin bootstrap");
  assert.match(catalogWorkspace, /useEffect\(\(\) => \{\s*setSelectedDetail\(undefined\);\s*void reloadCandidates\(\);\s*\}, \[language, effectiveOrganistPersonId, antiphon\?\.id, topic\?\.id, availabilityMode, queryCandidates, actor\.role, actor\.personId\]\);/, "Catalog context changes must trigger the scoped on-demand candidate reload");
  assert.match(client, /queryCatalogCandidates/, "Catalog must use its dedicated candidate transport");
  assert.match(interactionRoute, /case "queryCatalogCandidates"/, "server must expose the scoped read-only Catalog candidate action");
  assert.match(client, /getSongs\(\{ songIds \}\)/, "record opening must batch current-song metadata lookup");
  assert.match(catalogRoute, /action === "getAdminCatalogSnapshot"/);
  assert.match(catalogRoute, /action === "getPlanningPeople"/);
  assert.match(catalog, /findSongsByIds\(ids: string\[\]\)/, "catalog repository must support one-query song batching");

  const completedOpen = extractFunction(client, "async function loadCompletedRecord", "async function loadDbSet");
  assert.doesNotMatch(completedOpen, /refreshDbSets\(/, "read-only Completed open must not refetch the whole workspace");
  const planOpen = extractFunction(client, "async function loadDbSet", "async function saveWorkingSet");
  assert.doesNotMatch(planOpen, /refreshDbSets\(/, "read-only plan open must not refetch the whole workspace");
  const newDraft = extractFunction(client, "async function startNewDbDraft", "function guardedEditorUpdate");
  assert.doesNotMatch(newDraft, /refreshDbSets\(/, "starting a draft must reuse already-loaded defaults instead of a network refresh");
}

function extractFunction(source: string, start: string, next: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing function marker ${start}`);
  const to = source.indexOf(next, from + start.length);
  assert.notEqual(to, -1, `missing next function marker ${next}`);
  return source.slice(from, to);
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}

function requestFor(action: string, input: unknown): Request {
  return new Request("http://localhost/api/planning-lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
