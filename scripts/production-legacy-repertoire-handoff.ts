import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

const FORMAT = "organy-app-legacy-repertoire-v1";
const SOURCE_DATABASE = "VarhanniDoprovody";
const PLAYABLE_STATES = new Set(["připravená", "hraná"] as const);
const ALL_STATES = new Set(["připravená", "hraná", "doporučená"] as const);
const LANGUAGES = new Set(["czech", "polish"] as const);
const MAX_POSTGRES_INTEGER = 2_147_483_647;

type Language = "czech" | "polish";
type LegacyState = "připravená" | "hraná" | "doporučená";
type HandoffRow = {
  language: Language;
  number: string;
  state: LegacyState;
  sourceEvidence?: string;
};
type Handoff = {
  format: typeof FORMAT;
  sourceDatabase: typeof SOURCE_DATABASE;
  targetPersonId: string;
  sourceOrganist?: { legacyId?: string; displayName?: string };
  rows: HandoffRow[];
};
type PlannedMembership = HandoffRow & { canonicalNumber: number; referenceSongId: string; exists: boolean };

type CliOptions = { filePath: string; apply: boolean };

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: string[], context: string): void {
  const extras = Object.keys(record).filter((key) => !allowed.includes(key));
  if (extras.length > 0) fail(`${context} contains unsupported field(s): ${extras.join(", ")}.`);
}

function parseCli(argv: string[]): CliOptions {
  let filePath: string | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      if (apply) fail("--apply may be supplied only once.");
      apply = true;
      continue;
    }
    if (arg === "--file") {
      if (filePath) fail("--file may be supplied only once.");
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith("--")) fail("--file requires a local JSON path.");
      filePath = candidate;
      index += 1;
      continue;
    }
    fail(`Unsupported argument '${arg}'.`);
  }
  if (!filePath) fail("A local handoff file is required via --file <path>.");
  return { filePath: resolve(filePath), apply };
}

function parseHandoff(value: unknown, expectedTargetPersonId: string): Handoff {
  if (!isRecord(value)) fail("Handoff root must be a JSON object.");
  assertOnlyKeys(value, ["format", "sourceDatabase", "targetPersonId", "sourceOrganist", "rows"], "Handoff root");
  if (value.format !== FORMAT) fail(`Unsupported handoff format. Expected '${FORMAT}'.`);
  if (value.sourceDatabase !== SOURCE_DATABASE) fail(`Unexpected sourceDatabase. Expected '${SOURCE_DATABASE}'.`);
  if (typeof value.targetPersonId !== "string" || value.targetPersonId.trim() === "") fail("targetPersonId must be a non-empty string.");
  if (value.targetPersonId !== expectedTargetPersonId) fail("Handoff targetPersonId does not match explicit ORGANY_REPERTOIRE_PERSON_ID.");

  let sourceOrganist: Handoff["sourceOrganist"];
  if (value.sourceOrganist !== undefined) {
    if (!isRecord(value.sourceOrganist)) fail("sourceOrganist must be an object when supplied.");
    assertOnlyKeys(value.sourceOrganist, ["legacyId", "displayName"], "sourceOrganist");
    for (const key of ["legacyId", "displayName"] as const) {
      const field = value.sourceOrganist[key];
      if (field !== undefined && (typeof field !== "string" || field.trim() === "")) fail(`sourceOrganist.${key} must be a non-empty string when supplied.`);
    }
    sourceOrganist = {
      ...(typeof value.sourceOrganist.legacyId === "string" ? { legacyId: value.sourceOrganist.legacyId } : {}),
      ...(typeof value.sourceOrganist.displayName === "string" ? { displayName: value.sourceOrganist.displayName } : {}),
    };
  }

  if (!Array.isArray(value.rows) || value.rows.length === 0) fail("rows must be a non-empty array.");
  const rows: HandoffRow[] = [];
  const stateByCanonicalKey = new Map<string, LegacyState>();
  const seenExact = new Set<string>();

  value.rows.forEach((rawRow, index) => {
    if (!isRecord(rawRow)) fail(`rows[${index}] must be an object.`);
    assertOnlyKeys(rawRow, ["language", "number", "state", "sourceEvidence"], `rows[${index}]`);
    if (typeof rawRow.language !== "string" || !LANGUAGES.has(rawRow.language as Language)) fail(`rows[${index}].language must be 'czech' or 'polish'.`);
    if (typeof rawRow.number !== "string" || !/^[1-9]\d*$/.test(rawRow.number)) fail(`rows[${index}].number must be a positive canonical digit string without leading zeroes.`);
    const canonicalNumber = Number(rawRow.number);
    if (!Number.isSafeInteger(canonicalNumber) || canonicalNumber > MAX_POSTGRES_INTEGER) fail(`rows[${index}].number exceeds PostgreSQL integer range.`);
    if (typeof rawRow.state !== "string" || !ALL_STATES.has(rawRow.state as LegacyState)) fail(`rows[${index}].state is unsupported.`);
    if (rawRow.sourceEvidence !== undefined && (typeof rawRow.sourceEvidence !== "string" || rawRow.sourceEvidence.trim() === "")) fail(`rows[${index}].sourceEvidence must be a non-empty string when supplied.`);

    const language = rawRow.language as Language;
    const state = rawRow.state as LegacyState;
    const canonicalKey = `${language}:${rawRow.number}`;
    const previousState = stateByCanonicalKey.get(canonicalKey);
    if (previousState !== undefined && previousState !== state) fail(`Conflicting legacy states for canonical song ${canonicalKey}.`);
    stateByCanonicalKey.set(canonicalKey, state);

    const exactKey = `${canonicalKey}:${state}`;
    if (seenExact.has(exactKey)) return;
    seenExact.add(exactKey);
    rows.push({
      language,
      number: rawRow.number,
      state,
      ...(typeof rawRow.sourceEvidence === "string" ? { sourceEvidence: rawRow.sourceEvidence } : {}),
    });
  });

  return {
    format: FORMAT,
    sourceDatabase: SOURCE_DATABASE,
    targetPersonId: value.targetPersonId,
    ...(sourceOrganist ? { sourceOrganist } : {}),
    rows,
  };
}

function validateDatabaseUrl(raw: string | undefined): string {
  if (!raw) fail("DATABASE_URL_UNPOOLED is required.");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail("DATABASE_URL_UNPOOLED is not a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") fail("DATABASE_URL_UNPOOLED must use postgres:// or postgresql://.");
  if (parsed.hostname.toLowerCase().includes("-pooler.")) fail("DATABASE_URL_UNPOOLED must be a direct/unpooled PostgreSQL endpoint.");
  return raw;
}

async function buildPlan(client: PoolClient, handoff: Handoff): Promise<{ playable: PlannedMembership[]; excludedRecommended: number }> {
  const person = await client.query<{ id: string; active: boolean; organist: boolean }>(
    "select id, active, organist from catalog_persons where id = $1",
    [handoff.targetPersonId],
  );
  if (person.rowCount !== 1) fail(`Target Person '${handoff.targetPersonId}' was not found.`);
  if (!person.rows[0].active || !person.rows[0].organist) fail(`Target Person '${handoff.targetPersonId}' is not an active organist.`);

  const playableRows = handoff.rows.filter((row) => PLAYABLE_STATES.has(row.state as "připravená" | "hraná"));
  const playable: PlannedMembership[] = [];
  for (const row of playableRows) {
    const canonicalNumber = Number(row.number);
    const song = await client.query<{ id: string }>(
      "select id from reference_catalog_songs where language = $1 and canonical_number = $2",
      [row.language, canonicalNumber],
    );
    if (song.rowCount !== 1) fail(`Reference song not found for canonical identity ${row.language}:${row.number}.`);
    const referenceSongId = song.rows[0].id;
    const membership = await client.query(
      "select 1 from reference_organist_repertoire where organist_person_id = $1 and reference_song_id = $2",
      [handoff.targetPersonId, referenceSongId],
    );
    playable.push({ ...row, canonicalNumber, referenceSongId, exists: membership.rowCount === 1 });
  }

  return { playable, excludedRecommended: handoff.rows.filter((row) => row.state === "doporučená").length };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL_UNPOOLED);
  const expectedTarget = process.env.ORGANY_REPERTOIRE_PERSON_ID;
  if (!expectedTarget || expectedTarget.trim() === "") fail("ORGANY_REPERTOIRE_PERSON_ID is required and must be explicit.");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await readFile(options.filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail("Handoff file is not valid JSON.");
    throw error;
  }
  const handoff = parseHandoff(parsedJson, expectedTarget);

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query(options.apply ? "begin" : "begin transaction read only");
    transactionOpen = true;
    const plan = await buildPlan(client, handoff);
    const existing = plan.playable.filter((row) => row.exists).length;
    const pending = plan.playable.filter((row) => !row.exists);

    console.log("Legacy repertoire handoff preflight: PASS");
    console.log(`Target Person: ${handoff.targetPersonId}`);
    console.log(`Rows: ${handoff.rows.length}; playable: ${plan.playable.length}; excluded recommended: ${plan.excludedRecommended}; existing memberships: ${existing}; planned inserts: ${pending.length}.`);

    if (!options.apply) {
      await client.query("rollback");
      transactionOpen = false;
      console.log("Dry-run only; no data was changed.");
      return;
    }

    let inserted = 0;
    for (const row of pending) {
      const result = await client.query(
        "insert into reference_organist_repertoire (organist_person_id, reference_song_id, updated_at) values ($1, $2, now()) on conflict (organist_person_id, reference_song_id) do nothing",
        [handoff.targetPersonId, row.referenceSongId],
      );
      inserted += result.rowCount ?? 0;
    }
    await client.query("commit");
    transactionOpen = false;
    console.log(`Legacy repertoire handoff apply: PASS; inserted: ${inserted}; already present: ${existing}; excluded recommended: ${plan.excludedRecommended}.`);
  } catch (error) {
    if (transactionOpen) await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy repertoire handoff failed.");
  process.exitCode = 1;
});
