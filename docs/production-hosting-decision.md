# Production hosting/provider decision

## Status

**Phase 31.34 decision.** This document records the concrete first-production hosting and PostgreSQL target selected for the accepted one-congregation hosted deployment direction. It becomes repository authority when Phase 31.34 is merged.

Decision date: **2026-08-15**.

Provider plan/pricing/runtime facts in this document are intentionally dated and must be re-checked against the linked primary sources immediately before any account, billing, resource creation, or production deployment action.

## Decision

Use **Render for both the application web service and PostgreSQL** for the first real production deployment.

The initial production shape is:

- one Render **Hobby workspace** owned by the single technical operator;
- one Render project with one **Production** environment only;
- one paid **Starter Node web service** in **Frankfurt**;
- one paid **Basic-256mb Render Postgres** database in **Frankfurt**, initially **PostgreSQL 16** with the minimum practical storage allocation;
- the web service connects to PostgreSQL through Render's same-region internal/private connection URL;
- the first public application address is the Render-managed `https://<service>.onrender.com` URL;
- a custom congregation domain is optional later work and is not required for first cutover.

This decision deliberately chooses a conventional persistent Node web service instead of a serverless-specific architecture. The current application already builds with `next build`, runs with `next start`, depends on PostgreSQL, and contains server-side protected-session/application logic. Render documents full Next.js applications with server-side logic as Node web services.

## Why Render

The first production deployment is small, single-congregation, and expected to have one technical operator. The main optimization target is therefore **low operational complexity with a real always-on shared web app and managed PostgreSQL**, not the absolute lowest possible compute price or infrastructure flexibility.

Render fits that shape particularly well:

- the application and database can live at one provider and in the same Frankfurt region;
- Render directly supports a full Next.js app as a Node web service with explicit build/start commands;
- Render provides managed PostgreSQL with same-region private connectivity;
- public web services receive a Render URL and managed TLS; custom-domain TLS is also managed automatically if added later;
- paid web services support a pre-deploy command suitable for database migrations;
- environment variables are a first-class provider mechanism, so repository-owned production credentials are unnecessary;
- paid Render Postgres provides point-in-time recovery and downloadable logical exports in addition to the repository's own Phase 31.33 logical recovery baseline;
- the provider documents ordinary `pg_dump`/`pg_restore` workflows, preserving the project's vendor-neutral logical recovery direction.

Render's July 2026 small-business cost example states that an always-on Starter web service plus Basic-256mb Postgres in a Hobby workspace typically cost about **USD 13/month before bandwidth and storage growth**. This is only a planning estimate, not a purchasing commitment. As of the Phase 31.34 decision date, the Hobby workspace itself has no monthly plan fee, is limited to one workspace member, includes 5 GB outbound bandwidth and 500 build-pipeline minutes, and allows up to 25 services. The chosen deployment has one technical operator, so that workspace constraint is acceptable initially. If technical operations later require multiple Render workspace members or production-team governance, the workspace should move to Pro rather than sharing one provider login.

No free Render Postgres instance is acceptable for production: Render documents that Free Postgres expires after 30 days and does not provide the paid recovery capabilities used in this decision.

## Concrete deployment contract

### Runtime

Use Render's native **Node** web-service runtime, not Docker, for the first deployment.

Pin the Render service to:

```text
NODE_VERSION=22.22.0
```

The repository's CI currently uses Node 22, and Render documents `22.22.0` as an available historical default while its current new-service default is Node 24.14.1. Pinning Node 22 prevents a provider default-major-version change from silently changing production. Next.js 16 supports Node 22; no container adaptation is required for the selected baseline.

The Render service commands are:

```text
Build Command:
npm ci --no-audit --no-fund && npm run build

Pre-Deploy Command:
npx tsx scripts/production-preflight.ts && npm run db:migrate

Start Command:
npm start
```

The pre-deploy command is part of the production safety contract. A deployment must not start a new application revision if Phase 31.32 production configuration preflight fails or if migrations fail.

### Required application environment

Render service environment variables must provide:

```text
ORGANY_RUNTIME=db
DATABASE_URL=<Render Postgres internal connection URL>
BETTER_AUTH_SECRET=<stable operator-supplied production secret>
BETTER_AUTH_URL=https://<actual-public-service-name>.onrender.com
NODE_VERSION=22.22.0
```

`BETTER_AUTH_SECRET`, database credentials, bootstrap passwords, replacement passwords, provider access tokens, and other credentials are never committed to the repository.

`DATABASE_URL` for the running application should use Render's internal/private database connection URL because the app and database are deliberately placed in the same Frankfurt region.

`BETTER_AUTH_URL` must equal the externally meaningful HTTPS URL users actually use. For the first production cutover this is the exact Render-managed `https://...onrender.com` service URL. If a custom domain is accepted later, changing the canonical application URL also requires an explicit coordinated `BETTER_AUTH_URL` change and verification.

Render terminates public HTTPS for web services. If a custom domain is added later, Render also documents automatic certificate issuance/renewal and HTTP-to-HTTPS redirect.

### PostgreSQL

Create Render Postgres in **Frankfurt** and explicitly select **PostgreSQL 16** for first production, matching the repository's current local/CI PostgreSQL 16 baseline. Render currently supports PostgreSQL major versions 13 through 18 for new databases, so version 16 does not require adopting a new database major version during deployment.

Application traffic uses the internal Render connection URL. Operator actions performed from outside Render — for example a Phase 31.33 local logical backup/recovery rehearsal — use the provider's external connection URL and should restrict external database access to the operator's current trusted IP/CIDR whenever practical.

Any TLS/SSL parameters required by the connection URL supplied by Render must be preserved. Do not rewrite a provider-generated connection URL merely to make it resemble the local Docker URL.

### Migration and startup ordering

For every normal production deploy:

1. Render builds the exact Git revision.
2. Render runs `npx tsx scripts/production-preflight.ts`.
3. Only after preflight PASS, Render runs `npm run db:migrate`.
4. Only after the pre-deploy command succeeds, Render starts the new revision with `npm start`.
5. After the service is live, verify the protected sign-in path and the separate congregation nickname-preference path through the public HTTPS URL.

Normal production deploys must **not** run catalog seed/sync, demo seed, protected-account bootstrap, password reset, or recovery commands implicitly.

### First protected-account bootstrap

A protected staff bootstrap is allowed only for a genuinely new deployment where migrations have succeeded and no protected staff Account exists yet.

Use the existing explicit operator command:

```text
npm run db:bootstrap:auth
```

Run it manually from a paid Render service shell/ephemeral shell or another explicitly authorized operator environment that has the production database connection. Bootstrap credentials are supplied temporarily for that one command and are not stored as normal persistent application environment variables.

After bootstrap, verify protected sign-in and remove any temporary bootstrap-only environment values from the operator session. Never add bootstrap to the Render Start or Pre-Deploy command.

### Environment separation

The first production deployment has **one persistent Production environment only**. A standing staging environment is not required initially.

Local development plus exact-head GitHub CI remain the pre-production validation path. This keeps the small-congregation baseline inexpensive and operationally simple. A persistent staging environment or Render preview environments may be accepted later if production-change risk justifies their recurring operational cost and data-isolation work.

### Release and rollback boundary

Render deployment history may be used to redeploy/roll back an application build, but **an application rollback does not reverse database migrations**. Phase 31.34 therefore does not claim end-to-end rollback automation.

Any later migration that is not backward-compatible with the previous application revision requires its own release/cutover reasoning. Release/rollback automation remains a separately accepted production-hardening slice.

## Phase 31.33 logical recovery compatibility

Render's official PostgreSQL documentation supports standard logical export/restore workflows using external database URLs, `pg_dump`, and `pg_restore`. This is compatible in principle with the Phase 31.33 custom-format logical archive approach.

Provider-native PITR and Render logical exports are useful additional recovery capabilities, but they **do not replace** the repository's accepted Phase 31.33 logical backup/integrity/separate-target recovery boundary. Backup frequency, off-site retention, encryption/key management, PITR policy, RPO/RTO, and production recovery ownership remain later Contract Gates.

### Mandatory managed-PostgreSQL compatibility probe before real cutover

One compatibility question is deliberately left as a **blocking prerequisite for the later real deployment slice**, not guessed here.

Phase 31.33 currently verifies that source and restore target are not the same database by querying `pg_control_system()` and comparing PostgreSQL `system_identifier` plus database name. PostgreSQL documents `pg_control_system()` as the function exposing `system_identifier`. Render documents that Render Postgres does **not provide superuser access**.

Before any real production cutover, the default Render Postgres credential must therefore be tested read-only with the exact Phase 31.33 identity query (or an equivalent focused probe):

```sql
select current_database(),
       (select system_identifier::text from pg_control_system());
```

If the query succeeds for the ordinary Render-managed database user, the existing 31.33 identity guard remains usable.

If the query is denied or otherwise unavailable, **do not weaken or bypass the source=target protection**. The next provider-specific deployment slice must first replace that identity check with a managed-PostgreSQL-compatible, fail-closed method and rerun the complete Phase 31.33 acceptance before production deployment proceeds.

This probe is intentionally not performed in Phase 31.34 because this phase creates no provider account or remote database.

## Provider-native recovery notes

Paid Render Postgres currently provides point-in-time recovery. On a Hobby workspace the documented recovery window is three days. A PITR operation creates a **new database instance** rather than overwriting the original, which is consistent with this project's preference for isolated recovery validation.

Render also allows creating downloadable logical exports and documents direct `pg_dump` exports. These are useful provider facilities, but policy for scheduling, retention, off-site copies, and encryption is explicitly deferred.

## Cost and capacity assumption — time-sensitive

Planning baseline as checked on **2026-08-15**:

- Hobby workspace: USD 0/month workspace fee, one workspace member;
- paid Starter web service + paid Basic-256mb Postgres: Render's July 2026 published example estimates approximately **USD 13/month** before bandwidth/storage growth;
- Hobby currently includes 5 GB outbound bandwidth and 500 standard build-pipeline minutes monthly; overages can add cost;
- PostgreSQL storage is billed separately and can grow; current flexible-plan documentation states USD 0.30/GB-month;
- custom-domain registration, if ever desired, is external to this estimate; Render-managed TLS itself does not require a separate certificate purchase.

**Re-check all prices, plan names, included usage, region availability, runtime defaults, and database limits immediately before creating resources.** This document is not authorization to incur cost.

## Alternatives considered

### Vercel Pro + Neon Launch — strong secondary option

This is technically attractive because Vercel is Next.js-native and Neon is managed serverless PostgreSQL. It was not selected for the first production baseline because it splits operations and credentials across two providers without solving a current application requirement that Render cannot satisfy.

At the decision date, Vercel Pro is USD 20/month with included usage credit, while Neon's Launch plan is usage-based and its own pricing page gives USD 15/month as a representative intermittent 1 GB workload. The resulting planning example is materially above the Render small-app baseline before considering workload differences. Vercel Hobby is described by Vercel as a personal-project/developer plan, so this decision does not use the free Hobby tier as the production comparison baseline.

Keep Vercel + Neon as the first fallback if Render's Next.js runtime behavior, PostgreSQL compatibility probe, or operational experience proves unsuitable.

### Railway — lower-cost/usage-based secondary option

Railway remains a viable one-provider Node/PostgreSQL alternative. Its Hobby plan is currently a USD 5 minimum usage commitment with included usage credit and global regions; Pro is USD 20 minimum usage.

It was not selected because Phase 31.34 prioritizes the clearest small-production managed-Postgres/recovery operating model and predictable one-provider deployment path over the lowest possible usage bill. Render's first-class managed Postgres resource, same-region private connection guidance, explicit PITR/logical export documentation, and published small-app cost example give the operator a narrower initial runbook.

If Render later proves unsuitable, Railway should be re-evaluated from current primary documentation rather than from this dated comparison.

## Operator ownership

For the first deployment, the single technical operator owns:

- Render workspace and billing decisions;
- production service/database creation;
- production environment-variable and secret entry;
- migration execution through the accepted pre-deploy command;
- explicit first-account bootstrap when required;
- deploy/rollback decision;
- Phase 31.33 logical backup/recovery actions;
- provider-native recovery actions if separately accepted;
- credential rotation and incident response until a later operations slice changes ownership.

Application end users (admin, priest, organist, congregation nickname voters) are **not Render workspace users** merely because they use the application.

## Preconditions before a later real deployment/cutover

A later deployment slice may create Render resources only after all of the following are re-checked:

1. Phase 31.34 is merged and this provider decision remains acceptable.
2. Render's current plan/pricing/runtime/PostgreSQL/region documentation is re-verified.
3. Exact production service/database names and the resulting public `onrender.com` URL are chosen.
4. A stable production `BETTER_AUTH_SECRET` is generated and stored outside Git.
5. The database connection strategy is confirmed: internal URL for app runtime, controlled external URL only for operator tooling that needs it.
6. PostgreSQL 16 availability in Frankfurt is confirmed.
7. The ordinary Render database user passes the read-only Phase 31.33 `pg_control_system()` compatibility probe, **or** the separately reviewed managed-Postgres-safe identity-guard adaptation is merged first.
8. The exact-head production build, Phase 31.32 preflight acceptance, Phase 31.33 recovery acceptance, and regression CI are green.
9. A fresh logical backup of any source data intended for cutover exists and its integrity has been verified if production data is being migrated.
10. The operator explicitly approves any account creation, billing commitment, DNS action, data migration, or other remote side effect required by the later slice.

## Explicitly not decided or performed here

Phase 31.34 does not:

- create a Render account/workspace/service/database;
- enter billing details or authorize charges;
- deploy the application remotely;
- migrate production data;
- buy or change a domain or DNS record;
- create production credentials or application secrets;
- configure scheduled/off-site backup retention;
- establish PITR retention policy, RPO/RTO, HA, replication, or failover;
- automate release rollback;
- add monitoring/alerting/telemetry;
- change the Account → Actor → `app_user_roles` authorization model;
- change congregation nickname identity behavior;
- introduce OAuth/passkeys/2FA/public recovery or multi-congregation behavior.

## Primary sources checked 2026-08-15

Render:

- Next.js deployment: https://render.com/docs/deploy-nextjs-app
- Next.js SSR/API deployment patterns: https://render.com/articles/how-to-deploy-next-js-applications-with-ssr-and-api-routes
- Web services: https://render.com/docs/web-services
- Deploy/pre-deploy/start commands: https://render.com/docs/deploys
- Node version selection: https://render.com/docs/node-version
- Environment variables and secrets: https://render.com/docs/configure-environment-variables
- Regions/private networking: https://render.com/docs/regions
- Projects/environments: https://render.com/docs/projects
- Custom domains/TLS: https://render.com/docs/custom-domains
- Render Postgres overview: https://render.com/docs/postgresql
- Create/connect Render Postgres: https://render.com/docs/postgresql-creating-connecting
- Flexible Postgres plans: https://render.com/docs/postgresql-refresh
- Render Postgres recovery/backups: https://render.com/docs/postgresql-backups
- Render Postgres no-superuser note: https://render.com/docs/postgresql-pg-repack
- SSH/shell access: https://render.com/docs/ssh
- Workspace plan changes: https://render.com/docs/new-workspace-plans
- July 2026 small-business cost example: https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses

PostgreSQL:

- PostgreSQL 16 system information functions (`pg_control_system`): https://www.postgresql.org/docs/16/functions-info.html

Alternatives:

- Vercel pricing: https://vercel.com/pricing
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- Vercel Pro plan: https://vercel.com/docs/plans/pro-plan
- Neon pricing: https://neon.com/pricing
- Railway pricing: https://railway.com/pricing
- Railway billing model: https://docs.railway.com/pricing/understanding-your-bill
