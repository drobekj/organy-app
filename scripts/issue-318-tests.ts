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
assert.match(account, /const VERIFY_DB_COMMAND = "npm run db:verify:offline";[\s\S]*?<code className="verify-db-command">\{VERIFY_DB_COMMAND\}<\/code>/, "Dialog must render the one-command workflow");
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
assert.match(compose, /container_name:\s*organy-offline-adminer/);
assert.match(compose, /127\.0\.0\.1:8080:80/, "Adminer must bind only to loopback");
assert.match(compose, /ADMINER_PLUGIN_AUTOLOGIN:\s*"1"/);
assert.match(compose, /pgsql:\/\/organy_offline:organy_offline@offline-postgres:5432\/organy_offline/);

assert.match(operator, /VERCEL_ORG_ID/);
assert.match(operator, /VERCEL_PROJECT_ID/);
assert.match(operator, /"env", "pull", \$TempVercelEnv, "--environment=production", "--yes"/, "Operator must explicitly pull the Production Vercel environment");
assert.doesNotMatch(operator, /vercel\s+link/i, "Operator must not mutate Vercel project linking");
assert.match(operator, /Read-DotEnvValue -Path \$TempVercelEnv -Name "DATABASE_URL_UNPOOLED"/, "Production backup must use the direct/unpooled Neon connection");
assert.doesNotMatch(operator, /Read-DotEnvValue -Path \$TempVercelEnv -Name "DATABASE_URL"(?!_UNPOOLED)/, "Pooled runtime DATABASE_URL must not drive pg_dump");
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
assert.match(operator, /Start-Process \$AdminerUrl/);
assert.match(operator, /Remove-Item -LiteralPath \$TempDatabaseEnv/);
assert.match(operator, /Remove-Item -LiteralPath \$TempVercelEnv/);
assert.doesNotMatch(operator, /ORGANY_RESTORE_DATABASE_URL\s*=\s*\$databaseUrl/i, "Production URL must never become the restore target");
assert.doesNotMatch(operator, /dropdb.+organy_app/i, "Operator must never drop the permanent development DB");

assert.match(runbook, /Verify DB offline workspace/);
assert.match(runbook, /npm run db:verify:offline/);
assert.match(runbook, /127\.0\.0\.1:8080/);
assert.match(runbook, /Production.*backup.*local/i);

console.log("Issue 318 Verify DB offline workspace acceptance: PASS");
