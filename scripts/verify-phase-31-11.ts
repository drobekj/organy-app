import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/planning-lifecycle/route";
import {
  createDatabaseSql,
  createNpmInvocation,
  deriveControlUrl,
  deriveDatabaseUrl,
  dropDatabaseSql,
  generateE1DatabaseName,
  parseGuardDatabaseUrl,
  withCleanup,
} from "./engineering-e1-core";

const PASS_LINE = "Phase 31.11 authoritative Service Context antiphon: PASS";
const ACTOR = { userId: "demo-admin-user", role: "admin" } as const;

function runNpm(name: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
    const child = spawn(invocation.command, invocation.args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} failed with exit code ${code ?? 1}.`)));
  });
}

async function invoke(action: string, input: unknown) {
  const response = await POST(new Request("http://localhost/api/planning-lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input, actor: ACTOR }),
  }));
  return { status: response.status, body: await response.json() as any };
}

async function fingerprint(pool: Pool): Promise<string> {
  const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => String(row.tablename));
  return JSON.stringify(await Promise.all(tables.map(async (table) => [table, Number((await pool.query(`select count(*)::int n from public.${table}`)).rows[0].n)])));
}

function baseContext(referenceAntiphon?: unknown) {
  return {
    serviceDate: "2026-01-10",
    serviceTime: "10:31",
    language: "czech",
    priest: { id: "demo-priest", displayName: "Demo Priest" },
    organist: { id: "demo-organist", displayName: "Demo Organist" },
    antiphonKey: "legacy-key",
    liturgicalSeasonKey: "legacy-season",
    ...(referenceAntiphon === undefined ? {} : { referenceAntiphon }),
  };
}

const forged = (id: string) => ({ id, displayNumber: "FORGED", title: "Forged title", sourceUrl: "https://www.evangelickykancional.cz/forged" });
const workingSet = { status: "working" as const, language: "czech" as const, rows: [] };
const finalSet = { status: "final" as const, language: "czech" as const, rows: [] };

async function verifySchema(pool: Pool) {
  const columns = await pool.query(`select column_name,is_nullable from information_schema.columns
    where table_schema='public' and table_name='service_contexts' and column_name like 'reference_antiphon_%' order by ordinal_position`);
  assert.deepEqual(columns.rows, [
    { column_name: "reference_antiphon_id", is_nullable: "YES" },
    { column_name: "reference_antiphon_display_number", is_nullable: "YES" },
    { column_name: "reference_antiphon_title", is_nullable: "YES" },
    { column_name: "reference_antiphon_source_url", is_nullable: "YES" },
  ]);
  const checks = await pool.query(`select conname from pg_constraint where conrelid='public.service_contexts'::regclass and contype='c' and conname like 'service_contexts_reference_antiphon_%' order by conname`);
  assert.deepEqual(checks.rows.map((row) => row.conname), [
    "service_contexts_reference_antiphon_identity",
    "service_contexts_reference_antiphon_snapshot_complete",
    "service_contexts_reference_antiphon_snapshot_non_empty",
    "service_contexts_reference_antiphon_source_url_valid",
  ]);
  const fks = await pool.query(`select count(*)::int n from pg_constraint c join unnest(c.conkey) key(attnum) on true join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key.attnum where c.conrelid='public.service_contexts'::regclass and c.contype='f' and a.attname='reference_antiphon_id'`);
  assert.equal(Number(fks.rows[0].n), 0, "historical antiphon snapshot unexpectedly has a foreign key");
}

async function verifyLifecycle(pool: Pool) {
  const empty = await invoke("saveWorkingSet", { serviceContext: baseContext(), set: workingSet });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.success, true);
  const setId = String(empty.body.value.id);
  assert.equal(empty.body.value.serviceContext.referenceAntiphon, undefined);
  const emptyColumns = (await pool.query("select reference_antiphon_id,reference_antiphon_display_number,reference_antiphon_title,reference_antiphon_source_url from service_contexts where id=(select service_context_id from service_sets where id=$1)", [Number(setId)])).rows[0];
  assert.deepEqual(emptyColumns, { reference_antiphon_id: null, reference_antiphon_display_number: null, reference_antiphon_title: null, reference_antiphon_source_url: null });

  const normalized = await invoke("saveWorkingSet", { existingSetId: setId, serviceContext: baseContext(forged("czech:800")), set: workingSet });
  assert.equal(normalized.body.success, true);
  assert.equal(normalized.body.value.serviceContext.referenceAntiphon.id, "czech:800");
  assert.equal(normalized.body.value.serviceContext.referenceAntiphon.displayNumber, "800");
  assert.notEqual(normalized.body.value.serviceContext.referenceAntiphon.title, "Forged title");
  assert.notEqual(normalized.body.value.serviceContext.referenceAntiphon.sourceUrl, "https://www.evangelickykancional.cz/forged");
  assert.equal(normalized.body.value.serviceContext.antiphonKey, "legacy-key");
  assert.equal(normalized.body.value.serviceContext.liturgicalSeasonKey, "legacy-season");
  const authoritative800 = normalized.body.value.serviceContext.referenceAntiphon;

  const loaded = await invoke("loadPlanningSet", { setId });
  assert.deepEqual(loaded.body.value.serviceContext.referenceAntiphon, authoritative800);

  const malformedValues: unknown[] = [
    null,
    "czech:800",
    { id: "czech:800" },
    { id: "czech:800", displayNumber: 800, title: "x", sourceUrl: "https://www.evangelickykancional.cz/x" },
    { ...forged("czech:800"), extra: true },
    forged("czech:799"),
    forged("czech:916"),
    forged("polish:800"),
  ];
  for (const value of malformedValues) {
    const rejected = await invoke("saveWorkingSet", { existingSetId: setId, serviceContext: baseContext(value), set: workingSet });
    assert.equal(rejected.body.success, false, `malformed selection unexpectedly persisted: ${JSON.stringify(value)}`);
    assert.equal(rejected.body.error.code, "invalidInput");
    assert.deepEqual((await invoke("loadPlanningSet", { setId })).body.value.serviceContext.referenceAntiphon, authoritative800);
  }

  await pool.query("delete from reference_antiphons where id='czech:915'");
  const unknown = await invoke("saveWorkingSet", { existingSetId: setId, serviceContext: baseContext(forged("czech:915")), set: workingSet });
  assert.equal(unknown.body.success, false);
  assert.equal(unknown.body.error.code, "notFound");
  assert.deepEqual((await invoke("loadPlanningSet", { setId })).body.value.serviceContext.referenceAntiphon, authoritative800);
  await runNpm("db:sync:reference-antiphons", process.env.DATABASE_URL!);

  const replaced = await invoke("saveWorkingSet", { existingSetId: setId, serviceContext: baseContext(forged("czech:801")), set: workingSet });
  assert.equal(replaced.body.success, true);
  assert.equal(replaced.body.value.serviceContext.referenceAntiphon.id, "czech:801");
  const authoritative801 = replaced.body.value.serviceContext.referenceAntiphon;

  await pool.query("delete from reference_antiphons where id='czech:801'");
  const historical = await invoke("saveWorkingSet", { existingSetId: setId, serviceContext: { ...baseContext(), referenceAntiphon: authoritative801 }, set: workingSet });
  assert.equal(historical.body.success, true, "unchanged historical snapshot depended on authoritative row presence");
  assert.deepEqual(historical.body.value.serviceContext.referenceAntiphon, authoritative801);
  await runNpm("db:sync:reference-antiphons", process.env.DATABASE_URL!);

  const removed = await invoke("saveWorkingSet", { existingSetId: setId, serviceContext: baseContext(), set: workingSet });
  assert.equal(removed.body.success, true);
  assert.equal(removed.body.value.serviceContext.referenceAntiphon, undefined);
  const readded = await invoke("saveWorkingSet", { existingSetId: setId, serviceContext: baseContext(forged("czech:802")), set: workingSet });
  assert.equal(readded.body.success, true);
  const authoritative802 = readded.body.value.serviceContext.referenceAntiphon;

  const finalized = await invoke("finalizeWorkingSet", { workingSetId: setId });
  assert.equal(finalized.body.success, true);
  assert.deepEqual(finalized.body.value.serviceContext.referenceAntiphon, authoritative802);
  const finalId = String(finalized.body.value.id);

  const completed = await invoke("completeFinalSet", { finalSetId: finalId });
  assert.equal(completed.body.success, true);
  assert.deepEqual(completed.body.value.serviceContext.referenceAntiphon, authoritative802);
  const recordId = String(completed.body.value.id);
  assert.deepEqual((await invoke("loadCompletedRecord", { recordId })).body.value.serviceContext.referenceAntiphon, authoritative802);

  await pool.query("delete from reference_antiphons where id='czech:802'");
  assert.deepEqual((await invoke("loadCompletedRecord", { recordId })).body.value.serviceContext.referenceAntiphon, authoritative802, "historical completed snapshot was coupled to catalog row");
  await runNpm("db:sync:reference-antiphons", process.env.DATABASE_URL!);

  const completedReplace = await invoke("updateCompletedRecord", { recordId, serviceContext: baseContext(forged("czech:803")), set: finalSet });
  assert.equal(completedReplace.body.success, true);
  assert.equal(completedReplace.body.value.serviceContext.referenceAntiphon.id, "czech:803");
  const completedRemove = await invoke("updateCompletedRecord", { recordId, serviceContext: baseContext(), set: finalSet });
  assert.equal(completedRemove.body.success, true);
  assert.equal(completedRemove.body.value.serviceContext.referenceAntiphon, undefined);
  assert.equal(completedRemove.body.value.serviceContext.antiphonKey, "legacy-key");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.11 verification.");
  await runNpm("test:phase-31-11", process.env.DATABASE_URL);
  const guardUrl = process.env.DATABASE_URL;
  const guard = parseGuardDatabaseUrl(guardUrl);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const guardPool = new Pool({ connectionString: guardUrl });
  const before = await fingerprint(guardPool);
  await guardPool.end();
  const name = generateE1DatabaseName();
  const databaseUrl = deriveDatabaseUrl(guard, name);
  await control.query(createDatabaseSql(name));
  const previousRuntime = process.env.ORGANY_RUNTIME;
  try {
    await withCleanup(async () => {
      await runNpm("db:migrate", databaseUrl);
      await runNpm("db:migrate", databaseUrl);
      await runNpm("db:sync:reference-antiphons", databaseUrl);
      await runNpm("db:seed:catalog", databaseUrl);
      const pool = new Pool({ connectionString: databaseUrl });
      try {
        await verifySchema(pool);
        process.env.DATABASE_URL = databaseUrl;
        process.env.ORGANY_RUNTIME = "db";
        await verifyLifecycle(pool);
      } finally { await pool.end(); }
    }, async () => {
      const [terminate, drop] = dropDatabaseSql(name);
      await control.query(terminate, [name]);
      await control.query(drop);
    });
    assert.equal((await control.query("select 1 from pg_database where datname=$1", [name])).rows.length, 0);
    const afterPool = new Pool({ connectionString: guardUrl });
    try { assert.equal(await fingerprint(afterPool), before, "guard database fingerprint changed"); }
    finally { await afterPool.end(); }
    console.log(PASS_LINE);
  } finally {
    process.env.DATABASE_URL = guardUrl;
    if (previousRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = previousRuntime;
    await control.end();
  }
}

void main().catch((error) => { console.error("Phase 31.11 authoritative Service Context antiphon: FAIL"); console.error(error); process.exitCode = 1; });
