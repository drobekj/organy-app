# PostgreSQL backup, restore, and recovery rehearsal

## Purpose

Phase 31.33 establishes a minimal vendor-neutral logical backup and recovery baseline for the complete Organy PostgreSQL database. It is an operator-only procedure; there is no HTTP endpoint or browser UI for backup or restore.

The logical archive contains the persisted application state that lives in PostgreSQL, including church-domain data, Drizzle migration state, Better Auth tables, protected Account-to-Actor links, and `app_user_roles`. It can therefore contain password hashes, protected session records, congregation data, and other sensitive state. Treat the archive and its checksum manifest as sensitive operational data.

Environment secrets such as `BETTER_AUTH_SECRET` are not database rows and are not supplied by the archive. They must be provisioned separately under the Phase 31.32 runtime configuration rules.

## Operator commands

The commands are:

```sh
npx tsx scripts/postgres-backup.ts
npx tsx scripts/postgres-backup-verify.ts
npx tsx scripts/postgres-restore.ts
npx tsx scripts/postgres-recovery-check.ts
```

`postgres-backup.ts` requires `DATABASE_URL`. `ORGANY_BACKUP_FILE` is optional; if omitted, a timestamped custom-format archive is created under the Git-ignored `.organy-backups/` directory. A sibling `.sha256` manifest is created after a successful dump.

`postgres-backup-verify.ts` requires `ORGANY_BACKUP_FILE` and verifies the artifact against its sibling `.sha256` manifest.

`postgres-restore.ts` requires all of:

- `DATABASE_URL` — the source database identity used for the safety comparison;
- `ORGANY_RESTORE_DATABASE_URL` — a separately provisioned restore target;
- `ORGANY_BACKUP_FILE` — the selected logical archive.

The restore command verifies archive integrity first, connects to source and target to prove that they are different databases, refuses a restore target that already contains user objects, restores with fail-fast/single-transaction PostgreSQL semantics, and then deletes all restored `auth_sessions` before reporting success. It does not run seed, catalog sync, bootstrap, or password-reset commands.

`postgres-recovery-check.ts` is read-only. It reports counts for representative planning/catalog and protected identity/link/role tables and requires restored protected-session count to be zero.

## PostgreSQL client tool modes

The default is:

```sh
ORGANY_PG_TOOL_MODE=path
```

This invokes standard `pg_dump` and `pg_restore` from `PATH`. `ORGANY_PG_BIN_DIR` may point to a PostgreSQL client binary directory when the tools are installed but not on `PATH`.

For the repository's local Docker PostgreSQL only, use:

```sh
ORGANY_PG_TOOL_MODE=docker-compose
```

This invokes `pg_dump`/`pg_restore` inside the existing `postgres` Compose service. In this mode both source and restore URLs must point to the loopback service on port 5432. It exists so local recovery acceptance does not require a separate Windows PostgreSQL client installation; it is not the production-provider model.

## Safe recovery sequence

1. Supply and validate the intended runtime configuration.
2. Create the logical backup from the source database and require PASS.
3. Verify its SHA-256 manifest and require PASS.
4. Provision a **separate empty** PostgreSQL database as the restore target.
5. Set `ORGANY_RESTORE_DATABASE_URL` to that separate target.
6. Run the restore and require PASS. Source=target and non-empty target are rejected before `pg_restore` is allowed to mutate the target.
7. The restore command revokes all protected Better Auth sessions restored from the snapshot.
8. Run the read-only recovery check.
9. If the recovered application version requires newer schema, run current migrations against the restore target only after the archive restore/session-hardening step, then repeat recovery checks.
10. Only a separately accepted operator-controlled cutover may make a recovered database the live database.

This phase does **not** provide destructive in-place restore of a live database.

## Local HUMAN rehearsal — permanent DB safety

The permanent local database `organy_app` is source-only for this checkpoint. Never drop, recreate, empty, or restore over it.

PowerShell setup while the local Docker PostgreSQL is running:

```powershell
$env:ORGANY_RUNTIME = "db"
$env:DATABASE_URL = "postgres://organy_app:organy_app@localhost:5432/organy_app"
$env:ORGANY_PG_TOOL_MODE = "docker-compose"
$env:ORGANY_BACKUP_FILE = ".organy-backups\human-phase-31-33.dump"
$env:ORGANY_RESTORE_DATABASE_URL = "postgres://organy_app:organy_app@localhost:5432/organy_app_restore_3133"
```

Create only the temporary target:

```powershell
docker compose exec -T postgres createdb -U organy_app organy_app_restore_3133
```

Create and verify the backup:

```powershell
npx tsx scripts/postgres-backup.ts
npx tsx scripts/postgres-backup-verify.ts
```

Restore and check the temporary target:

```powershell
npx tsx scripts/postgres-restore.ts
npx tsx scripts/postgres-recovery-check.ts
```

A second restore into the now non-empty `organy_app_restore_3133` must fail. Setting `ORGANY_RESTORE_DATABASE_URL` temporarily equal to `DATABASE_URL` must also fail before any restore mutation.

After the checkpoint, optional cleanup may remove **only** the temporary database and backup files:

```powershell
docker compose exec -T postgres dropdb -U organy_app organy_app_restore_3133
Remove-Item .organy-backups\human-phase-31-33.dump -Force
Remove-Item .organy-backups\human-phase-31-33.dump.sha256 -Force
```

Do not run any command that drops `organy_app`.

## Verify DB offline workspace

The Admin **Role Admin → Verify DB** action is the guided operator entry point for routine offline database inspection. The hosted browser cannot launch programs or write files on the operator's Windows machine, so the dialog copies one complete PowerShell block:

```powershell
cd "$env:LOCALAPPDATA\Organy\verify-db"
npm run db:verify:offline
```

The routine operator action is therefore only: open PowerShell, paste the copied block, and press Enter. The dedicated checkout is separate from the normal development worktree. It performs the following sequence automatically:

1. Starts Docker Desktop when the Docker engine is not already running and the standard Windows installation is available.
2. When run from the dedicated `%LOCALAPPDATA%\Organy\verify-db` checkout, first fetches `origin/main` and self-restarts once on the current main revision. It never modifies the normal development worktree.
3. Resolves the Production backup source without reading back Vercel Sensitive environment variables. If `DATABASE_URL_UNPOOLED` or `DATABASE_URL` is already explicitly present in the operator process, the existing validated path remains available. Otherwise Verify DB invokes pinned Neon CLI through `npx`. On first use it explicitly runs the visible Neon browser-auth flow before any captured command, so authorization can never be hidden behind the operator script. After authentication it verifies the reviewed Production project by both pinned id `young-voice-36803445` and name `organy-app-production`; it does not list projects or ask the operator to choose an organization/project. It then requests that project's default-branch direct connection string, which remains process-local.
4. Validates that the resolved source is remote PostgreSQL. Neon CLI resolution must return a direct `.neon.tech` host and rejects a pooled endpoint. For an explicitly supplied pooled Neon `DATABASE_URL`, the established fallback may still derive the direct endpoint by removing only the documented `-pooler` hostname suffix while preserving credentials, database name, and TLS/query parameters. Non-PostgreSQL, loopback/local, and non-Neon pooled hosts fail closed.
5. Passes only the resolved direct `DATABASE_URL` into the transient `postgres:16-alpine` pg_dump container through inherited environment. The credential value is not placed on the command line and no temporary credential env file is created.
6. Writes and verifies a SHA-256 manifest beside the timestamped archive under `.organy-backups/`.
7. Resets only `docker-compose.offline-db.yml`, which owns the disposable `organy_offline_postgres_data` volume. The normal `organy-app-postgres` container and `organy_app_postgres_data` volume are not part of this Compose project and are never reset by this command.
8. Restores the archive into `organy_offline`, revokes all restored `auth_sessions`, and runs the same representative read-only recovery summary directly through `psql` inside the offline PostgreSQL container. This removes any routine dependency on local project `node_modules`; the provider CLI itself is fetched by pinned `npx`.
9. Starts pinned Pgweb only after recovery passes and opens `http://127.0.0.1:8080` automatically. Pgweb receives only the Docker-local `organy_offline` connection URL, locks the session to that connection, and therefore opens directly on the restored local database without a login/connection form.

The local database is additionally exposed on `127.0.0.1:5433` for optional local tools. Both database and Pgweb ports bind to loopback only.

The safety direction is intentionally one-way:

```text
Production → backup archive + SHA-256 → disposable local PostgreSQL → Pgweb
```

There is no command in this workflow that restores, synchronizes, or writes the local copy back to Production. Re-running Verify DB destroys and recreates only the disposable offline database, while timestamped backup archives remain available under the Git-ignored backup directory.

## Logging and secret boundaries

Application-owned backup/recovery scripts report only PASS/FAIL, artifact paths, counts, and actionable safety reasons. They intentionally do not print database URLs, database passwords, session tokens, password hashes, or backup contents. Vercel Production database variables may be configured as Sensitive and therefore cannot be read back by `vercel env run`; Verify DB no longer depends on that capability. Its authenticated Neon CLI fallback resolves the direct connection in process memory and does not run `env pull`, write a Production dotenv file, or write a temporary database credential file. First-use OAuth output is intentionally visible; connection-string output remains captured and is never echoed. Child PostgreSQL stderr is not relayed because provider/client errors can contain connection details.

No archive or manifest belongs in Git. `.organy-backups/` is ignored by the repository.

## Still deferred

Phase 31.33 is not full disaster-recovery readiness. Separate Contract Gates are still required for hosting/provider selection, managed backup services, scheduled/off-site backup storage, retention policy, encryption/key management, WAL/PITR, replication/failover, RPO/RTO commitments, production cutover, release/rollback automation, and observability/security telemetry.
