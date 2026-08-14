import assert from "node:assert/strict";
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";

const sourceUrlText = process.env.DATABASE_URL;
if (!sourceUrlText) throw new Error("DATABASE_URL is required for Phase 31.33 acceptance.");

const sourceUrl = new URL(sourceUrlText);
const targetName = `organy_phase3133_restore_${process.pid}_${Date.now()}`;
const targetUrl = withDatabase(sourceUrl, targetName);
const adminUrl = withDatabase(sourceUrl, "postgres");
const backupFile = resolve(".organy-backups", `phase-31-33-${process.pid}.dump`);
const corruptFile = resolve(".organy-backups", `phase-31-33-${process.pid}-corrupt.dump`);
const missingFile = resolve(".organy-backups", `phase-31-33-${process.pid}-missing.dump`);
const secretPassword = decodeURIComponent(sourceUrl.password || "");

async function main() {
  await mkdir(dirname(backupFile), { recursive: true });
  await cleanupFiles();
  await createTargetDatabase();

  try {
    await insertRepresentativeSourceData();
    const sourceBefore = await sourceSnapshot();

    const unsafeLocalPath = run("scripts/postgres-backup.ts", {
      ORGANY_BACKUP_FILE: "phase-31-33-unsafe.dump",
      ORGANY_PG_TOOL_MODE: "path",
    });
    assert.notEqual(unsafeLocalPath.status, 0);
    assert.match(unsafeLocalPath.stderr, /must be inside \.organy-backups/i);
    assertRedacted(unsafeLocalPath.stdout + unsafeLocalPath.stderr);

    const backup = run("scripts/postgres-backup.ts", {
      ORGANY_BACKUP_FILE: backupFile,
      ORGANY_PG_TOOL_MODE: "path",
    });
    assert.equal(backup.status, 0, backup.stderr);
    assert.match(backup.stdout, /logical backup: PASS/);
    assertRedacted(backup.stdout + backup.stderr);

    const sourceAfterBackup = await sourceSnapshot();
    assert.deepEqual(sourceAfterBackup, sourceBefore, "Backup must not mutate source rows or sessions.");

    const verify = run("scripts/postgres-backup-verify.ts", { ORGANY_BACKUP_FILE: backupFile });
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /integrity: PASS/);
    assertRedacted(verify.stdout + verify.stderr);

    await copyFile(backupFile, corruptFile);
    const originalManifest = await readFile(`${backupFile}.sha256`, "utf8");
    await appendFile(corruptFile, Buffer.from("phase-31-33-tamper"));
    await writeCorruptManifestWithCorrectName(originalManifest);

    const corruptRestore = run("scripts/postgres-restore.ts", {
      ORGANY_BACKUP_FILE: corruptFile,
      ORGANY_RESTORE_DATABASE_URL: targetUrl.toString(),
      ORGANY_PG_TOOL_MODE: "path",
    });
    assert.notEqual(corruptRestore.status, 0);
    assert.match(corruptRestore.stderr, /integrity verification failed/i);
    assertRedacted(corruptRestore.stdout + corruptRestore.stderr);
    assert.equal(await targetUserObjectCount(), 0, "Tampered archive must fail before target mutation.");

    const missingRestore = run("scripts/postgres-restore.ts", {
      ORGANY_BACKUP_FILE: missingFile,
      ORGANY_RESTORE_DATABASE_URL: targetUrl.toString(),
      ORGANY_PG_TOOL_MODE: "path",
    });
    assert.notEqual(missingRestore.status, 0);
    assert.match(missingRestore.stderr, /artifact was not found/i);
    assertRedacted(missingRestore.stdout + missingRestore.stderr);
    assert.equal(await targetUserObjectCount(), 0);

    const sameTarget = run("scripts/postgres-restore.ts", {
      ORGANY_BACKUP_FILE: backupFile,
      ORGANY_RESTORE_DATABASE_URL: sourceUrl.toString(),
      ORGANY_PG_TOOL_MODE: "path",
    });
    assert.notEqual(sameTarget.status, 0);
    assert.match(sameTarget.stderr, /separate database/i);
    assertRedacted(sameTarget.stdout + sameTarget.stderr);
    assert.deepEqual(await sourceSnapshot(), sourceBefore, "source=target rejection must not mutate source.");

    const restore = run("scripts/postgres-restore.ts", {
      ORGANY_BACKUP_FILE: backupFile,
      ORGANY_RESTORE_DATABASE_URL: targetUrl.toString(),
      ORGANY_PG_TOOL_MODE: "path",
    });
    assert.equal(restore.status, 0, restore.stderr);
    assert.match(restore.stdout, /logical restore: PASS/);
    assert.match(restore.stdout, /Restored protected sessions revoked: 1/);
    assertRedacted(restore.stdout + restore.stderr);

    await verifyRestoredRepresentativeData();
    assert.deepEqual(await sourceSnapshot(), sourceBefore, "Restore rehearsal must not mutate source.");

    const recoveryCheck = run("scripts/postgres-recovery-check.ts", {
      ORGANY_RESTORE_DATABASE_URL: targetUrl.toString(),
    });
    assert.equal(recoveryCheck.status, 0, recoveryCheck.stderr);
    assert.match(recoveryCheck.stdout, /read-only check: PASS/);
    assert.match(recoveryCheck.stdout, /Protected sessions: 0/);
    assertRedacted(recoveryCheck.stdout + recoveryCheck.stderr);

    const secondRestore = run("scripts/postgres-restore.ts", {
      ORGANY_BACKUP_FILE: backupFile,
      ORGANY_RESTORE_DATABASE_URL: targetUrl.toString(),
      ORGANY_PG_TOOL_MODE: "path",
    });
    assert.notEqual(secondRestore.status, 0);
    assert.match(secondRestore.stderr, /must be empty/i);
    assertRedacted(secondRestore.stdout + secondRestore.stderr);

    const gitignore = await readFile(".gitignore", "utf8");
    assert.match(gitignore, /^\.organy-backups\/$/m);

    const restoreSource = await readFile("scripts/postgres-restore.ts", "utf8");
    for (const forbidden of ["db:seed", "db:sync", "db:bootstrap", "password reset"]) {
      assert.ok(!restoreSource.includes(forbidden), `Restore operator command must not invoke ${forbidden}.`);
    }

    console.log("Phase 31.33 PostgreSQL backup/restore acceptance: PASS");
  } finally {
    await dropTargetDatabase();
    await cleanupFiles();
  }
}

function run(script: string, additions: Record<string, string>) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawnSync(npx, ["tsx", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: sourceUrl.toString(),
      ...additions,
    },
  });
}

async function insertRepresentativeSourceData() {
  const pool = new Pool({ connectionString: sourceUrl.toString() });
  try {
    await pool.query("begin");
    await pool.query(`insert into catalog_persons (id, display_name, active, priest, organist) values ('phase3133-person', 'Phase 31.33 Person', true, true, false) on conflict (id) do nothing`);
    await pool.query(`insert into app_users (id, display_name, person_id, active) values ('phase3133-admin', 'Phase 31.33 Admin', 'phase3133-person', true) on conflict (id) do nothing`);
    await pool.query(`insert into app_user_roles (user_id, role) values ('phase3133-admin', 'admin') on conflict do nothing`);
    await pool.query(`insert into auth_users (id, name, email, email_verified, username, display_username) values ('phase3133-auth', 'Phase 31.33 Admin', 'phase3133@example.invalid', false, 'phase3133', 'phase3133') on conflict (id) do nothing`);
    await pool.query(`insert into auth_accounts (id, account_id, provider_id, user_id, password) values ('phase3133-account', 'phase3133-auth', 'credential', 'phase3133-auth', 'phase3133-preserved-password-hash') on conflict (id) do nothing`);
    await pool.query(`insert into protected_account_actor_links (auth_user_id, app_user_id) values ('phase3133-auth', 'phase3133-admin') on conflict (auth_user_id) do nothing`);
    await pool.query(`insert into auth_sessions (id, expires_at, token, user_id) values ('phase3133-session', now() + interval '1 day', 'phase3133-sensitive-session-token', 'phase3133-auth') on conflict (id) do nothing`);
    await pool.query(`insert into reference_catalog_songs (id, language, canonical_number, source_id, title) values ('czech:3133', 'czech', 3133, 'phase3133-song', 'Phase 31.33 Song') on conflict (id) do nothing`);
    await pool.query(`insert into service_contexts (name, service_date, service_language, priest_id, priest_display_name, organist_display_name) values ('Phase 31.33 recovery service', '2099-12-31', 'czech', 'phase3133-person', 'Phase 31.33 Person', '')`);
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
  }
}

async function sourceSnapshot() {
  const pool = new Pool({ connectionString: sourceUrl.toString() });
  try {
    const result = await pool.query(`
      select
        (select count(*)::int from service_contexts where name = 'Phase 31.33 recovery service') service_count,
        (select count(*)::int from reference_catalog_songs where id = 'czech:3133') song_count,
        (select count(*)::int from auth_users where id = 'phase3133-auth') auth_user_count,
        (select count(*)::int from protected_account_actor_links where auth_user_id = 'phase3133-auth' and app_user_id = 'phase3133-admin') link_count,
        (select count(*)::int from app_user_roles where user_id = 'phase3133-admin' and role = 'admin') role_count,
        (select count(*)::int from auth_sessions where id = 'phase3133-session') session_count,
        (select password = 'phase3133-preserved-password-hash' from auth_accounts where id = 'phase3133-account') credential_preserved
    `);
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

async function verifyRestoredRepresentativeData() {
  const pool = new Pool({ connectionString: targetUrl.toString() });
  try {
    const result = await pool.query(`
      select
        (select count(*)::int from service_contexts where name = 'Phase 31.33 recovery service') service_count,
        (select count(*)::int from reference_catalog_songs where id = 'czech:3133' and title = 'Phase 31.33 Song') song_count,
        (select count(*)::int from auth_users where id = 'phase3133-auth' and username = 'phase3133') auth_user_count,
        (select count(*)::int from protected_account_actor_links where auth_user_id = 'phase3133-auth' and app_user_id = 'phase3133-admin') link_count,
        (select count(*)::int from app_user_roles where user_id = 'phase3133-admin' and role = 'admin') role_count,
        (select count(*)::int from auth_sessions) session_count,
        (select password = 'phase3133-preserved-password-hash' from auth_accounts where id = 'phase3133-account') credential_preserved,
        (select active from app_users where id = 'phase3133-admin') actor_active,
        (select person_id from app_users where id = 'phase3133-admin') person_id
    `);
    const row = result.rows[0];
    assert.equal(Number(row.service_count), 1);
    assert.equal(Number(row.song_count), 1);
    assert.equal(Number(row.auth_user_count), 1);
    assert.equal(Number(row.link_count), 1);
    assert.equal(Number(row.role_count), 1);
    assert.equal(Number(row.session_count), 0, "Restored protected sessions must be revoked.");
    assert.equal(row.credential_preserved, true, "Protected credential hash must remain present and unchanged.");
    assert.equal(row.actor_active, true);
    assert.equal(row.person_id, "phase3133-person");
  } finally {
    await pool.end();
  }
}

async function createTargetDatabase() {
  const pool = new Pool({ connectionString: adminUrl.toString() });
  try {
    await pool.query(`create database "${targetName}"`);
  } finally {
    await pool.end();
  }
}

async function dropTargetDatabase() {
  const pool = new Pool({ connectionString: adminUrl.toString() });
  try {
    await pool.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [targetName]);
    await pool.query(`drop database if exists "${targetName}"`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function targetUserObjectCount(): Promise<number> {
  const pool = new Pool({ connectionString: targetUrl.toString() });
  try {
    const result = await pool.query(`select count(*)::int count from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')`);
    return Number(result.rows[0].count);
  } finally {
    await pool.end();
  }
}

async function writeCorruptManifestWithCorrectName(originalManifest: string) {
  const hash = originalManifest.trim().split(/\s+/)[0];
  await writeFile(`${corruptFile}.sha256`, `${hash}  ${basename(corruptFile)}\n`, "utf8");
}

async function cleanupFiles() {
  for (const path of [backupFile, `${backupFile}.sha256`, corruptFile, `${corruptFile}.sha256`, missingFile, `${missingFile}.sha256`, resolve("phase-31-33-unsafe.dump")]) {
    await rm(path, { force: true }).catch(() => undefined);
  }
}

function assertRedacted(output: string) {
  assert.ok(!output.includes(sourceUrl.toString()), "Output must not include DATABASE_URL.");
  if (secretPassword) assert.ok(!output.includes(secretPassword), "Output must not include database password.");
  assert.ok(!output.includes("phase3133-sensitive-session-token"), "Output must not include session tokens.");
  assert.ok(!output.includes("phase3133-preserved-password-hash"), "Output must not include password hashes.");
}

function withDatabase(url: URL, database: string): URL {
  const result = new URL(url.toString());
  result.pathname = `/${database}`;
  return result;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
