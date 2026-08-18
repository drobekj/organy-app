import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required for Phase 31.43 acceptance.");

const TARGET = "phase-31-43-target";
const OTHER = "phase-31-43-other";
const INACTIVE = "phase-31-43-inactive";
const NON_ORGANIST = "phase-31-43-non-organist";
const pool = new Pool({ connectionString: databaseUrl });
let tempRoot = "";

function runHandoff(file: string, target: string, apply = false) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["tsx", "scripts/production-legacy-repertoire-handoff.ts", "--file", file, ...(apply ? ["--apply"] : [])];
  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL_UNPOOLED: databaseUrl, ORGANY_REPERTOIRE_PERSON_ID: target },
    encoding: "utf8",
  });
}

async function fixture(name: string, value: unknown): Promise<string> {
  const path = join(tempRoot, name);
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
  return path;
}

async function invariantFingerprint() {
  const tableNames = [
    "reference_catalog_songs",
    "reference_melody_classes",
    "reference_song_melody_memberships",
    "reference_antiphons",
    "reference_song_preferences",
    "reference_antiphon_recommendations",
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
  for (const tableName of tableNames) {
    const result = await pool.query(`select count(*)::int as count from ${tableName}`);
    counts[tableName] = Number(result.rows[0].count);
  }
  const config = await pool.query("select id, months from melody_non_repetition_config order by id");
  const persons = await pool.query("select id, display_name, active, priest, organist from catalog_persons order by id");
  return JSON.stringify({ counts, config: config.rows, persons: persons.rows });
}

async function repertoireFingerprint() {
  const result = await pool.query(
    "select organist_person_id, reference_song_id, updated_at::text as updated_at from reference_organist_repertoire order by organist_person_id, reference_song_id",
  );
  return JSON.stringify(result.rows);
}

async function main(): Promise<void> {
  tempRoot = await mkdtemp(join(tmpdir(), "organy-phase-31-43-"));
  try {
    const czechQuery = await pool.query(
      "select id, canonical_number from reference_catalog_songs where language='czech' order by canonical_number limit 2",
    );
    const polishQuery = await pool.query(
      "select id, canonical_number from reference_catalog_songs where language='polish' order by canonical_number limit 1",
    );
    assert.equal(czechQuery.rows.length, 2, "Reference baseline must contain at least two Czech songs.");
    assert.equal(polishQuery.rows.length, 1, "Reference baseline must contain at least one Polish song.");

    const czechSongs = czechQuery.rows.map((row) => ({ id: String(row.id), canonical_number: Number(row.canonical_number) }));
    const polishSongs = polishQuery.rows.map((row) => ({ id: String(row.id), canonical_number: Number(row.canonical_number) }));
    const [czechPlayable, czechRecommended] = czechSongs;
    const polishPlayable = polishSongs[0];

    await pool.query(
      `insert into catalog_persons (id, display_name, active, priest, organist) values
        ($1,'Phase 31.43 target',true,false,true),
        ($2,'Phase 31.43 other',true,false,true),
        ($3,'Phase 31.43 inactive',false,false,true),
        ($4,'Phase 31.43 non-organist',true,false,false)`,
      [TARGET, OTHER, INACTIVE, NON_ORGANIST],
    );
    await pool.query(
      "insert into reference_organist_repertoire (organist_person_id, reference_song_id) values ($1,$2)",
      [OTHER, czechRecommended.id],
    );

    const valid = await fixture("valid.json", {
      format: "organy-app-legacy-repertoire-v1",
      sourceDatabase: "VarhanniDoprovody",
      targetPersonId: TARGET,
      sourceOrganist: { legacyId: "synthetic-organist", displayName: "Synthetic acceptance only" },
      rows: [
        { language: "czech", number: String(czechPlayable.canonical_number), state: "připravená", sourceEvidence: "synthetic:czech" },
        { language: "polish", number: String(polishPlayable.canonical_number), state: "hraná", sourceEvidence: "synthetic:polish" },
        { language: "czech", number: String(czechRecommended.canonical_number), state: "doporučená", sourceEvidence: "synthetic:excluded" },
      ],
    });

    const beforeDryInvariant = await invariantFingerprint();
    const beforeDryRepertoire = await repertoireFingerprint();
    const dry = runHandoff(valid, TARGET);
    assert.equal(dry.status, 0, `Valid dry-run failed: ${dry.stderr}`);
    assert.match(dry.stdout, /Legacy repertoire handoff preflight: PASS/);
    assert.match(dry.stdout, /playable: 2; excluded recommended: 1; existing memberships: 0; planned inserts: 2/);
    assert.match(dry.stdout, /Dry-run only; no data was changed/);
    assert.equal(await invariantFingerprint(), beforeDryInvariant, "Dry-run changed invariant database state.");
    assert.equal(await repertoireFingerprint(), beforeDryRepertoire, "Dry-run changed repertoire state.");

    for (const badTarget of [INACTIVE, NON_ORGANIST]) {
      const badTargetFile = await fixture(`${badTarget}.json`, {
        format: "organy-app-legacy-repertoire-v1",
        sourceDatabase: "VarhanniDoprovody",
        targetPersonId: badTarget,
        rows: [{ language: "czech", number: String(czechPlayable.canonical_number), state: "připravená" }],
      });
      const result = runHandoff(badTargetFile, badTarget, true);
      assert.notEqual(result.status, 0, `${badTarget} unexpectedly accepted.`);
      assert.match(result.stderr, /is not an active organist/);
    }

    const conflicting = await fixture("conflicting.json", {
      format: "organy-app-legacy-repertoire-v1",
      sourceDatabase: "VarhanniDoprovody",
      targetPersonId: TARGET,
      rows: [
        { language: "czech", number: String(czechPlayable.canonical_number), state: "připravená" },
        { language: "czech", number: String(czechPlayable.canonical_number), state: "hraná" },
      ],
    });
    const conflictingResult = runHandoff(conflicting, TARGET, true);
    assert.notEqual(conflictingResult.status, 0, "Conflicting duplicate states unexpectedly accepted.");
    assert.match(conflictingResult.stderr, /Conflicting legacy states/);

    const unknown = await fixture("unknown.json", {
      format: "organy-app-legacy-repertoire-v1",
      sourceDatabase: "VarhanniDoprovody",
      targetPersonId: TARGET,
      rows: [
        { language: "czech", number: String(czechPlayable.canonical_number), state: "připravená" },
        { language: "polish", number: "2147483647", state: "hraná" },
      ],
    });
    const beforeUnknownInvariant = await invariantFingerprint();
    const beforeUnknownRepertoire = await repertoireFingerprint();
    const unknownResult = runHandoff(unknown, TARGET, true);
    assert.notEqual(unknownResult.status, 0, "Unknown Reference song unexpectedly accepted.");
    assert.match(unknownResult.stderr, /Reference song not found/);
    assert.equal(await invariantFingerprint(), beforeUnknownInvariant, "Failed apply changed invariant state.");
    assert.equal(await repertoireFingerprint(), beforeUnknownRepertoire, "Failed apply partially changed repertoire.");

    const wrongSource = await fixture("wrong-source.json", {
      format: "organy-app-legacy-repertoire-v1",
      sourceDatabase: "NotTheLegacyDatabase",
      targetPersonId: TARGET,
      rows: [{ language: "czech", number: String(czechPlayable.canonical_number), state: "připravená" }],
    });
    const wrongSourceResult = runHandoff(wrongSource, TARGET);
    assert.notEqual(wrongSourceResult.status, 0, "Wrong source database unexpectedly accepted.");
    assert.match(wrongSourceResult.stderr, /Unexpected sourceDatabase/);

    const beforeApplyInvariant = await invariantFingerprint();
    const apply = runHandoff(valid, TARGET, true);
    assert.equal(apply.status, 0, `Valid apply failed: ${apply.stderr}`);
    assert.match(apply.stdout, /Legacy repertoire handoff apply: PASS; inserted: 2; already present: 0; excluded recommended: 1/);
    assert.equal(await invariantFingerprint(), beforeApplyInvariant, "Valid apply changed non-repertoire invariant state.");

    const targetMemberships = await pool.query(
      "select reference_song_id from reference_organist_repertoire where organist_person_id=$1 order by reference_song_id",
      [TARGET],
    );
    assert.deepEqual(
      targetMemberships.rows.map((row) => String(row.reference_song_id)).sort(),
      [czechPlayable.id, polishPlayable.id].sort(),
      "Apply did not create exactly the playable Czech and Polish memberships.",
    );
    assert.equal(
      Number((await pool.query("select count(*)::int as count from reference_organist_repertoire where organist_person_id=$1 and reference_song_id=$2", [TARGET, czechRecommended.id])).rows[0].count),
      0,
      "Recommended legacy state leaked into repertoire.",
    );
    assert.equal(
      Number((await pool.query("select count(*)::int as count from reference_organist_repertoire where organist_person_id=$1 and reference_song_id=$2", [OTHER, czechRecommended.id])).rows[0].count),
      1,
      "Existing unrelated organist repertoire was changed.",
    );

    const afterApplyRepertoire = await repertoireFingerprint();
    const rerun = runHandoff(valid, TARGET, true);
    assert.equal(rerun.status, 0, `Idempotent rerun failed: ${rerun.stderr}`);
    assert.match(rerun.stdout, /inserted: 0; already present: 2; excluded recommended: 1/);
    assert.equal(await repertoireFingerprint(), afterApplyRepertoire, "Idempotent rerun changed repertoire fingerprint.");

    assert.equal(Number((await pool.query("select count(*)::int as count from auth_sessions")).rows[0].count), 0, "Acceptance unexpectedly created auth sessions.");
    assert.equal(Number((await pool.query("select count(*)::int as count from auth_verifications")).rows[0].count), 0, "Acceptance unexpectedly created auth verifications.");

    console.log("Phase 31.43 legacy repertoire handoff acceptance: PASS");
  } finally {
    await pool.query("delete from reference_organist_repertoire where organist_person_id = any($1::text[])", [[TARGET, OTHER, INACTIVE, NON_ORGANIST]]).catch(() => undefined);
    await pool.query("delete from catalog_persons where id = any($1::text[])", [[TARGET, OTHER, INACTIVE, NON_ORGANIST]]).catch(() => undefined);
    await pool.end();
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Phase 31.43 acceptance failed.");
  process.exitCode = 1;
});
