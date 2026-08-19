import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  PHASE_31_43_TARGET_PERSON_ID,
  readDefinitiveArchive,
  resolveContractIdentities,
  type DefinitiveContract,
  type ReferenceSongIdentity,
  type ResolvedContract,
} from "./phase-31-43-contract";

type CliOptions = { archivePath: string; apply: boolean };
type KnowledgeState = "pristine" | "applied";

type DbSnapshot = {
  state: KnowledgeState;
  resolved: ResolvedContract;
  referenceSongs: ReferenceSongIdentity[];
  classCount: number;
  membershipCount: number;
  repertoireCount: number;
};

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
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") fail("DATABASE_URL_UNPOOLED must use postgres:// or postgresql://.");
  if (parsed.hostname.toLowerCase().includes("-pooler.")) fail("DATABASE_URL_UNPOOLED must be a direct/unpooled PostgreSQL endpoint.");
  return raw;
}

function validateTarget(raw: string | undefined): string {
  if (!raw || raw.trim() === "") fail("ORGANY_REPERTOIRE_PERSON_ID is required.");
  if (raw !== PHASE_31_43_TARGET_PERSON_ID) fail(`ORGANY_REPERTOIRE_PERSON_ID must be exactly '${PHASE_31_43_TARGET_PERSON_ID}'.`);
  return raw;
}

async function inspectDatabase(client: PoolClient, contract: DefinitiveContract, targetPersonId: string): Promise<DbSnapshot> {
  const person = await client.query("select id, active, organist from catalog_persons where id=$1", [targetPersonId]);
  if (person.rows.length !== 1) fail(`Target Person '${targetPersonId}' was not found.`);
  if (!Boolean(person.rows[0].active) || !Boolean(person.rows[0].organist)) fail(`Target Person '${targetPersonId}' is not an active organist.`);

  const songResult = await client.query("select id, language, canonical_number from reference_catalog_songs order by language, canonical_number, id");
  const referenceSongs: ReferenceSongIdentity[] = songResult.rows.map((row) => ({
    id: String(row.id),
    language: row.language as "czech" | "polish",
    canonicalNumber: Number(row.canonical_number),
  }));
  const resolved = resolveContractIdentities(contract, referenceSongs);

  const membershipResult = await client.query("select reference_song_id, class_id from reference_song_melody_memberships order by reference_song_id");
  if (membershipResult.rows.length !== 1798) fail(`Unexpected melody membership count ${membershipResult.rows.length}; expected 1798.`);
  const currentClassBySong = new Map<string, string>();
  for (const row of membershipResult.rows) {
    const songId = String(row.reference_song_id);
    if (currentClassBySong.has(songId)) fail(`Duplicate melody membership for ${songId}.`);
    currentClassBySong.set(songId, String(row.class_id));
  }
  if (currentClassBySong.size !== 1798) fail("Not every Reference song has exactly one melody membership.");

  const classResult = await client.query("select id from reference_melody_classes order by id");
  const currentClasses = new Set(classResult.rows.map((row) => String(row.id)));
  if (currentClasses.size !== classResult.rows.length) fail("Duplicate melody class id detected.");
  const referencedClasses = new Set(currentClassBySong.values());
  if (referencedClasses.size !== currentClasses.size || [...currentClasses].some((id) => !referencedClasses.has(id))) fail("Empty/orphan or missing melody class detected.");

  const repertoireResult = await client.query("select organist_person_id, reference_song_id from reference_organist_repertoire order by organist_person_id, reference_song_id");
  const repertoireKeys = repertoireResult.rows.map((row) => `${String(row.organist_person_id)}|${String(row.reference_song_id)}`);

  const pristineClasses = classResult.rows.length === 1798 && referenceSongs.every((song) => currentClassBySong.get(song.id) === `reference-melody:${song.id}`);
  const pristineRepertoire = repertoireResult.rows.length === 0;
  if (pristineClasses && pristineRepertoire) {
    return { state: "pristine", resolved, referenceSongs, classCount: classResult.rows.length, membershipCount: membershipResult.rows.length, repertoireCount: 0 };
  }

  const expectedClassIds = new Set(resolved.expectedClassBySongId.values());
  const appliedClasses = classResult.rows.length === 1553
    && expectedClassIds.size === 1553
    && [...expectedClassIds].every((id) => currentClasses.has(id))
    && referenceSongs.every((song) => currentClassBySong.get(song.id) === resolved.expectedClassBySongId.get(song.id));
  const expectedRepertoireKeys = new Set([...resolved.pivotSongIds].map((songId) => `${targetPersonId}|${songId}`));
  const appliedRepertoire = repertoireKeys.length === 233
    && expectedRepertoireKeys.size === 233
    && repertoireKeys.every((key) => expectedRepertoireKeys.has(key));
  if (appliedClasses && appliedRepertoire) {
    return { state: "applied", resolved, referenceSongs, classCount: classResult.rows.length, membershipCount: membershipResult.rows.length, repertoireCount: repertoireResult.rows.length };
  }

  fail("Production knowledge state is neither the accepted pristine baseline nor the exact already-applied definitive Phase 31.43 state. STOP for review.");
}

async function applyDefinitiveKnowledge(client: PoolClient, contract: DefinitiveContract, snapshot: DbSnapshot, targetPersonId: string): Promise<void> {
  for (const melodyClass of contract.melodyClasses) {
    const memberSongIds = melodyClass.members.map((member) => snapshot.resolved.songIdByIdentity.get(`${member.language}:${member.number}`)!);
    const anchorClassId = snapshot.resolved.expectedClassBySongId.get(memberSongIds[0])!;
    const movingSongIds = memberSongIds.filter((songId) => `reference-melody:${songId}` !== anchorClassId);
    if (movingSongIds.length > 0) {
      const moved = await client.query(
        "update reference_song_melody_memberships set class_id=$1, updated_at=now() where reference_song_id=any($2::text[]) returning reference_song_id",
        [anchorClassId, movingSongIds],
      );
      if (moved.rows.length !== movingSongIds.length) fail(`Failed to move every member of definitive melody class ${melodyClass.classId}.`);
      const oldClassIds = movingSongIds.map((songId) => `reference-melody:${songId}`);
      const deleted = await client.query("delete from reference_melody_classes where id=any($1::text[]) returning id", [oldClassIds]);
      if (deleted.rows.length !== oldClassIds.length) fail(`Failed to remove every obsolete singleton class for ${melodyClass.classId}.`);
    }
  }

  if (process.env.ORGANY_PHASE_31_43_TEST_FAIL_AFTER_MELODY === "1") throw new Error("Injected Phase 31.43 failure after melody mutation.");

  const pivotSongIds = [...snapshot.resolved.pivotSongIds].sort();
  const inserted = await client.query(
    "insert into reference_organist_repertoire (organist_person_id, reference_song_id, updated_at) select $1, song_id, now() from unnest($2::text[]) as song_id on conflict (organist_person_id, reference_song_id) do nothing returning reference_song_id",
    [targetPersonId, pivotSongIds],
  );
  if (inserted.rows.length !== 233) fail(`Expected 233 repertoire pivot inserts, got ${inserted.rows.length}.`);
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const targetPersonId = validateTarget(process.env.ORGANY_REPERTOIRE_PERSON_ID);
  const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL_UNPOOLED);
  const { contract } = await readDefinitiveArchive(options.archivePath);

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query(options.apply ? "begin" : "begin transaction isolation level repeatable read read only");
    transactionOpen = true;
    if (options.apply) await client.query("select pg_advisory_xact_lock(hashtext('phase-31-43-definitive-knowledge-handoff'))");
    const snapshot = await inspectDatabase(client, contract, targetPersonId);

    console.log("Phase 31.43 definitive knowledge handoff preflight: PASS");
    console.log(`Target Person: ${targetPersonId}`);
    console.log(`Current state: ${snapshot.state}; Reference songs: 1798; melody memberships: ${snapshot.membershipCount}; melody classes: ${snapshot.classCount}; repertoire pivots: ${snapshot.repertoireCount}.`);
    console.log("Definitive target: 103 non-singleton classes; 1450 singleton classes; 1553 melody classes; 233 explicit pivots; 442 effective playable songs.");

    if (!options.apply) {
      await client.query("rollback");
      transactionOpen = false;
      console.log(snapshot.state === "pristine"
        ? "Dry-run only; planned atomic change is 245 melody-class reductions plus 233 repertoire pivots; no data was changed."
        : "Dry-run only; definitive state is already applied exactly; no data was changed.");
      return;
    }

    if (snapshot.state === "applied") {
      await client.query("rollback");
      transactionOpen = false;
      console.log("Phase 31.43 apply: PASS; definitive state was already present exactly; no-op.");
      return;
    }

    await applyDefinitiveKnowledge(client, contract, snapshot, targetPersonId);
    const after = await inspectDatabase(client, contract, targetPersonId);
    if (after.state !== "applied") fail("Post-apply state did not match the definitive contract.");
    await client.query("commit");
    transactionOpen = false;
    console.log("Phase 31.43 apply: PASS; melody classes=1553; explicit pivots=233; effective playable songs=442.");
  } catch (error) {
    if (transactionOpen) await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Phase 31.43 definitive knowledge handoff failed.");
  process.exitCode = 1;
});
