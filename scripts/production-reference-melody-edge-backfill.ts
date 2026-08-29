import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  resolveContractIdentities,
  type DefinitiveContract,
  type ReferenceSongIdentity,
} from "./phase-31-43-contract";
import { readPhase3143DefinitiveArchive } from "./phase-31-43-definitive-reader";
import { validateDefinitiveMelodyForest } from "./phase-31-43-graph-check";
import {
  assertReferenceMelodyStorageInvariant,
  assertSameReferenceMelodyPartition,
  deriveReferenceMelodyPartition,
  normalizeReferenceMelodyEdge,
  type ReferenceMelodyEdge,
  type ReferenceMelodyGraphSong,
} from "../src/application/reference-melody-edge";

type CliOptions = { archivePath: string; apply: boolean };
type EdgeState = "empty" | "exact";

function fail(message: string): never { throw new Error(message); }

function parseCli(argv: string[]): CliOptions {
  let archivePath: string | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      if (apply) fail("--apply may be supplied only once.");
      apply = true;
      continue;
    }
    if (arg === "--archive") {
      if (archivePath) fail("--archive may be supplied only once.");
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith("--")) fail("--archive requires the definitive ZIP path.");
      archivePath = candidate;
      index += 1;
      continue;
    }
    fail(`Unsupported argument '${arg}'.`);
  }
  if (!archivePath) fail("The definitive Phase 31.43 ZIP is required via --archive <path>.");
  return { archivePath: resolve(archivePath), apply };
}

function validateDatabaseUrl(raw: string | undefined): string {
  if (!raw) fail("DATABASE_URL_UNPOOLED is required.");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { fail("DATABASE_URL_UNPOOLED is not a valid PostgreSQL URL."); }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail("DATABASE_URL_UNPOOLED must use postgres:// or postgresql://.");
  }
  if (parsed.hostname.toLowerCase().includes("-pooler.")) {
    fail("DATABASE_URL_UNPOOLED must be a direct/unpooled PostgreSQL endpoint.");
  }
  return raw;
}

function referenceSongsFromRows(rows: any[]): ReferenceSongIdentity[] {
  return rows.map((row) => ({
    id: String(row.id),
    language: row.language as "czech" | "polish",
    canonicalNumber: Number(row.canonical_number),
  }));
}

function authoritativeEdges(contract: DefinitiveContract, songIdByIdentity: Map<string, string>): ReferenceMelodyEdge[] {
  const edges = contract.melodyClasses.flatMap((melodyClass) => melodyClass.provenanceEdges.map((edge) => {
    const a = songIdByIdentity.get(`${edge.a.language}:${edge.a.number}`);
    const b = songIdByIdentity.get(`${edge.b.language}:${edge.b.number}`);
    if (!a || !b) fail("Definitive melody edge identity did not resolve.");
    return normalizeReferenceMelodyEdge(a, b);
  }));
  const keys = new Set(edges.map((edge) => `${edge.songAId}<->${edge.songBId}`));
  if (edges.length !== 245 || keys.size !== 245) fail("Definitive Reference melody edge set must contain exactly 245 unique edges.");
  return edges.sort((a, b) => a.songAId.localeCompare(b.songAId) || a.songBId.localeCompare(b.songBId));
}

function sameEdges(actual: ReferenceMelodyEdge[], expected: ReferenceMelodyEdge[]): boolean {
  if (actual.length !== expected.length) return false;
  const keys = new Set(expected.map((edge) => `${edge.songAId}<->${edge.songBId}`));
  return actual.every((edge) => keys.has(`${edge.songAId}<->${edge.songBId}`));
}

async function currentEdges(client: Pick<PoolClient, "query">): Promise<ReferenceMelodyEdge[]> {
  const result = await client.query("select song_a_id, song_b_id from reference_melody_edges order by song_a_id, song_b_id");
  return result.rows.map((row) => ({ songAId: String(row.song_a_id), songBId: String(row.song_b_id) }));
}

async function repertoireFingerprint(client: Pick<PoolClient, "query">): Promise<string> {
  const result = await client.query(
    "select organist_person_id, reference_song_id, updated_at::text from reference_organist_repertoire order by organist_person_id, reference_song_id",
  );
  return JSON.stringify(result.rows);
}

async function classFingerprint(client: Pick<PoolClient, "query">): Promise<string> {
  const [classes, memberships] = await Promise.all([
    client.query("select id, created_at::text, updated_at::text from reference_melody_classes order by id"),
    client.query("select reference_song_id, class_id, updated_at::text from reference_song_melody_memberships order by reference_song_id"),
  ]);
  return JSON.stringify({ classes: classes.rows, memberships: memberships.rows });
}

async function inspect(
  client: PoolClient,
  contract: DefinitiveContract,
): Promise<{ edgeState: EdgeState; edges: ReferenceMelodyEdge[]; classCount: number; repertoireFingerprint: string; classFingerprint: string }> {
  const songResult = await client.query(
    "select id, language, canonical_number from reference_catalog_songs order by language, canonical_number, id",
  );
  const referenceSongs = referenceSongsFromRows(songResult.rows);
  const resolved = resolveContractIdentities(contract, referenceSongs);
  const songs: ReferenceMelodyGraphSong[] = referenceSongs.map((song) => ({
    id: song.id,
    language: song.language,
    canonicalNumber: song.canonicalNumber,
  }));
  const expectedEdges = authoritativeEdges(contract, resolved.songIdByIdentity);
  const derived = deriveReferenceMelodyPartition(songs, expectedEdges);
  assertSameReferenceMelodyPartition(
    derived.classBySongId,
    resolved.expectedClassBySongId,
    "Definitive edge-derived Reference melody partition",
  );

  const currentPartition = await assertReferenceMelodyStorageInvariant(client, songs);
  assertSameReferenceMelodyPartition(
    currentPartition,
    resolved.expectedClassBySongId,
    "Current persisted Reference melody partition",
  );

  const edges = await currentEdges(client);
  const edgeState: EdgeState = edges.length === 0
    ? "empty"
    : sameEdges(edges, expectedEdges)
      ? "exact"
      : fail("Persistent Reference melody edges are neither empty nor the exact authoritative 245-edge set. STOP for review.");

  return {
    edgeState,
    edges: expectedEdges,
    classCount: new Set(currentPartition.values()).size,
    repertoireFingerprint: await repertoireFingerprint(client),
    classFingerprint: await classFingerprint(client),
  };
}

async function insertEdges(client: Pick<PoolClient, "query">, edges: ReferenceMelodyEdge[]): Promise<void> {
  for (let start = 0; start < edges.length; start += 200) {
    const chunk = edges.slice(start, start + 200);
    const values: string[] = [];
    const tuples: string[] = [];
    for (const edge of chunk) {
      const offset = values.length;
      values.push(edge.songAId, edge.songBId);
      tuples.push(`($${offset + 1}, $${offset + 2})`);
    }
    const result = await client.query(
      `insert into reference_melody_edges(song_a_id,song_b_id) values ${tuples.join(",")} returning song_a_id`,
      values,
    );
    if (result.rows.length !== chunk.length) fail("Not every authoritative Reference melody edge was inserted.");
  }
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL_UNPOOLED);
  const { contract } = await readPhase3143DefinitiveArchive(options.archivePath);
  validateDefinitiveMelodyForest(contract);

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query(options.apply ? "begin" : "begin transaction isolation level repeatable read read only");
    transactionOpen = true;
    if (options.apply) await client.query("select pg_advisory_xact_lock(hashtext('stage5-reference-melody-edge-backfill'))");

    const before = await inspect(client, contract);
    if (before.classCount !== 1553) fail(`Current authoritative melody partition has ${before.classCount} classes; expected 1553.`);

    console.log("Stage 5 Reference melody edge backfill preflight: PASS");
    console.log(`Current classes: 1553; authoritative edges: 245; persistent edge state: ${before.edgeState}.`);
    console.log("Current class membership exactly matches the connected components derived from the frozen Phase 31.43 edge contract.");
    console.log("Reference repertoire is fingerprinted and must remain byte-for-byte unchanged.");

    if (!options.apply) {
      await client.query("rollback");
      transactionOpen = false;
      console.log(before.edgeState === "empty"
        ? "Dry-run only; planned change inserts exactly 245 edge rows and changes no classes, memberships, repertoire, candidates, or unrelated data."
        : "Dry-run only; exact authoritative edge set is already present; no data was changed.");
      return;
    }

    if (before.edgeState === "exact") {
      await client.query("rollback");
      transactionOpen = false;
      console.log("Stage 5 Reference melody edge backfill: PASS; exact authoritative edge set already present; no-op.");
      return;
    }

    await insertEdges(client, before.edges);
    if (process.env.ORGANY_STAGE5_TEST_FAIL_AFTER_EDGE_INSERT === "1") {
      throw new Error("Injected Stage 5 failure after Reference melody edge insert.");
    }

    const after = await inspect(client, contract);
    if (after.edgeState !== "exact") fail("Post-backfill edge state did not match the authoritative contract.");
    if (after.classFingerprint !== before.classFingerprint) fail("Stage 5 edge backfill changed Reference melody classes or memberships.");
    if (after.repertoireFingerprint !== before.repertoireFingerprint) fail("Stage 5 edge backfill changed Reference repertoire.");

    await client.query("commit");
    transactionOpen = false;
    console.log("Stage 5 Reference melody edge backfill: PASS; edges=245; classes=1553; melody memberships and repertoire unchanged.");
  } catch (error) {
    if (transactionOpen) await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stage 5 Reference melody edge backfill failed.");
  process.exitCode = 1;
});
