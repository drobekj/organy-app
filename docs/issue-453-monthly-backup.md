# Issue #453 — Monthly encrypted PostgreSQL backup

## Status and boundary

Prepared for separate review. **Not activated; no Production backup has been executed by this issue.** Merge, the first real Production backup, and schedule activation require the operator checkpoints in #453. This is maintenance of the Phase 31.33 recovery baseline, not a new recovery architecture.

The existing `scripts/postgres-backup.ts`, `postgres-backup-verify.ts`, `postgres-restore.ts`, and `postgres-recovery-check.ts` remain authoritative. The wrapper adds encryption and bounded publication; it does not add an HTTP endpoint, change application data, run migrations, rotate credentials, or perform a Production restore.

## Proposed storage and cost

Use the existing public GitHub repository's standard Ubuntu Actions runner and GitHub Actions artifacts. The archive is encrypted locally **before** upload; the public repository must be treated as publicly readable storage. No new provider or paid plan is requested.

Primary documentation checked 2026-09-07:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions — standard hosted runners in public repositories are free; artifact storage has plan allowances and usage/billing controls.
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository — public artifact retention is 1–90 days.
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts — repository read access is sufficient to download artifacts.

The proposed retention is **90 days** and the wrapper refuses an encrypted artifact larger than **100 MiB**. With the monthly cadence this bounds the proposed archive footprint to approximately four archives / 400 MiB, before other repository/account storage. It is not a guarantee that the account's total storage remains within its free allowance. The actual billing plan, current storage/Packages usage, spending budget, repository retention limit, and first archive size must be checked at activation. If the zero-cost contract cannot be confirmed, leave the workflow disabled; do not enable paid overages or upgrade a plan. A failed size or quota check is a failed backup, not a reason to silently increase the limit.

A 90-day artifact is not a permanent archive. The operator must download and retain a verified encrypted copy outside GitHub before relying on expiry or deleting any old archive. GitHub is the proposed off-Neon copy, not the only recovery-key or long-term-storage location.

## Recovery key custody

Use the established `age` X25519 file-encryption tool. Generate a new age identity on the operator's trusted computer, not in GitHub Actions, and obtain its public `age1...` recipient. Keep the private identity in at least two separately protected offline locations under operator control. Do not commit it, put it in GitHub Secrets/Artifacts, paste it into chat, or store it beside the encrypted archives. Record which public recipient belongs to the private identity and test an actual decryption before activation. Loss of the private identity makes the archive unrecoverable; changing the public recipient does not re-encrypt old archives.

Only the public recipient and a dedicated direct Production database credential are supplied to the backup job. The private key is used only on the offline recovery computer. The job does not use Vercel runtime secrets or the pooled application connection. A dedicated read-only PostgreSQL login is preferable, but creating one or rotating any credential is outside this issue and requires separate approval.

## Workflow controls

`.github/workflows/issue-453.yml` has one shared Production job and one disposable PR rehearsal. The Production job is allowed only on this repository's `main`, with the `production-backup` environment and repository variable `ORGANY_MONTHLY_BACKUP_MODE`:

- absent / `disabled`: no Production backup;
- `manual`: only an explicitly confirmed `workflow_dispatch` run;
- `scheduled`: confirmed manual runs and the monthly schedule, at **03:17 UTC on the first day of each month**.

No PR job receives Production backup credentials. The Production environment should require operator approval where available. The job has read-only repository permissions, no persistent checkout credential, a 30-minute timeout, non-cancelling concurrency, and uploads only `*.tar.age` with 90-day retention. The temporary plaintext dump, checksum and tar bundle are removed on normal completion/failure; the hosted runner is disposable. Do not enable shell tracing or upload the working directory as an artifact.

Required environment secrets are `ORGANY_BACKUP_DATABASE_URL_UNPOOLED` and `ORGANY_BACKUP_RECIPIENT`. The former must be the reviewed direct Neon Production connection, with TLS required; the latter is the public age recipient. Neither is currently provisioned by this issue. `ORGANY_BACKUP_MAX_BYTES` is fixed to 104857600 in the workflow. Missing/invalid source, recipient, or private recovery identity (for unpack) fails closed. No fallback to a different database, key, provider, or paid tier is allowed.

## Disposable acceptance

The PR rehearsal uses a fresh PostgreSQL 16 service, applies the existing migrations, creates a synthetic fixture, generates a disposable age key, and calls the same backup wrapper. It verifies encrypted-only publication, decryption, the existing SHA-256 manifest, a separate empty restore target, preserved fixture data, and the existing recovery check. It also tests missing configuration, wrong identity, ciphertext tampering, source=target rejection, and a second restore into a non-empty target. The temporary key and databases are discarded; no Production connection or real private recovery key is involved.

## Operator release checkpoints

1. Review the exact PR and require all exact-head checks PASS. Obtain explicit release approval before merge. Confirm the cost/availability facts above against the actual account and verify that the selected storage is acceptable for sensitive encrypted church data.
2. Generate and safeguard the private recovery identity outside GitHub. Provision only the approved public recipient and direct backup credential in the protected Production environment. Keep the mode `disabled` until the first real backup is separately authorized.
3. Set mode to `manual` only after that authorization, run the workflow with `confirm_production=true`, and verify the exact run, encrypted artifact, size, and successful publication. A green job alone does not prove recovery.
4. Download the encrypted artifact to a trusted recovery computer. Install the reviewed PostgreSQL/Node/age tools, place the private identity outside the repository, and create a new empty output directory path. From the reviewed checkout run:

   ```sh
   ORGANY_ENCRYPTED_BACKUP_FILE=/trusted/archive.tar.age \
   ORGANY_BACKUP_IDENTITY_FILE=/trusted/private-identity \
   ORGANY_BACKUP_OUTPUT_DIR=/trusted/recovery-453 \
   bash scripts/issue-453-encrypted-backup.sh unpack
   ```

   The output is `backup.dump` plus `backup.dump.sha256`. Set `ORGANY_BACKUP_FILE` to that dump, `DATABASE_URL` to the source identity, and `ORGANY_RESTORE_DATABASE_URL` to a **separate empty** target. Run the existing `postgres-restore.ts` and `postgres-recovery-check.ts`. Never set the target to Production or run a destructive in-place restore. Verify representative rows and restored-session revocation. Keep the encrypted copy and securely remove the temporary plaintext after acceptance.
5. Only after successful real recovery acceptance and a separate schedule-activation approval, set mode to `scheduled`. Confirm the next expected run and inspect its result. If a run fails or no fresh archive exists within the agreed monthly window, treat recovery coverage as degraded and escalate; do not claim the last successful backup is current.

## Explicit limitations

This is a monthly logical archive, not PITR, WAL archiving, replication, a full disaster-recovery SLA, or a guaranteed RPO/RTO. A current six-hour Neon Free history window and a short-lived manual snapshot do not replace independently retained encrypted backups. No automatic restore, database cutover, permanent storage service, or general application refactor is part of #453.
