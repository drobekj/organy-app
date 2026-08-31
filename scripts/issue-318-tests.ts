import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const account = readFileSync("app/protected-account-controls.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const css = readFileSync("app/issue-318-offline-db.css", "utf8");
const compose = readFileSync("docker-compose.offline-db.yml", "utf8");
const operator = readFileSync("scripts/verify-db-offline.ps1", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
const runbook = readFileSync("docs/postgres-backup-restore-runbook.md", "utf8");

assert.match(account, /activeAdmin[\s\S]*?Verify DB/, "Verify DB must be exposed only from the active Admin role menu");
assert.match(account, /role="dialog"[\s\S]*?<h2 id="verify-db-dialog-title">Verify DB<\/h2>/, "Verify DB must open an operator handoff dialog");
assert.match(account, /const VERIFY_DB_COMMAND = 'cd "\$env:LOCALAPPDATA\\\\Organy\\\\verify-db"\\nnpm run db:verify:offline';/, "Copied Verify DB block must navigate to the dedicated operator checkout and run the workflow");
assert.match(account, /<pre className="verify-db-command"><code>\{VERIFY_DB_COMMAND\}<\/code><\/pre>/, "Dialog must render the complete multiline PowerShell block");
assert.match(account, /Open PowerShell\.[\s\S]*?Copy the complete block below/, "Dialog must not require manual repository navigation");
assert.match(account, /navigator\.clipboard\.writeText\(VERIFY_DB_COMMAND\)/, "Verify DB must provide a one-click command copy action");
assert.match(account, /Production → backup → local offline database/, "Dialog must state the one-way safety boundary");

assert.match(layout, /issue-318-offline-db\.css/, "Verify DB dialog styles must be loaded");
assert.match(css, /\.verify-db-dialog-backdrop/);
assert.match(css, /\.verify-db-command/);

assert.equal(pkg.scripts?.["db:verify:offline"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-db-offline.ps1");
assert.equal(pkg.scripts?.["test:issue-318"], "tsx scripts/issue-318-tests.ts");

assert.match(compose, /name:\s*organy-offline-db/);
assert.match(compose, /container_name:\s*organy-offline-postgres/);
assert.match(compose, /127\.0\.0\.1:5433:5432/, "Offline PostgreSQL must bind only to loopback");
assert.match(compose, /organy_offline_postgres_data/, "Offline verification must use its own disposable volume");
assert.doesNotMatch(compose, /organy_app_postgres_data/, "Offline verification must not share the permanent development volume");
assert.match(compose, /image:\s*sosedoff\/pgweb:0\.17\.0/, "Pgweb must be pinned to the accepted release");
assert.match(compose, /container_name:\s*organy-offline-pgweb/);
assert.match(compose, /127\.0\.0\.1:8080:8081/, "Pgweb must bind only to loopback");
assert.match(compose, /PGWEB_DATABASE_URL:\s*"postgres:\/\/organy_offline:organy_offline@offline-postgres:5432\/organy_offline\?sslmode=disable"/, "Pgweb must receive only the Docker-local database URL");
assert.match(compose, /PGWEB_LOCK_SESSION:\s*"1"/, "Pgweb must be locked to the disposable local connection");
assert.match(compose, /curl", "--fail", "--silent", "http:\/\/127\.0\.0\.1:8081\/"/, "Pgweb must expose a health check");
assert.doesNotMatch(compose, /adminer/i, "Adminer must not remain in the offline editor stack");

assert.match(operator, /VERCEL_ORG_ID/);
assert.match(operator, /VERCEL_PROJECT_ID/);
assert.match(operator, /vercel@\$VercelVersion" env run -e production -- powershell/, "Operator must execute itself under the Vercel Production environment");
assert.doesNotMatch(operator, /env", "pull"|env pull/, "Routine Verify DB must not parse a pulled dotenv file");
assert.doesNotMatch(operator, /vercel\s+link/i, "Operator must not mutate Vercel project linking");
assert.match(operator, /\$env:DATABASE_URL_UNPOOLED/, "Operator must prefer an explicitly supplied direct Neon URL from process environment");
assert.match(operator, /\$env:DATABASE_URL/, "Operator must fall back to the runtime URL from process environment");
assert.match(operator, /EndsWith\("\.neon\.tech"\)/, "Automatic pooled-to-direct derivation must be restricted to Neon hosts");
assert.match(operator, /'-pooler\(\?=\\\.\)'/, "Neon direct derivation must remove only the documented -pooler hostname suffix");
assert.match(operator, /host is not a Neon endpoint; refusing to derive a direct backup URL/, "Arbitrary pooled host rewriting must fail closed");
assert.match(operator, /Substring\(0, \$hostGroup\.Index\)[\s\S]*?\$directHost[\s\S]*?Substring\(\$hostGroup\.Index \+ \$hostGroup\.Length\)/, "Direct derivation must preserve all non-host connection-string content");
assert.match(operator, /Resolve-ProductionBackupDatabaseUrl/);
assert.match(operator, /--env", "DATABASE_URL"/, "pg_dump container must receive only the resolved database URL through inherited environment");
assert.doesNotMatch(operator, /--env-file/, "Verify DB must not write a temporary database credential env file");
assert.doesNotMatch(operator, /TempVercelEnv|TempDatabaseEnv|Read-DotEnvValue/, "Verify DB must not persist or parse Production dotenv credential files");
assert.match(operator, /Assert-RemoteProductionDatabase/);
assert.match(operator, /\(\?i:postgres\(\?:ql\)\?\)/, "PostgreSQL scheme validation must not depend on PowerShell System.Uri custom-scheme behavior");
assert.match(operator, /localhost", "127\.0\.0\.1", "::1"/, "Source validation must still reject loopback PostgreSQL");
assert.match(operator, /Update-DedicatedOperatorCheckout/, "Dedicated Verify DB checkout must self-update from origin main");
assert.match(operator, /"fetch", "origin", "main"/);
assert.match(operator, /ORGANY_VERIFY_DB_SELF_UPDATED/, "Self-update must restart at most once");
assert.match(operator, /pg_dump --format=custom --no-owner --no-privileges --no-password/);
assert.match(operator, /Get-FileHash[\s\S]*?SHA256/);
assert.match(operator, /"down", "-v", "--remove-orphans"/, "Only the dedicated offline Compose project may be reset");
assert.match(operator, /pg_restore[\s\S]*?--single-transaction[\s\S]*?-d", "organy_offline"/);
assert.match(operator, /delete from auth_sessions;/);
assert.match(operator, /select[\s\S]*?service_contexts[\s\S]*?reference_catalog_songs[\s\S]*?auth_users[\s\S]*?protected_account_actor_links[\s\S]*?app_user_roles[\s\S]*?auth_sessions/, "Offline recovery summary must preserve the established representative-table checks");
assert.match(operator, /if \(\$authSessions -ne 0\)[\s\S]*?recovery must not be accepted/, "Restored protected sessions must remain a hard recovery failure");
assert.doesNotMatch(operator, /npx\.cmd[\s\S]*?postgres-recovery-check/, "Routine Verify DB recovery must not require local Node dependencies");
assert.match(operator, /"up", "-d", "offline-postgres"/, "Step 4 must start only PostgreSQL before restore");
assert.match(operator, /"up", "-d", "pgweb"/, "Pgweb must start only after restore and recovery");
assert.match(operator, /Wait-ForPgweb/);
assert.match(operator, /Start-Process \$PgwebUrl/);
assert.doesNotMatch(operator, /Adminer/i, "Verify DB launcher must no longer depend on Adminer");
assert.match(operator, /Production credentials remained process-local and were not written to temporary env files/);
assert.doesNotMatch(operator, /ORGANY_RESTORE_DATABASE_URL\s*=\s*\$databaseUrl/i, "Production URL must never become the restore target");
assert.doesNotMatch(operator, /dropdb.+organy_app/i, "Operator must never drop the permanent development DB");

assert.match(runbook, /Verify DB offline workspace/);
assert.match(runbook, /npm run db:verify:offline/);
assert.match(runbook, /127\.0\.0\.1:8080/);
assert.match(runbook, /Pgweb/);
assert.doesNotMatch(runbook, /Starts Adminer|→ Adminer/);
assert.match(runbook, /Production.*backup.*local/i);

console.log("Issue 318 Verify DB offline workspace acceptance: PASS");
