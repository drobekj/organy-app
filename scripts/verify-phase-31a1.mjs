import { spawnSync } from 'node:child_process';
const project = `organy_phase31a1_${process.pid}`;
const url = 'postgres://organy_app:organy_app@127.0.0.1:5432/organy_app';
const env = { ...process.env, COMPOSE_PROJECT_NAME: project, DATABASE_URL: url };
function run(command, args) { const r = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', env }); if (r.status !== 0) process.exit(r.status ?? 1); }
function capture(command, args) { const r = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32', env }); if (r.status !== 0) { process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status ?? 1); } return r.stdout.trim(); }
try {
  run('node', ['data/catalog/materialize-catalogs.mjs']);
  run('docker', ['compose', '-p', project, 'down', '-v', '--remove-orphans']);
  run('docker', ['compose', '-p', project, 'up', '-d', 'postgres']);
  for (let i=0;i<60;i++){ const ok=spawnSync('docker',['compose','-p',project,'exec','-T','postgres','pg_isready','-U','organy_app','-d','organy_app'],{stdio:'ignore',shell:process.platform==='win32',env}); if(ok.status===0) break; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000); if(i===59) process.exit(1); }
  run('npm', ['run','db:migrate']);
  run('npm', ['run','db:real-catalog-acceptance']);
  run('npm', ['run','db:verify:real-catalog']);
  const before = capture('npx', ['tsx','-e', "import {Pool} from 'pg'; import {catalogFingerprint} from './src/application/real-catalog-import'; const p=new Pool({connectionString:process.env.DATABASE_URL}); console.log(await catalogFingerprint(p)); await p.end();"]);
  run('npm', ['run','db:phase-30-1-smoke']);
  const after = capture('npx', ['tsx','-e', "import {Pool} from 'pg'; import {catalogFingerprint} from './src/application/real-catalog-import'; const p=new Pool({connectionString:process.env.DATABASE_URL}); console.log(await catalogFingerprint(p)); await p.end();"]);
  if (before !== after) { console.error(`Phase 30.1 smoke changed catalog fingerprint: ${before} -> ${after}`); process.exit(1); }
  console.log(`Phase 30.1 smoke isolation proved: fingerprint=${before}`);
  run('npm', ['run','typecheck']); run('npm', ['test']); run('npm', ['run','build']);
  console.log('Phase 31A1 verification passed.');
} finally { spawnSync('docker', ['compose', '-p', project, 'down', '-v', '--remove-orphans'], { stdio: 'inherit', shell: process.platform === 'win32', env }); }
