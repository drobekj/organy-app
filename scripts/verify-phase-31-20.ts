import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { createDbBackedPlanningLifecycleService } from "../src/application/planning-lifecycle";
import { PostgresReferenceThematicSectionProvider } from "../src/application/postgres-reference-thematic-section";
import { ReferenceCandidateService } from "../src/application/reference-candidate-service";
import { synchronizeReferenceCatalog } from "../src/application/reference-catalog-sync";
import { synchronizeReferenceThematicSections } from "../src/application/reference-thematic-section-sync";
import {
  createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl,
  dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup,
} from "./engineering-e1-core";

const PASS = "Phase 31.20 Service Context Topic and soft thematic signal: PASS";
const DEMO_PRIEST_ID = "phase29-demo-priest";
const DEMO_ORGANIST_ID = "phase29-demo-organist";

function runNpm(name: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const call = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
    const child = spawn(call.command, call.args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} exited with ${code ?? 1}.`)));
  });
}

async function verifyLifecyclePersistence(pool: Pool) {
  const topics = new PostgresReferenceThematicSectionProvider(pool);
  const db = drizzle(pool, { schema });
  const service = createDbBackedPlanningLifecycleService({ db, referenceTopics: topics });
  const context = {
    serviceDate: "2026-08-09",
    serviceTime: "10:00",
    language: "czech" as const,
    priest: { id: DEMO_PRIEST_ID, displayName: "Phase 29 Demo Priest" },
    organist: { id: DEMO_ORGANIST_ID, displayName: "Phase 29 Demo Organist" },
    referenceTopic: { id: "czech:church-year:advent", title: "Spoofed client title" },
  };
  const set = { status: "working" as const, language: "czech" as const, rows: [{ note: "Topic persistence probe" }] };
  const saved = await service.saveWorkingSet({ role: "admin", serviceContext: context, set });
  assert.equal(saved.success, true);
  if (!saved.success) throw new Error("Initial Topic persistence save failed.");
  assert.deepEqual(saved.value.serviceContext.referenceTopic, { id: "czech:church-year:advent", title: "Advent" });

  const persisted = (await pool.query("select reference_topic_id, reference_topic_title from service_contexts where id=(select service_context_id from service_sets where id=$1)", [Number(saved.value.id)])).rows[0];
  assert.deepEqual(persisted, { reference_topic_id: "czech:church-year:advent", reference_topic_title: "Advent" });

  await pool.query("update reference_thematic_sections set title='Changed DB Topic' where id='czech:church-year:advent'");
  const unchanged = await service.saveWorkingSet({
    role: "admin",
    existingSetId: saved.value.id,
    serviceContext: { ...saved.value.serviceContext, referenceTopic: { ...saved.value.serviceContext.referenceTopic! } },
    set,
  });
  assert.equal(unchanged.success, true);
  if (!unchanged.success) throw new Error("Historical Topic snapshot save failed.");
  assert.equal(unchanged.value.serviceContext.referenceTopic?.title, "Advent", "Historical Topic snapshot must not drift after catalog edits");
  await synchronizeReferenceThematicSections(pool);

  const mismatch = await service.saveWorkingSet({
    role: "admin",
    existingSetId: saved.value.id,
    serviceContext: { ...saved.value.serviceContext, language: "polish", referenceTopic: { id: "czech:church-year:advent", title: "Advent" } },
    set: { ...set, language: "polish" },
  });
  assert.equal(mismatch.success, false);
  if (!mismatch.success) assert.equal(mismatch.error.message, "Selected topic must match the service language.");

  const cleared = await service.saveWorkingSet({
    role: "admin",
    existingSetId: saved.value.id,
    serviceContext: { ...saved.value.serviceContext, referenceTopic: undefined },
    set,
  });
  assert.equal(cleared.success, true);
  const clearedRow = (await pool.query("select reference_topic_id, reference_topic_title from service_contexts where id=(select service_context_id from service_sets where id=$1)", [Number(saved.value.id)])).rows[0];
  assert.deepEqual(clearedRow, { reference_topic_id: null, reference_topic_title: null });
}

async function verifyCandidateSignal(pool: Pool) {
  for (const songId of ["czech:1", "czech:30", "polish:1"]) {
    await pool.query("insert into reference_organist_repertoire(organist_person_id, reference_song_id) values($1,$2) on conflict do nothing", [DEMO_ORGANIST_ID, songId]);
  }
  const candidates = new ReferenceCandidateService(pool);
  const baseInput = {
    serviceDate: "2026-08-09",
    serviceLanguage: "mixed" as const,
    organistPersonId: DEMO_ORGANIST_ID,
    preferenceThreshold: 0,
    candidateUsages: [],
  };
  const before = await candidates.queryCandidates(baseInput);
  const after = await candidates.queryCandidates({ ...baseInput, referenceTopicId: "czech:church-year:advent" });
  assert.deepEqual(after.map((candidate) => candidate.songId), before.map((candidate) => candidate.songId), "Topic must not change concrete candidate order or cardinality");
  assert.equal(after.find((candidate) => candidate.songId === "czech:1")?.seasonMatch, true);
  assert.equal(after.find((candidate) => candidate.songId === "czech:1")?.signal, "season");
  assert.equal(after.find((candidate) => candidate.songId === "czech:30")?.seasonMatch, false);
  assert.equal(after.find((candidate) => candidate.songId === "polish:1")?.seasonMatch, false);

  const absent = await candidates.queryCandidates({ ...baseInput, referenceTopicId: "czech:missing-topic" });
  assert.deepEqual(absent.map((candidate) => candidate.songId), before.map((candidate) => candidate.songId));
  assert.ok(absent.every((candidate) => candidate.seasonMatch === false), "Missing later Topic knowledge must degrade to no soft signal");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.20 verification.");
  const guard = parseGuardDatabaseUrl(process.env.DATABASE_URL);
  const control = new Pool({ connectionString: deriveControlUrl(guard) });
  const name = generateE1DatabaseName();
  const url = deriveDatabaseUrl(guard, name);
  await control.query(createDatabaseSql(name));
  try {
    await withCleanup(async () => {
      await runNpm("db:migrate", url);
      await runNpm("db:migrate", url);
      await runNpm("db:seed:catalog", url);
      const pool = new Pool({ connectionString: url });
      try {
        const columns = (await pool.query("select column_name from information_schema.columns where table_schema='public' and table_name='service_contexts' and column_name in ('reference_topic_id','reference_topic_title') order by column_name")).rows.map((row) => row.column_name);
        assert.deepEqual(columns, ["reference_topic_id", "reference_topic_title"]);
        const constraints = (await pool.query("select conname from pg_constraint where conrelid='public.service_contexts'::regclass and conname like 'service_contexts_reference_topic_%' order by conname")).rows.map((row) => row.conname);
        assert.deepEqual(constraints, ["service_contexts_reference_topic_identity", "service_contexts_reference_topic_snapshot_complete", "service_contexts_reference_topic_title_non_empty"]);

        await synchronizeReferenceCatalog(pool);
        assert.deepEqual(await synchronizeReferenceThematicSections(pool), { parents: 6, sections: 71, ranges: 71 });
        const topicProvider = new PostgresReferenceThematicSectionProvider(pool);
        assert.deepEqual([(await topicProvider.listSections("czech")).length, (await topicProvider.listSections("polish")).length], [35, 36]);
        assert.equal((await topicProvider.getSectionById("polish:faith-love-hope:neighbor-love"))?.title, "Miłość bliźniego");

        await verifyLifecyclePersistence(pool);
        await verifyCandidateSignal(pool);
      } finally {
        await pool.end();
      }
    }, async () => {
      const [terminate, drop] = dropDatabaseSql(name);
      await control.query(terminate, [name]);
      await control.query(drop);
    });
    console.log(PASS);
  } finally {
    await control.end();
  }
}

void main().catch((error) => {
  console.error("Phase 31.20 Service Context Topic and soft thematic signal: FAIL");
  console.error(error);
  process.exitCode = 1;
});
