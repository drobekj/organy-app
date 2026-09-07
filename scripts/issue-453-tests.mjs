import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';

const source = process.env.DATABASE_URL;
if (!source) throw new Error('A disposable DATABASE_URL is required.');
const parsed = new URL(source);
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())) throw new Error('Issue 453 acceptance refuses non-loopback sources.');
const root = await mkdtemp(join(tmpdir(), 'organy-453-acceptance-'));
const targetName = `organy_issue453_restore_${process.pid}_${Date.now()}`;
const target = new URL(source);
target.pathname = `/${targetName}`;
const admin = new URL(source);
admin.pathname = '/postgres';
const marker = 'issue453-sensitive-fixture-not-for-publication';
let targetCreated = false;
const safeEnv = {
  ...process.env,
  DATABASE_URL: source,
  DATABASE_URL_UNPOOLED: source,
  ORGANY_BACKUP_SOURCE_KIND: 'disposable',
  ORGANY_BACKUP_DISPOSABLE: '1',
  ORGANY_PG_TOOL_MODE: 'path',
  ORGANY_BACKUP_WORK_ROOT: root,
  ORGANY_BACKUP_IDENTITY_FILE: '',
};
function run(command, args, additions = {}) {
  const result = spawnSync(command, args, { cwd: resolve('.'), encoding: 'utf8', env: { ...safeEnv, ...additions }, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = result.stdout + result.stderr;
  assert.ok(!output.includes(source), 'Database URL leaked into command output.');
  if (parsed.password) assert.ok(!output.includes(decodeURIComponent(parsed.password)), 'Database password leaked into command output.');
  assert.ok(!output.includes(marker), 'Fixture contents leaked into command output.');
  return result;
}
function checked(command, args, additions = {}) {
  const result = run(command, args, additions);
  assert.equal(result.status, 0, result.stderr);
  return result;
}
function wrapper(mode, additions = {}) {
  return run('bash', ['scripts/issue-453-encrypted-backup.sh', mode], additions);
}
function expectedFailure(mode, additions = {}) {
  assert.notEqual(wrapper(mode, additions).status, 0, 'Expected a fail-closed rejection.');
}
async function countFixture(url) {
  const pool = new Pool({ connectionString: url });
  try {
    const result = await pool.query('select count(*)::int as count from issue453_fixture where value=$1', [marker]);
    return Number(result.rows[0].count);
  } finally { await pool.end(); }
}

try {
  const key = join(root, 'private-identity');
  checked('age-keygen', ['-o', key]);
  const recipient = checked('age-keygen', ['-y', key]).stdout.trim();
  const published = join(root, 'published');
  await mkdir(published, { mode: 0o700 });
  const createEnv = { ORGANY_BACKUP_RECIPIENT: recipient, ORGANY_BACKUP_OUTPUT_DIR: published };

  // These failures must happen before any dump is created or published.
  expectedFailure('create', { ...createEnv, ORGANY_BACKUP_RECIPIENT: '' });
  expectedFailure('create', { ...createEnv, ORGANY_BACKUP_RECIPIENT: 'invalid' });
  expectedFailure('create', { ...createEnv, DATABASE_URL_UNPOOLED: '' });
  expectedFailure('create', { ...createEnv, ORGANY_BACKUP_SOURCE_KIND: 'production' });
  expectedFailure('create', { ...createEnv, ORGANY_BACKUP_IDENTITY_FILE: key });
  assert.deepEqual(await readdir(published), []);

  const sourcePool = new Pool({ connectionString: source });
  try {
    await sourcePool.query('create table issue453_fixture (value text not null)');
    await sourcePool.query('insert into issue453_fixture (value) values ($1)', [marker]);
  } finally { await sourcePool.end(); }
  assert.equal(await countFixture(source), 1);

  expectedFailure('create', { ...createEnv, ORGANY_BACKUP_MAX_BYTES: '1' });
  assert.deepEqual(await readdir(published), [], 'Oversized backups must not be published.');
  checked('bash', ['scripts/issue-453-encrypted-backup.sh', 'create'], createEnv);
  const files = await readdir(published);
  assert.equal(files.length, 1);
  assert.match(files[0], /^organy-\d{8}T\d{6}Z\.tar\.age$/);
  const encrypted = join(published, files[0]);
  assert.ok(!(await readFile(encrypted)).includes(Buffer.from(marker)));
  assert.equal(await countFixture(source), 1, 'Backup must not mutate the source.');

  const unpacked = join(root, 'unpacked');
  const unpackEnv = { ORGANY_ENCRYPTED_BACKUP_FILE: encrypted, ORGANY_BACKUP_IDENTITY_FILE: key, ORGANY_BACKUP_OUTPUT_DIR: unpacked };
  expectedFailure('unpack', { ...unpackEnv, ORGANY_BACKUP_IDENTITY_FILE: '' });
  const wrongKey = join(root, 'wrong-identity');
  checked('age-keygen', ['-o', wrongKey]);
  expectedFailure('unpack', { ...unpackEnv, ORGANY_BACKUP_IDENTITY_FILE: wrongKey });
  const corrupt = join(root, 'corrupt.tar.age');
  const ciphertext = await readFile(encrypted);
  ciphertext[ciphertext.length - 1] ^= 1;
  await writeFile(corrupt, ciphertext);
  expectedFailure('unpack', { ...unpackEnv, ORGANY_ENCRYPTED_BACKUP_FILE: corrupt });
  assert.rejects(readdir(unpacked));

  checked('bash', ['scripts/issue-453-encrypted-backup.sh', 'unpack'], unpackEnv);
  assert.deepEqual((await readdir(unpacked)).sort(), ['backup.dump', 'backup.dump.sha256']);
  const backupFile = join(unpacked, 'backup.dump');
  const restoreEnv = { ORGANY_BACKUP_FILE: backupFile, ORGANY_RESTORE_DATABASE_URL: source };
  assert.notEqual(run('npx', ['--no-install', 'tsx', 'scripts/postgres-restore.ts'], restoreEnv).status, 0);
  assert.equal(await countFixture(source), 1);

  const adminPool = new Pool({ connectionString: admin.toString() });
  try { await adminPool.query(`create database "${targetName}"`); targetCreated = true; }
  finally { await adminPool.end(); }
  const isolatedEnv = { ...restoreEnv, ORGANY_RESTORE_DATABASE_URL: target.toString() };
  checked('npx', ['--no-install', 'tsx', 'scripts/postgres-restore.ts'], isolatedEnv);
  assert.equal(await countFixture(target.toString()), 1);
  checked('npx', ['--no-install', 'tsx', 'scripts/postgres-recovery-check.ts'], isolatedEnv);
  assert.equal(await countFixture(source), 1);
  assert.notEqual(run('npx', ['--no-install', 'tsx', 'scripts/postgres-restore.ts'], isolatedEnv).status, 0);

  assert.deepEqual(await readdir(published), files, 'Only ciphertext may remain in publication storage.');
  console.log('Issue 453 encrypted backup, integrity and isolated restore acceptance: PASS');
} finally {
  if (targetCreated) {
    const pool = new Pool({ connectionString: admin.toString() });
    try {
      await pool.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [targetName]);
      await pool.query(`drop database "${targetName}"`);
    } finally { await pool.end(); }
  }
  await rm(root, { recursive: true, force: true });
}
