import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { Pool } from "pg";
import { ReferenceCandidateService } from "../src/application/reference-candidate-service";
import { PgReferenceMelodyRepository, ReferenceMelodyService } from "../src/application/reference-melody";
import {
  normalizeReferenceMelodyEdge,
  readCurrentReferenceMelodyClassMap,
} from "../src/application/reference-melody-edge";
import {
  PHASE_31_43_TARGET_PERSON_ID,
  resolveContractIdentities,
  type ReferenceSongIdentity,
} from "./phase-31-43-contract";
import { readPhase3143DefinitiveArchive } from "./phase-31-43-definitive-reader";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required for Issue 291 DB acceptance.");
const archivePath = process.env.PHASE_31_43_ARCHIVE ? resolve(process.env.PHASE_31_43_ARCHIVE) : undefined;
if (!archivePath) throw new Error("PHASE_31_43_ARCHIVE is required for Issue 291 DB acceptance.");

const TARGET = PHASE_31_43_TARGET_PERSON_ID;
const pool = new Pool({ connectionString: databaseUrl });
const admin = { userId: "stage5-admin", displayName: "Stage 5 Admin", role: "admin" as const };
const priest = { userId: "stage5-priest", displayName: "Stage 5 Priest", role: "priest" as const };

function runScript(script: string, args: string[] = [], extraEnv: Record<string, string> = {}) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawnSync(command, ["tsx", script, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
      ORGANY_REPERTOIRE_PERSON_ID: TARGET,
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

async function count(table: string): Promise<number> {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Unsafe table name.");
  return Number((await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count);
}

async function classCount(): Promise<number> {
  return count("reference_melody_classes");
}

async function classMapJson(): Promise<string> {
  return JSON.stringify([...await readCurrentReferenceMelodyClassMap(pool)]);
}

async function repertoireJson(): Promise<string> {
  const result = await pool.query(
    "select organist_person_id, reference_song_id from reference_organist_repertoire order by organist_person_id, reference_song_id",
  );
  return JSON.stringify(result.rows);
}

async function candidatesJson(): Promise<string> {
  const service = new ReferenceCandidateService(pool);
  const value = await service.queryCandidates({
    serviceDate: "2026-08-19",
    serviceLanguage: "mixed",
    organistPersonId: TARGET,
    candidateUsages: [],
  });
  return JSON.stringify(value);
}

async function referenceSongs(): Promise<ReferenceSongIdentity[]> {
  const result = await pool.query("select id, language, canonical_number from reference_catalog_songs order by language, canonical_number, id");
  return result.rows.map((row) => ({
    id: String(row.id),
    language: row.language as "czech" | "polish",
    canonicalNumber: Number(row.canonical_number),
  }));
}

async function findDifferentClassPair(): Promise<[string, string]> {
  const rows = (await pool.query(
    "select reference_song_id, class_id from reference_song_melody_memberships order by reference_song_id",
  )).rows;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < Math.min(rows.length, i + 80); j += 1) {
      if (String(rows[i].class_id) !== String(rows[j].class_id)) {
        return [String(rows[i].reference_song_id), String(rows[j].reference_song_id)];
      }
    }
  }
  throw new Error("Could not find two Reference songs in different melody classes.");
}

async function main(): Promise<void> {
  const { contract } = await readPhase3143DefinitiveArchive(archivePath!);
  await pool.query(
    "insert into catalog_persons (id, display_name, active, priest, organist) values ($1,'Jaroslav Drobek',true,false,true) on conflict (id) do update set active=true, organist=true",
    [TARGET],
  );

  const handoff = runScript("scripts/production-legacy-repertoire-handoff.ts", ["--archive", archivePath!, "--apply"]);
  assert.equal(handoff.status, 0, `Phase 31.43 setup failed: ${handoff.stderr}`);
  assert.equal(await count("reference_melody_edges"), 0, "Phase 31.43 setup unexpectedly created persistent edges.");
  assert.equal(await classCount(), 1553);
  assert.equal(await count("reference_song_melody_memberships"), 1798);
  assert.equal(await count("reference_organist_repertoire"), 233);

  const refs = await referenceSongs();
  const resolved = resolveContractIdentities(contract, refs);
  assert.equal(await classMapJson(), JSON.stringify([...resolved.expectedClassBySongId]));

  const beforeClassMap = await classMapJson();
  const beforeRepertoire = await repertoireJson();
  const beforeCandidates = await candidatesJson();

  const dry = runScript("scripts/production-reference-melody-edge-backfill.ts", ["--archive", archivePath!]);
  assert.equal(dry.status, 0, `Stage 5 dry-run failed: ${dry.stderr}`);
  assert.match(dry.stdout, /preflight: PASS/);
  assert.match(dry.stdout, /persistent edge state: empty/);
  assert.match(dry.stdout, /planned change inserts exactly 245 edge rows/);
  assert.equal(await count("reference_melody_edges"), 0);
  assert.equal(await classMapJson(), beforeClassMap);
  assert.equal(await repertoireJson(), beforeRepertoire);
  assert.equal(await candidatesJson(), beforeCandidates);

  const injected = runScript(
    "scripts/production-reference-melody-edge-backfill.ts",
    ["--archive", archivePath!, "--apply"],
    { ORGANY_STAGE5_TEST_FAIL_AFTER_EDGE_INSERT: "1" },
  );
  assert.notEqual(injected.status, 0, "Injected Stage 5 backfill failure unexpectedly succeeded.");
  assert.match(injected.stderr, /Injected Stage 5 failure after Reference melody edge insert/);
  assert.equal(await count("reference_melody_edges"), 0, "Injected failure did not roll back edge inserts.");
  assert.equal(await classMapJson(), beforeClassMap);
  assert.equal(await repertoireJson(), beforeRepertoire);

  const apply = runScript("scripts/production-reference-melody-edge-backfill.ts", ["--archive", archivePath!, "--apply"]);
  assert.equal(apply.status, 0, `Stage 5 apply failed: ${apply.stderr}`);
  assert.match(apply.stdout, /edges=245; classes=1553; melody memberships and repertoire unchanged/);
  assert.equal(await count("reference_melody_edges"), 245);
  assert.equal(await classMapJson(), beforeClassMap, "Edge backfill changed melody partition.");
  assert.equal(await repertoireJson(), beforeRepertoire, "Edge backfill changed repertoire.");
  assert.equal(await candidatesJson(), beforeCandidates, "Edge backfill changed candidate results.");

  const rerun = runScript("scripts/production-reference-melody-edge-backfill.ts", ["--archive", archivePath!, "--apply"]);
  assert.equal(rerun.status, 0, `Stage 5 idempotent rerun failed: ${rerun.stderr}`);
  assert.match(rerun.stdout, /already present; no-op/);
  assert.equal(await count("reference_melody_edges"), 245);

  const firstContractEdge = contract.melodyClasses[0].provenanceEdges[0];
  const firstA = resolved.songIdByIdentity.get(`${firstContractEdge.a.language}:${firstContractEdge.a.number}`)!;
  const firstB = resolved.songIdByIdentity.get(`${firstContractEdge.b.language}:${firstContractEdge.b.number}`)!;
  const canonical = normalizeReferenceMelodyEdge(firstA, firstB);

  await assert.rejects(
    () => pool.query("insert into reference_melody_edges(song_a_id,song_b_id) values ($1,$1)", [firstA]),
    /reference_melody_edges_canonical_pair/,
  );
  await assert.rejects(
    () => pool.query("insert into reference_melody_edges(song_a_id,song_b_id) values ($1,$2)", [canonical.songAId, canonical.songBId]),
    /reference_melody_edges_pair_idx|duplicate key/,
  );
  await assert.rejects(
    () => pool.query("insert into reference_melody_edges(song_a_id,song_b_id) values ($1,$2)", [canonical.songBId, canonical.songAId]),
    /reference_melody_edges_canonical_pair/,
  );

  const repo = new PgReferenceMelodyRepository(pool);
  const service = new ReferenceMelodyService(repo);

  const deniedAdd = await service.addEdge(priest as any, firstA, firstB);
  assert.equal(deniedAdd.success, false);
  if (!deniedAdd.success) assert.equal(deniedAdd.error.code, "permissionDenied");

  const duplicateAdd = await service.addEdge(admin as any, firstA, firstB);
  assert.equal(duplicateAdd.success, false);
  if (!duplicateAdd.success) assert.equal(duplicateAdd.error.code, "invalidInput");

  const selfAdd = await service.addEdge(admin as any, firstA, firstA);
  assert.equal(selfAdd.success, false);
  if (!selfAdd.success) assert.equal(selfAdd.error.code, "invalidInput");

  const beforeBridgeRemoval = await classCount();
  const removedBridge = await service.removeEdge(admin as any, firstA, firstB);
  assert.equal(removedBridge.success, true);
  assert.equal(await count("reference_melody_edges"), 244);
  assert.equal(await classCount(), beforeBridgeRemoval + 1, "Removing an authoritative forest edge did not split one component.");
  const restoredBridge = await service.addEdge(admin as any, firstA, firstB);
  assert.equal(restoredBridge.success, true);
  assert.equal(await count("reference_melody_edges"), 245);
  assert.equal(await classCount(), beforeBridgeRemoval);
  assert.equal(await classMapJson(), beforeClassMap, "Removing and restoring an authoritative edge did not restore the exact partition.");

  const [mergeA, mergeB] = await findDifferentClassPair();
  const classCountBeforeMerge = await classCount();
  const edgeCountBeforeMerge = await count("reference_melody_edges");
  const merged = await service.addEdge(admin as any, mergeA, mergeB);
  assert.equal(merged.success, true);
  assert.equal(await classCount(), classCountBeforeMerge - 1, "Adding an inter-component edge did not merge components.");
  assert.equal(await count("reference_melody_edges"), edgeCountBeforeMerge + 1);
  const split = await service.removeEdge(admin as any, mergeA, mergeB);
  assert.equal(split.success, true);
  assert.equal(await classCount(), classCountBeforeMerge, "Removing the added bridge did not split components.");
  assert.equal(await count("reference_melody_edges"), edgeCountBeforeMerge);
  assert.equal(await classMapJson(), beforeClassMap);

  const [failA, failB] = await findDifferentClassPair();
  const beforeInjectedMutationMap = await classMapJson();
  const beforeInjectedMutationEdges = await count("reference_melody_edges");
  const failingRepo = new PgReferenceMelodyRepository(pool, { failAfterMembershipMove: true });
  await assert.rejects(() => failingRepo.addReferenceMelodyEdge(failA, failB, admin as any), /Injected Reference melody recompute failure/);
  assert.equal(await count("reference_melody_edges"), beforeInjectedMutationEdges, "Failed Add did not roll back edge mutation.");
  assert.equal(await classMapJson(), beforeInjectedMutationMap, "Failed Add did not roll back class recompute.");

  const [legacyA, legacyB] = await findDifferentClassPair();
  const legacyBeforeEdges = await count("reference_melody_edges");
  const legacyBeforeClasses = await classCount();
  const legacyMerge = await service.merge(admin as any, legacyA, legacyB);
  assert.equal(legacyMerge.success, true);
  assert.equal(await count("reference_melody_edges"), legacyBeforeEdges + 1, "Legacy merge did not persist an edge.");
  assert.equal(await classCount(), legacyBeforeClasses - 1, "Legacy merge did not recompute the component partition.");
  const legacyCleanup = await service.removeEdge(admin as any, legacyA, legacyB);
  assert.equal(legacyCleanup.success, true);
  assert.equal(await count("reference_melody_edges"), 245);
  assert.equal(await classMapJson(), beforeClassMap);

  assert.equal(await repertoireJson(), beforeRepertoire, "Stage 5 edge mutation acceptance changed explicit repertoire rows.");

  console.log("Issue 291 Stage 5 persistent Reference melody-edge DB acceptance: PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Issue 291 DB acceptance failed.");
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
