# Production runtime configuration preflight

## Purpose

Phase 31.32 defines the minimal vendor-neutral runtime/secrets boundary required before a production deployment may be treated as correctly configured. It does not itself select a host, PostgreSQL provider, secret manager, backup product, release mechanism, or monitoring stack.

Phase 31.33 adds the repository's minimal logical PostgreSQL backup/restore and recovery-rehearsal baseline. The detailed procedure is in `docs/postgres-backup-restore-runbook.md`.

Phase 31.34 selects **Render for the application web service and Render Postgres for PostgreSQL**, both in Frankfurt, and records the first concrete deployment contract in `docs/production-hosting-decision.md`. Phase 31.34 is still preparation only: no Render account/resource, billing commitment, production secret, DNS change, data cutover, or remote deployment is created by that phase.

## Required production runtime variables

The operator must provide all of the following outside the repository:

- `ORGANY_RUNTIME=db`
- `DATABASE_URL` — the production PostgreSQL connection string
- `BETTER_AUTH_SECRET` — a non-placeholder secret with at least 32 characters
- `BETTER_AUTH_URL` — the externally meaningful absolute application/auth URL

A public/non-loopback `BETTER_AUTH_URL` must use HTTPS. Loopback HTTP is accepted only for local development or local acceptance.

Never commit production values, bootstrap passwords, replacement/recovery passwords, or database credentials. `.env.example` contains only local/safe examples and placeholders.

## Preflight

Before production migration/startup, run:

```sh
npx tsx scripts/production-preflight.ts
```

A valid configuration exits successfully and prints only a PASS summary. Invalid configuration exits non-zero and identifies the variable name and reason. The command deliberately does not print environment-variable values.

The preflight checks configuration syntax/presence only. It does not need database connectivity and does not mutate application data.

## Selected first deployment target

The accepted Phase 31.34 target is a conventional Render Node web service plus Render Postgres, both in Frankfurt, with one persistent Production environment. The detailed provider facts, dated cost assumptions, alternatives, Node pin, database-major-version choice, environment-variable placement, and pre-cutover prerequisites are authoritative in `docs/production-hosting-decision.md`.

The intended Render service contract is:

```text
NODE_VERSION=22.22.0

Build Command:
npm ci --no-audit --no-fund && npm run build

Pre-Deploy Command:
npx tsx scripts/production-preflight.ts && npm run db:migrate

Start Command:
npm start
```

The application uses the same-region Render Postgres internal connection URL for `DATABASE_URL`; the exact provider-generated value remains a production secret outside Git. The initial `BETTER_AUTH_URL` is the exact HTTPS `onrender.com` URL assigned to the service unless a custom domain is separately accepted before cutover.

This section does not authorize resource creation. A later Contract Gate must execute and verify the actual deployment.

## Production startup order

At a high level, the operator sequence is:

1. Provide the required production runtime variables through the deployment environment/secrets mechanism.
2. Run the production runtime preflight and require PASS.
3. Run database migrations with the intended production `DATABASE_URL`.
4. If and only if the congregation is being initialized and protected staff Accounts do not yet exist, perform the explicit one-time protected-auth bootstrap using separately supplied bootstrap credentials.
5. Start the application.
6. Confirm protected sign-in and the separate congregation nickname flow through the deployed URL.

For the selected Render target, steps 2 and 3 belong in the paid web service's pre-deploy command and step 5 is `npm start`. One-time bootstrap remains an explicit operator action and must never be folded into normal deploy/start behavior.

Catalog seed/sync commands, demo seed commands, and acceptance fixtures are not part of normal production startup and must not be run implicitly as part of deployment.

## Backup / recovery boundary

Phase 31.33 provides explicit operator-only logical backup, integrity verification, separate-empty-target restore, restored-session revocation, and read-only recovery checks. Backups are sensitive operational data and belong outside Git. Recovery must never restore over the configured source database, and a recovered snapshot is not considered usable until restored protected sessions have been revoked.

Render documents standard `pg_dump`/`pg_restore` use and paid Postgres PITR/logical exports, but those provider-native capabilities do not replace Phase 31.33. Before real Render cutover, the ordinary Render database credential must pass the read-only compatibility probe for Phase 31.33's current `pg_control_system()` source/target identity guard. If it does not, a separately reviewed managed-PostgreSQL-safe fail-closed identity check must be merged before deployment proceeds. See `docs/production-hosting-decision.md`.

See `docs/postgres-backup-restore-runbook.md` for the accepted logical recovery commands and local HUMAN rehearsal. Scheduled/off-site retention, encryption/key management, PITR policy, RPO/RTO, and production recovery/cutover policy remain separate work.

## Runtime fail-closed boundary

Protected production requests continue through the existing Better Auth session → active application Actor → current `app_user_roles` authorization chain. Before protected auth/session work in production, the application requires the Phase 31.32 configuration contract. Missing or unsafe production configuration is rejected rather than silently accepted through localhost/default credential fallbacks.

The Better Auth local/build fallback values remain module-construction compatibility only for non-runtime build/test paths; they do not satisfy the production request-time guard or the production preflight.

## Local development

The existing local Docker PostgreSQL workflow remains valid. Local development may use:

- `ORGANY_RUNTIME=db`
- the repository's local Docker `DATABASE_URL`
- an explicitly supplied local test `BETTER_AUTH_SECRET` of at least 32 characters
- `BETTER_AUTH_URL=http://localhost:3000`

The placeholder secret shown in `.env.example` must be replaced before running the production preflight.

For local Phase 31.33 recovery rehearsal, `ORGANY_PG_TOOL_MODE=docker-compose` can use the PostgreSQL client tools already present inside the repository's `postgres` service. This mode is loopback/local only.

## Still deferred

Phases 31.32-31.34 do not make the application fully production-ready. Separate accepted work is still required for:

- actual Render account/resource creation, billing approval, remote deployment, production data cutover, and any DNS/custom-domain action;
- completion of the managed-PostgreSQL compatibility probe/adaptation required by `docs/production-hosting-decision.md`;
- scheduled/off-site backups, retention, encryption/key management, PITR/WAL policy, RPO/RTO, and production recovery/cutover procedures;
- release/rollback automation beyond Render's basic application-deploy history;
- secret-manager integration and rotation automation;
- observability, monitoring, alerting, and identity/security telemetry;
- concrete real-world credential-delivery operations;
- any future forced-first-change or stronger public recovery policy.
