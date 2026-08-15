# Production runtime configuration preflight

## Purpose

Phase 31.32 defines the minimal vendor-neutral runtime/secrets boundary required before a production deployment may be treated as correctly configured.

Phase 31.33 adds the repository's minimal logical PostgreSQL backup/restore and recovery-rehearsal baseline. The detailed procedure is in `docs/postgres-backup-restore-runbook.md`.

Phase 31.34 selects **Vercel Hobby for the Next.js application and Neon Free for PostgreSQL**, with a hard first-operation requirement of **USD 0 recurring provider cost**. The detailed dated decision, terms/limit assumptions, alternatives, and pre-cutover blockers are authoritative in `docs/production-hosting-decision.md`.

Phase 31.35 completes the repository-side runtime readiness required before provider resources may be created. `package.json` now pins **Node.js 22.x**, `pg` is now a production dependency, and `vercel.json` fixes Frankfurt (`fra1`) while keeping automatic Git deployments disabled for the migration-first manual release contract.

Phases 31.34-31.35 remain pre-provisioning work: no new Vercel project, Neon project/database, payment plan, production secret, DNS change, data cutover, or remote deployment is created by them.

## Required production runtime variables

The operator must provide all of the following outside the repository:

- `ORGANY_RUNTIME=db`
- `DATABASE_URL` — production PostgreSQL connection string used by the running application
- `BETTER_AUTH_SECRET` — a non-placeholder secret with at least 32 characters
- `BETTER_AUTH_URL` — the externally meaningful absolute application/auth URL

For the selected Neon target, the later deployment slice also keeps a separate `DATABASE_URL_UNPOOLED` for migrations and operator backup/recovery work. That direct credential is not the ordinary application-runtime URL.

A public/non-loopback `BETTER_AUTH_URL` must use HTTPS. Loopback HTTP is accepted only for local development or local acceptance.

Never commit production values, bootstrap passwords, replacement/recovery passwords, database credentials, Vercel tokens, Neon credentials, or deployment-hook URLs. `.env.example` contains only local/safe examples and placeholders.

## Preflight

Before production migration/deployment, run:

```sh
npx tsx scripts/production-preflight.ts
```

A valid configuration exits successfully and prints only a PASS summary. Invalid configuration exits non-zero and identifies the variable name and reason. The command deliberately does not print environment-variable values.

The preflight checks configuration syntax/presence only. It does not need database connectivity and does not mutate application data.

## Selected first deployment target

The accepted Phase 31.34 target is:

- the operator's existing Vercel workspace, using a separate **Hobby** project for `organy-app`;
- **Neon Free** for PostgreSQL;
- Vercel application Functions in **Frankfurt (`fra1`)**;
- Neon project in **AWS Europe (Frankfurt)**;
- free Vercel-managed `https://<project>.vercel.app` as the initial public URL;
- no custom domain, paid add-on, Vercel Pro trial, Neon paid plan, or standing staging environment required for first production.

Vercel hosts this Next.js application through its native framework/Functions model. Production does **not** run a persistent `npm start` / `next start` process.

The repository's normal framework build remains:

```text
npm run build
```

Phase 31.35 pins the production Node major in `package.json`:

```text
engines.node = 22.x
```

This overrides a different Vercel project default and keeps production aligned with the repository's Node 22 CI baseline.

### Runtime versus operator database connection

Use:

```text
DATABASE_URL=<Neon pooled connection>
DATABASE_URL_UNPOOLED=<Neon direct connection>
```

The pooled URL is for serverless application requests. Neon documents pooled connections for serverless workloads and its Vercel integration uses a pooled `DATABASE_URL` by default.

The unpooled/direct URL is for migration and Phase 31.33 operator tooling. Preserve all Neon-supplied TLS parameters in both values.

### Production packaging readiness

`src/auth/server.ts` imports `pg` in production server code, and Next.js documents `pg` as a server-external package. Phase 31.35 therefore promotes `pg` from `devDependencies` to `dependencies` and synchronizes `package-lock.json` accordingly.

Focused acceptance also performs a clean `npm ci --omit=dev` smoke and requires `require('pg')` to succeed. This demonstrates that request-time PostgreSQL support no longer depends on development-only packages.

`tsx` remains operator/build tooling for migrations and recovery scripts; it is not required by ordinary Vercel request handling. Do not make migrations, backups, restores, catalog sync, or auth bootstrap part of normal Function request handling.

### Repository Vercel configuration

Phase 31.35 adds a minimal `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1"],
  "git": {
    "deploymentEnabled": false
  }
}
```

The region setting keeps application Functions close to the selected Neon Frankfurt database. The Git setting deliberately prevents an ordinary Git push or merge from automatically deploying production before database migration is complete.

## Zero-cost release ordering

The zero-cost contract uses explicit operator-controlled deployment rather than a paid pre-deploy product.

Phase 31.35 commits `git.deploymentEnabled=false`, so automatic Git deployments remain disabled unless a later separately accepted release design changes this contract. A merge to `main` must therefore **not** automatically outrun database migration.

Until separately accepted release automation exists, release order is:

1. select the exact reviewed Git HEAD intended for production;
2. require exact-head GitHub CI/review gates to pass;
3. when production already contains user data, create and verify a fresh Phase 31.33 logical backup;
4. in an authorized operator environment, use the Neon direct/unpooled connection for migration;
5. run the Phase 31.32 production preflight and require PASS;
6. run `npm run db:migrate` and require success;
7. allow only migrations compatible with the currently live application revision until a stronger rollback/release mechanism exists;
8. explicitly deploy the exact reviewed revision to Vercel Production through the Vercel CLI/API/operator integration;
9. verify protected sign-in and the separate congregation nickname flow through the stable HTTPS `vercel.app` production alias.

Catalog seed/sync commands, demo seed commands, acceptance fixtures, password reset, backup/restore, and auth bootstrap are not part of normal production deployment.

## First protected-account bootstrap

If and only if a genuinely new production database has no protected staff Account after migration, perform the existing explicit bootstrap:

```text
npm run db:bootstrap:auth
```

Run it in an explicitly authorized operator environment against the direct/unpooled production database connection. Bootstrap credentials are temporary operator inputs and must never be persistent Vercel environment variables or repository content.

Bootstrap is not repeated during normal deploys.

## Vercel/Neon integration boundary

The later deployment slice may use the Neon Vercel integration to synchronize connection variables, but **Neon Auth must not be provisioned**. The repository keeps its existing Better Auth implementation and Account → Actor → current `app_user_roles` authorization boundary.

`BETTER_AUTH_URL` must be the exact stable public Vercel production alias. `BETTER_AUTH_SECRET` remains a stable operator-supplied production secret outside Git.

Preview deployments, if used later, must not receive the production database credential by default.

## Backup / recovery boundary

Phase 31.33 remains authoritative for logical backup, integrity verification, separate-empty-target restore, restored-session revocation, and read-only recovery checks.

For Neon:

- use the unpooled/direct connection for `pg_dump` / `pg_restore` style operator tooling;
- never use the runtime pooler merely because it is the application's `DATABASE_URL`;
- keep backup artifacts outside Git;
- preserve provider TLS parameters;
- never restore over the configured source database;
- revoke restored Better Auth sessions before recovery success.

Neon Free's short time-travel/restore window is only an additional provider facility. It does not replace Phase 31.33 or establish full DR readiness.

### Managed-PostgreSQL identity probe

Phase 31.33 currently uses `pg_control_system()` plus `current_database()` to fail closed when source and restore target are the same database.

Neon does not expose native PostgreSQL superuser access. Neon documents that Console/API-created roles are members of `neon_superuser`, and `neon_superuser` has `pg_monitor` privileges. Before cutover, the actual default Neon role must still pass the exact read-only Phase 31.33 identity probe.

If the query is denied or unavailable, deployment remains blocked until the identity mechanism is replaced with a separately reviewed managed-PostgreSQL-compatible fail-closed method and Phase 31.33 is rerun. Never disable source=target protection.

## Zero-cost failure boundary

The first hosted baseline intentionally accepts:

- no paid SLA;
- cold-start latency;
- temporary outage after free-quota exhaustion;
- limited provider-native logs/history;
- no permanent staging environment;
- manual release/migration discipline.

It intentionally rejects:

- automatic charges or plan upgrades;
- a required Vercel Pro trial/payment plan;
- a required Neon paid plan/payment method;
- a paid custom domain requirement;
- weakened auth/recovery boundaries merely to fit a free provider.

If the application becomes commercial, Vercel Hobby must no longer be assumed valid: stop or move production under a separately accepted provider/plan decision first.

## Runtime fail-closed boundary

Protected production requests continue through the existing Better Auth session → active application Actor → current `app_user_roles` authorization chain. Missing or unsafe production configuration is rejected rather than silently accepted through localhost/default credential fallbacks.

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

Phases 31.32-31.35 do not make the application fully production-ready. The immediate next provider-specific slice is **Phase 31.36**, which may create the free Vercel `organy-app` project and Neon Free project, connect the required pooled/direct database variables without committing credentials, and run the mandatory read-only Neon `pg_control_system()` compatibility probe before any data cutover.

Separate accepted work is still required for:

- actual creation/configuration of the free Vercel `organy-app` project and Neon Free project (Phase 31.36);
- the Neon `pg_control_system()` compatibility probe/adaptation (Phase 31.36 or a blocker fix immediately following it);
- actual production secrets, initial schema/data cutover, bootstrap, and remote production deployment;
- scheduled/off-site backup retention, RPO/RTO, and production recovery/cutover procedures;
- release/rollback automation beyond the manual zero-cost flow above;
- secret rotation automation;
- observability, monitoring, alerting, and identity/security telemetry;
- any future custom domain;
- any future forced-first-change or stronger public recovery policy.
