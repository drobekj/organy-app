import { spawnSync } from 'node:child_process';
const composeUrl = 'postgres://organy_app:organy_app@127.0.0.1:5432/organy_app';
const env = { ...process.env, DATABASE_URL: composeUrl };
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', env, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== composeUrl) {
  console.error(`Refusing to reset non-repository Docker Compose PostgreSQL target: ${process.env.DATABASE_URL}`);
  process.exit(1);
}
run('docker', ['compose', 'down', '-v', '--remove-orphans']);
run('docker', ['compose', 'up', '-d', 'postgres']);
for (let attempt = 1; attempt <= 60; attempt += 1) {
  const ok = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'organy_app', '-d', 'organy_app'], { stdio: 'ignore', shell: process.platform === 'win32', env });
  if (ok.status === 0) {
    run('npm', ['run', 'db:migrate']);
    run('npm', ['run', 'db:import:real-catalog']);
    run('npm', ['run', 'db:verify:real-catalog']);
    console.log('Local real catalog reset passed: Docker Compose PostgreSQL recreated, migrated, imported, and verified.');
    process.exit(0);
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
console.error('PostgreSQL did not become healthy.'); process.exit(1);
