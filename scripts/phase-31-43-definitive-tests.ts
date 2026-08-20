import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { ReferenceCandidateService } from "../src/application/reference-candidate-service";
import {
  PHASE_31_43_TARGET_PERSON_ID,
  resolveContractIdentities,
  validateArchiveMemberNames,
  validateContractDocuments,
  type DefinitiveContract,
  type ReferenceSongIdentity,
} from "./phase-31-43-contract";
import {
  normalizePhase3143DocumentForValidation,
  readPhase3143DefinitiveArchive,
} from "./phase-31-43-definitive-reader";
import { validateDefinitiveMelodyForest } from "./phase-31-43-graph-check";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required for Phase 31.43 acceptance.");
const archivePath = process.env.PHASE_31_43_ARCHIVE ? resolve(process.env.PHASE_31_43_ARCHIVE) : undefined;
if (!archivePath) throw new Error("PHASE_31_43_ARCHIVE is required for Phase 31.43 acceptance.");

const TARGET = PHASE_31_43_TARGET_PERSON_ID;
const pool = new Pool({ connectionString: databaseUrl });
let tempRoot = "";

function runOperator(apply = false, extraEnv: Record<string, string> = {}, target = TARGET, archive = archivePath!) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawnSync(command, ["tsx", "scripts/production-legacy-repertoire-handoff.ts", "--archive", archive, ...(apply ? ["--apply"] : [])], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL_UNPOOLED: databaseUrl,
      ORGANY_REPERTOIRE_PERSON_ID: target,
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

function unzipJson<T = unknown>(name: string): T {
  const result = spawnSync("unzip", ["-p", archivePath!, name], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not read ${name}: ${result.stderr}`);
  return JSON.parse(result.stdout) as T;
}

async function knowledgeFingerprint(): Promise<string> {
  const classes = await pool.query("select id, created_at::text, updated_at::text from reference_melody_classes order by id");
  const memberships = await pool.query("select reference_song_id, class_id, updated_at::text from reference_song_melody_memberships order by reference_song_id");
  const repertoire = await pool.query("select organist_person_id, reference_song_id, updated_at::text from reference_organist_repertoire order by organist_person_id, reference_song_id");
  return JSON.stringify({ classes: classes.rows, memberships: memberships.rows, repertoire: repertoire.rows });
}

async function unrelatedFingerprint(): Promise<string> {
  const tables = [
    "reference_catalog_songs",
    "reference_antiphons",
    "reference_song_preferences",
    "reference_antiphon_recommendations",
    "reference_thematic_parents",
    "reference_thematic_sections",
    "reference_thematic_ranges",
    "service_contexts",
    "service_sets",
    "completed_services",
    "song_preferences",
    "preference_profiles",
    "app_users",
    "app_user_roles",
    "auth_users",
    "auth_accounts",
    "protected_account_actor_links",
    "auth_sessions",
    "auth_verifications",
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) counts[table] = Number((await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count);
  const config = await pool.query("select id, months from melody_non_repetition_config order by id");
  const persons = await pool.query("select id, display_name, active, priest, organist from catalog_persons order by id");
  return JSON.stringify({ counts, config: config.rows, persons: persons.rows });
}

async function referenceSongs(): Promise<ReferenceSongIdentity[]> {
  const result = await pool.query("select id, language, canonical_number from reference_catalog_songs order by language, canonical_number, id");
  return result.rows.map((row) => ({ id: String(row.id), language: row.language as "czech" | "polish", canonicalNumber: Number(row.canonical_number) }));
}

async function assertAppliedCounts(): Promise<void> {
  const classStats = await pool.query(`select
      count(*)::int as total,
      count(*) filter (where member_count=1)::int as singleton,
      count(*) filter (where member_count>1)::int as non_singleton
    from (
      select c.id, count(m.reference_song_id)::int as member_count
      from reference_melody_classes c
      left join reference_song_melody_memberships m on m.class_id=c.id
      group by c.id
    ) x`);
  assert.equal(Number(classStats.rows[0].total), 1553);
  assert.equal(Number(classStats.rows[0].singleton), 1450);
  assert.equal(Number(classStats.rows[0].non_singleton), 103);
  assert.equal(Number((await pool.query("select count(*)::int as count from reference_song_melody_memberships")).rows[0].count), 1798);
  assert.equal(Number((await pool.query("select count(*)::int as count from reference_organist_repertoire where organist_person_id=$1", [TARGET])).rows[0].count), 233);
  assert.equal(Number((await pool.query("select count(*)::int as count from reference_organist_repertoire where organist_person_id<>$1", [TARGET])).rows[0].count), 0);
  assert.equal(Number((await pool.query(`select count(*)::int as count from reference_melody_classes c
      where not exists (select 1 from reference_song_melody_memberships m where m.class_id=c.id)`)).rows[0].count), 0);

  const effective = await pool.query(`select count(distinct m.reference_song_id)::int as count
    from reference_song_melody_memberships m
    where m.class_id in (
      select distinct pm.class_id
      from reference_organist_repertoire r
      join reference_song_melody_memberships pm on pm.reference_song_id=r.reference_song_id
      where r.organist_person_id=$1
    )`, [TARGET]);
  assert.equal(Number(effective.rows[0].count), 442);
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

async function main(): Promise<void> {
  tempRoot = await mkdtemp(join(tmpdir(), "organy-phase-31-43-"));
  try {
    const { contract, handoffText } = await readPhase3143DefinitiveArchive(archivePath!);
    validateDefinitiveMelodyForest(contract);
    assert.match(handoffText, /Status: \*\*PASS\*\*/);
    assert.equal(contract.melodyClasses.length, 103);
    assert.equal(contract.melodyClasses.reduce((sum, item) => sum + item.provenanceEdges.length, 0), 245);
    assert.equal(contract.melodyClasses.reduce((sum, item) => sum + item.members.length, 0), 348);
    assert.equal(contract.pivots.length, 233);
    assert.equal(contract.effectivePlayableIdentities.size, 442);
    validateArchiveMemberNames(["HANDOFF.md", "C-validation-report.json", "B-jaroslav-repertoire-pivots.json", "A-melody-equivalence.json"]);
    assert.throws(() => validateArchiveMemberNames(["HANDOFF.md"]), /Archive member list/);

    const refs = await referenceSongs();
    const resolved = resolveContractIdentities(contract, refs);
    assert.equal(resolved.expectedClassBySongId.size, 1798);
    assert.equal(new Set(resolved.expectedClassBySongId.values()).size, 1553);
    assert.equal(resolved.pivotSongIds.size, 233);
    assert.equal(resolved.effectivePlayableSongIds.size, 442);

    const requiredIdentity = contract.melodyClasses[0].members[0];
    const missingKey = `${requiredIdentity.language}:${requiredIdentity.number}`;
    const refsWithMissingRequired = refs.map((row) => `${row.language}:${row.canonicalNumber}` === missingKey
      ? { ...row, id: `${row.language}:999999999`, canonicalNumber: 999999999 }
      : row);
    assert.throws(() => resolveContractIdentities(contract, refsWithMissingRequired), /does not resolve/);

    const forestClassIndex = contract.melodyClasses.findIndex((item) => item.members.length === 4);
    assert.ok(forestClassIndex >= 0, "Authoritative contract must contain a class of size 4 for adversarial forest acceptance.");
    const disconnected: DefinitiveContract = {
      ...contract,
      melodyClasses: contract.melodyClasses.map((item, index) => {
        if (index !== forestClassIndex) return item;
        const [a, b, c] = item.members;
        return {
          ...item,
          provenanceEdges: [
            { ...item.provenanceEdges[0], a, b },
            { ...item.provenanceEdges[1], a: b, b: c },
            { ...item.provenanceEdges[2], a: c, b: a },
          ],
        };
      }),
    };
    assert.throws(() => validateDefinitiveMelodyForest(disconnected), /disconnected/);

    const rawA = normalizePhase3143DocumentForValidation(unzipJson<Record<string, unknown>>("A-melody-equivalence.json"));
    const rawB = normalizePhase3143DocumentForValidation(unzipJson<Record<string, unknown>>("B-jaroslav-repertoire-pivots.json"));
    const rawC = normalizePhase3143DocumentForValidation(unzipJson<Record<string, unknown>>("C-validation-report.json"));
    const embeddedHandoffResult = spawnSync("unzip", ["-p", archivePath!, "HANDOFF.md"], { encoding: "utf8" });
    assert.equal(embeddedHandoffResult.status, 0);
    const embeddedHandoff = embeddedHandoffResult.stdout;

    const selfA = clone(rawA) as any;
    selfA.classes[0].provenance_edges[0].b = clone(selfA.classes[0].provenance_edges[0].a);
    assert.throws(() => validateContractDocuments(selfA, rawB, rawC, embeddedHandoff), /self edge/);

    const nullA = clone(rawA) as any;
    nullA.classes[0].provenance_edges[0].b = null;
    assert.throws(() => validateContractDocuments(nullA, rawB, rawC, embeddedHandoff), /must be an object/);

    const duplicateA = clone(rawA) as any;
    const withTwoEdges = duplicateA.classes.find((item: any) => item.provenance_edges.length >= 2);
    withTwoEdges.provenance_edges[1].a = clone(withTwoEdges.provenance_edges[0].a);
    withTwoEdges.provenance_edges[1].b = clone(withTwoEdges.provenance_edges[0].b);
    assert.throws(() => validateContractDocuments(duplicateA, rawB, rawC, embeddedHandoff), /Duplicate undirected melody edge/);

    const shortB = clone(rawB) as any;
    shortB.pivots.pop();
    assert.throws(() => validateContractDocuments(rawA, shortB, rawC, embeddedHandoff), /B\.pivots length expected 233/);

    const wrongC = clone(rawC) as any;
    wrongC.checks.source_row_counts.VarhaniciPisne = 342;
    assert.throws(() => validateContractDocuments(rawA, rawB, wrongC, embeddedHandoff), /VarhaniciPisne expected 343/);

    await pool.query("insert into catalog_persons (id, display_name, active, priest, organist) values ($1,'Jaroslav Drobek',true,false,true) on conflict (id) do update set active=true, organist=true", [TARGET]);

    assert.equal(Number((await pool.query("select count(*)::int as count from reference_catalog_songs")).rows[0].count), 1798);
    assert.equal(Number((await pool.query("select count(*)::int as count from reference_melody_classes")).rows[0].count), 1798);
    assert.equal(Number((await pool.query("select count(*)::int as count from reference_song_melody_memberships")).rows[0].count), 1798);
    assert.equal(Number((await pool.query("select count(*)::int as count from reference_organist_repertoire")).rows[0].count), 0);

    const candidateService = new ReferenceCandidateService(pool);
    const beforeCandidates = await candidateService.queryCandidates({ serviceDate: "2026-08-19", serviceLanguage: "mixed", organistPersonId: TARGET, candidateUsages: [] });
    assert.equal(beforeCandidates.length, 0, "Pristine repertoire unexpectedly yielded candidates.");

    const beforeDryKnowledge = await knowledgeFingerprint();
    const beforeUnrelated = await unrelatedFingerprint();
    const dry = runOperator(false);
    assert.equal(dry.status, 0, `Definitive dry-run failed: ${dry.stderr}`);
    assert.match(dry.stdout, /preflight: PASS/);
    assert.match(dry.stdout, /Current state: pristine/);
    assert.match(dry.stdout, /1553 melody classes; 233 explicit pivots; 442 effective playable songs/);
    assert.match(dry.stdout, /Dry-run only/);
    assert.equal(await knowledgeFingerprint(), beforeDryKnowledge, "Dry-run changed melody/repertoire state.");
    assert.equal(await unrelatedFingerprint(), beforeUnrelated, "Dry-run changed unrelated state.");

    const wrongTarget = runOperator(false, {}, "person-not-jaroslav");
    assert.notEqual(wrongTarget.status, 0, "Wrong target person unexpectedly accepted.");
    assert.match(wrongTarget.stderr, /must be exactly 'person-jaroslav-drobek'/);

    const tampered = join(tempRoot, "tampered.zip");
    await copyFile(archivePath!, tampered);
    const tamperedBytes = await readFile(tampered);
    tamperedBytes[Math.floor(tamperedBytes.length / 2)] ^= 1;
    await writeFile(tampered, tamperedBytes);
    const badArchive = runOperator(false, {}, TARGET, tampered);
    assert.notEqual(badArchive.status, 0, "Tampered archive unexpectedly accepted.");
    assert.match(badArchive.stderr, /SHA-256/);

    const beforeInjected = await knowledgeFingerprint();
    const injected = runOperator(true, { ORGANY_PHASE_31_43_TEST_FAIL_AFTER_MELODY: "1" });
    assert.notEqual(injected.status, 0, "Injected post-melody failure unexpectedly succeeded.");
    assert.match(injected.stderr, /Injected Phase 31\.43 failure after melody mutation/);
    assert.equal(await knowledgeFingerprint(), beforeInjected, "Injected failure did not roll back the complete melody/repertoire transaction.");
    assert.equal(await unrelatedFingerprint(), beforeUnrelated, "Injected failure changed unrelated state.");

    const apply = runOperator(true);
    assert.equal(apply.status, 0, `Definitive apply failed: ${apply.stderr}`);
    assert.match(apply.stdout, /apply: PASS; melody classes=1553; explicit pivots=233; effective playable songs=442/);
    await assertAppliedCounts();
    assert.equal(await unrelatedFingerprint(), beforeUnrelated, "Definitive apply changed unrelated state.");

    const candidates = await candidateService.queryCandidates({ serviceDate: "2026-08-19", serviceLanguage: "mixed", organistPersonId: TARGET, candidateUsages: [] });
    assert.equal(candidates.length, 442, "Current class-wide candidate semantics did not produce exactly 442 playable songs.");
    assert.equal(candidates.filter((candidate) => candidate.repertoire).length, 233, "Candidate result did not preserve exactly 233 explicit repertoire pivots.");
    assert.equal(candidates.filter((candidate) => candidate.language === "czech").length, 378, "Effective Czech playable count mismatch.");
    assert.equal(candidates.filter((candidate) => candidate.language === "polish").length, 64, "Effective Polish playable count mismatch.");

    const afterApply = await knowledgeFingerprint();
    const rerun = runOperator(true);
    assert.equal(rerun.status, 0, `Idempotent definitive rerun failed: ${rerun.stderr}`);
    assert.match(rerun.stdout, /already present exactly; no-op/);
    assert.equal(await knowledgeFingerprint(), afterApply, "Idempotent rerun changed definitive state.");

    const nonPivot = refs.find((song) => !resolved.pivotSongIds.has(song.id));
    assert.ok(nonPivot, "Expected a non-pivot Reference song.");
    await pool.query("insert into reference_organist_repertoire (organist_person_id, reference_song_id) values ($1,$2)", [TARGET, nonPivot!.id]);
    const drift = runOperator(false);
    assert.notEqual(drift.status, 0, "Unexpected manual repertoire drift was not rejected.");
    assert.match(drift.stderr, /neither the accepted pristine baseline nor the exact already-applied definitive/);
    await pool.query("delete from reference_organist_repertoire where organist_person_id=$1 and reference_song_id=$2", [TARGET, nonPivot!.id]);
    assert.equal(await knowledgeFingerprint(), afterApply, "Drift cleanup did not restore exact definitive state.");

    assert.equal(Number((await pool.query("select count(*)::int as count from auth_sessions")).rows[0].count), 0);
    assert.equal(Number((await pool.query("select count(*)::int as count from auth_verifications")).rows[0].count), 0);

    console.log("Phase 31.43 definitive melody/repertoire knowledge handoff acceptance: PASS");
  } finally {
    await pool.query("delete from reference_organist_repertoire where organist_person_id=$1", [TARGET]).catch(() => undefined);
    await pool.query("delete from catalog_persons where id=$1", [TARGET]).catch(() => undefined);
    await pool.end();
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Phase 31.43 acceptance failed.");
  process.exitCode = 1;
});
