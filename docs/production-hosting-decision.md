# Production hosting/provider decision

## Status

**Phase 31.34 decision.** This document records the concrete first-production hosting and PostgreSQL target for the accepted one-congregation hosted deployment direction. It becomes repository authority when Phase 31.34 is merged.

Decision date: **2026-08-15**.

The original paid Render proposal was rejected at the HUMAN checkpoint. The governing requirement is now **USD 0 recurring provider cost for the first production baseline**. Availability, cold starts, free-tier quotas, limited observability, lack of SLA, and manual release steps are accepted tradeoffs when they are necessary to keep the recurring provider bill at zero.

Provider terms, plan limits, runtime support, and free-tier conditions are volatile. Re-check the linked primary sources immediately before creating any remote resource or deployment.

## Decision

Use **Vercel Hobby for the Next.js application and Neon Free for PostgreSQL**.

The initial production shape is:

- reuse the operator's existing Vercel account/workspace that already hosts the portfolio site;
- add one separate Vercel project for `organy-app` on the **Hobby** plan;
- create one separate Neon project on the **Free** plan;
- place Vercel Functions in **Frankfurt (`fra1`)** and the Neon project in **AWS Europe (Frankfurt)** so application compute stays close to the database;
- use the provider-managed `https://<project>.vercel.app` address as the first public URL;
- do not buy or require a custom domain;
- run the application with Vercel's native Next.js/Functions model rather than a persistent `next start` server;
- use a **pooled Neon connection** for application runtime and an **unpooled/direct Neon connection** only for migrations and Phase 31.33 operator backup/restore tooling.

This deliberately introduces only one new infrastructure service, Neon, because Vercel already supplies the web/application hosting used by the operator's portfolio. Vercel does not itself provide the PostgreSQL database required by the application, so the database remains a separate managed service even though Neon and Vercel can be tightly integrated.

## Zero-cost contract

The first production baseline must remain at **USD 0/month** for both providers.

### Vercel Hobby

As checked on 2026-08-15:

- Vercel's Terms of Service allow Hobby for **personal or non-commercial use**;
- this congregation application is accepted for Hobby only while it remains genuinely non-commercial;
- Hobby has no billing cycle and does not charge additional usage when a Hobby quota is exceeded; service/features may instead be paused until limits reset or the operator takes action;
- relevant included limits currently include 1,000,000 Function invocations, 4 CPU-hours, 360 GB-hours provisioned memory, and 100 GB Fast Data Transfer within the fair-use guidance;
- Hobby allows many more projects/deployments than this application is expected to need.

If the application becomes commercial, monetized, sold as a service, or otherwise stops fitting Vercel's non-commercial Hobby terms, production use must stop or move to a separately accepted paid/alternative host before that commercial use begins.

Do **not** start a Vercel Pro trial, add a paid plan, or introduce a paid add-on merely to make the first deployment work. Free-quota exhaustion is allowed to cause a temporary outage rather than silently creating a bill.

### Neon Free

As checked on 2026-08-15, Neon Free is **USD 0 with no time limit and no credit card required**. The current per-project baseline includes:

- 100 CU-hours of compute per month;
- 0.5 GB storage;
- compute scale-to-zero after inactivity;
- 5 GB monthly public network transfer;
- a limited six-hour time-travel/restore window.

If the Free public-transfer quota is exceeded, Neon documents suspension of compute until the next billing cycle or upgrade. That behavior is acceptable for the zero-cost baseline. Do not upgrade to Launch/Scale automatically and do not configure a paid fallback.

Provider-native time travel is useful but does **not** replace the repository's Phase 31.33 logical backup/integrity/restore baseline.

## Why Vercel + Neon

This pair is selected because it minimizes both cash cost and operational novelty for this project:

- the operator already uses Vercel for the portfolio, so application hosting stays in the existing provider/workspace;
- Vercel is the native hosting platform for Next.js and automatically turns server-side Next.js routes/actions into managed Functions;
- Vercel Functions can connect to external databases and scale down when idle;
- Vercel and Neon both have Frankfurt infrastructure, reducing application-to-database latency;
- Neon explicitly supports Vercel/serverless workloads and provides pooled connection strings for them;
- the Neon Vercel integration uses a pooled `DATABASE_URL` by default and provides an unpooled `DATABASE_URL_UNPOOLED` for tools that need a direct connection;
- both selected plans can remain at zero recurring provider cost under the expected small-congregation load;
- Vercel Hobby does not bill overages, while Neon Free suspends compute rather than silently charging when the relevant free transfer quota is exhausted.

The result is still two technical services because an application server and a durable PostgreSQL database are different resources, but only one **additional** provider must be introduced beyond the already-used Vercel account.

## Concrete deployment contract

### Application runtime

Use Vercel's native **Next.js** framework deployment and Node.js Functions. Do not run a persistent `npm start` / `next start` server in production.

The later provider-specific deployment slice must pin **Node.js 22.x**, matching the repository's current Node 22 CI baseline. Vercel currently supports Node 24.x, 22.x, and 20.x, with 24.x the default for new projects; therefore the pin must be explicit rather than relying on the provider default.

Normal framework build remains:

```text
npm run build
```

The later deployment slice may express the Node pin through Vercel project settings or a reviewed `package.json` `engines.node` entry. It must not silently adopt Node 24 merely because that is the provider default.

### Function/database locality

Configure the Vercel application Functions to **Frankfurt (`fra1`)** and create the Neon project in **AWS Europe (Frankfurt)**.

Vercel explicitly recommends running Functions close to their data source. The current application is small and single-database, so one primary application region is simpler than multi-region compute.

### Required production environment

The production Vercel project must receive these values outside Git:

```text
ORGANY_RUNTIME=db
DATABASE_URL=<Neon pooled production connection URL>
DATABASE_URL_UNPOOLED=<Neon direct production connection URL>
BETTER_AUTH_SECRET=<stable operator-supplied production secret>
BETTER_AUTH_URL=https://<actual-organy-project>.vercel.app
```

`DATABASE_URL` is the application-runtime credential. The Neon Vercel integration is expected to supply a pooled connection for serverless use.

`DATABASE_URL_UNPOOLED` is an operator/migration/recovery credential and must **not** replace the pooled runtime URL in ordinary application requests.

Preserve all TLS/SSL parameters supplied by Neon. Do not rewrite a provider-generated URL to resemble the local Docker URL.

`BETTER_AUTH_URL` must equal the stable public HTTPS production alias actually used by users. The first deployment uses the free Vercel-managed `vercel.app` hostname. A custom domain is unnecessary and remains later optional work.

### Production packaging prerequisite

The current repository is not yet ready for Vercel production solely because the provider decision is accepted.

`src/auth/server.ts` imports `pg` in production server code while `package.json` currently lists `pg` under `devDependencies`. Next.js documents `pg` as a server-external package. The later deployment slice must therefore move runtime `pg` to `dependencies` (or establish an equivalently explicit production-runtime packaging contract) and rerun build/runtime acceptance.

`tsx` may remain an operator/build tooling dependency if migrations and operator scripts run outside the Vercel request runtime. Do not add migration/recovery commands to normal Function request handling.

### Release ordering without a paid pre-deploy product

The zero-cost baseline intentionally uses a conservative, operator-controlled release flow.

Vercel Git auto-deployment must be **disabled for this project before real production use** (for example with reviewed `git.deploymentEnabled=false` configuration or an equivalent project setting). This prevents a merge to `main` from reaching production before database preflight/migration is complete.

Until a later release-automation phase replaces this manual flow, a production release is:

1. identify the exact reviewed Git HEAD intended for production;
2. require the repository's exact-head CI/review gates to pass;
3. make a fresh Phase 31.33 logical backup and verify its integrity when an existing production database already contains user data;
4. in an authorized operator environment, map the Neon **unpooled/direct** production connection to the migration process;
5. run `npx tsx scripts/production-preflight.ts` and require PASS;
6. run `npm run db:migrate` and require success;
7. require migrations to be backward-compatible with the currently live revision until release/rollback automation exists;
8. deploy that exact reviewed revision to Vercel Production explicitly through the Vercel CLI/API/operator integration;
9. verify protected sign-in and the separate congregation nickname-preference flow at the production `vercel.app` URL.

No catalog seed/sync, demo seed, auth bootstrap, password reset, recovery command, or test fixture runs automatically as part of ordinary deployment.

### First protected-account bootstrap

For a genuinely new database with no protected staff Account, run the existing explicit operator command only after schema migration succeeds:

```text
npm run db:bootstrap:auth
```

The command runs from an explicitly authorized operator environment using the direct/unpooled production database connection. Bootstrap credentials are temporary operator inputs, never persistent Vercel environment variables and never repository content.

Bootstrap is a one-time initialization action, not part of every deployment.

### Environment separation

The first hosted baseline has **one persistent Production environment only**.

Local development and GitHub CI remain the default pre-production validation path. Optional Vercel Preview deployments may be added later or created manually, but they must not receive the production database credential by default. A standing staging database/environment is not required for the zero-cost first deployment.

### Vercel/Neon integration boundary

The later deployment slice may use the Neon Vercel integration because it can synchronize the pooled production `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED` into the Vercel project. The integration must not provision Neon Auth or replace the repository's existing Better Auth model.

This project retains its own accepted Better Auth tables, Account → Actor link, roles, protected sessions, and nickname-only congregation identity behavior. Neon is selected only as PostgreSQL infrastructure.

## Phase 31.33 recovery compatibility

Phase 31.33 remains the authoritative logical recovery baseline.

For production backup/restore tooling:

- use the direct/unpooled Neon connection rather than the serverless pooler;
- preserve Neon-required TLS parameters;
- keep backup artifacts outside Git as sensitive data;
- restore only to a separate explicit empty target;
- revoke restored Better Auth sessions before declaring recovery success;
- never restore destructively over the configured source database.

### Mandatory read-only compatibility probe

Phase 31.33 currently distinguishes source from restore target using `current_database()` plus `pg_control_system().system_identifier`.

Neon is managed PostgreSQL and does not expose the native PostgreSQL superuser. Its default API/Console-created roles are members of Neon's `neon_superuser` role, and Neon documents that `neon_superuser` receives PostgreSQL `pg_monitor` privileges. That makes compatibility plausible but does **not** prove this exact Phase 31.33 function call is available in the selected project.

Therefore, before any real data cutover, run this read-only probe with the ordinary Neon production role:

```sql
select current_database(),
       (select system_identifier::text from pg_control_system());
```

If it succeeds, keep the current Phase 31.33 identity guard.

If it is denied or otherwise unavailable, **do not weaken or bypass source=target protection**. First replace only the identity mechanism with a separately reviewed managed-PostgreSQL-compatible fail-closed check and rerun the complete Phase 31.33 acceptance.

No Neon project exists yet, so this probe intentionally remains a blocking prerequisite for the next provider-specific deployment slice.

## Free-tier failure modes we explicitly accept

Zero recurring cost is the governing product constraint. Therefore the first production baseline accepts:

- no paid SLA;
- possible cold-start latency after Vercel/Neon scale-to-zero behavior;
- temporary application outage if a free quota is exhausted;
- limited provider-native logs/metrics/history compared with paid tiers;
- manual release/migration discipline instead of paid release controls;
- only Neon Free's short provider-native time-travel window;
- no permanent staging environment.

It does **not** accept silent billing, automatic plan upgrades, weakened authentication, data-loss-by-design, destructive restore, or removal of the Phase 31.33 backup requirement.

## Alternatives considered

### Netlify Free + Neon Free

Technically viable and also zero-cost, but it would introduce a new application-hosting provider even though the operator already uses Vercel and the application is Next.js. It remains the first fallback if Vercel Hobby terms or platform behavior later cease to fit the non-commercial application.

### Render Free Web + Neon Free

Closer to a conventional persistent Node server, but Render Free web services spin down after inactivity and are explicitly positioned by Render as unsuitable for production workloads. It adds a new web-hosting provider without removing the need for Neon.

### Cloudflare Workers Free + Neon Free

Potentially generous free request capacity, but it requires more runtime adaptation away from the application's current Node/Next.js assumptions. The extra engineering complexity is not justified while Vercel Hobby can run this non-commercial Next.js application directly.

### Paid Render / paid Vercel / paid Neon

Rejected for the first baseline because the user requires zero recurring provider cost. They remain possible future upgrade paths only after a separate explicit decision.

## Operator ownership

The single technical operator owns:

- the existing Vercel workspace and new `organy-app` Vercel project;
- the Neon project;
- free-plan/terms verification before deployment;
- production environment variables/secrets;
- manual migration and explicit production deployment ordering;
- one-time protected-account bootstrap when needed;
- Phase 31.33 logical backup/recovery actions;
- credential rotation and incident response until a later operations phase changes ownership.

Application users (admin, priest, organist, congregation nickname voters) are **not Vercel or Neon workspace users** merely because they use the application.

## Preconditions before the later real deployment/cutover

A later provider-specific deployment slice may create resources only after all of the following are re-checked:

1. Phase 31.34 is merged and this zero-cost decision remains accepted.
2. The existing Vercel workspace is still on a zero-cost Hobby basis suitable for non-commercial use; no Pro trial/payment plan is required.
3. Neon Free remains USD 0 without a required credit card/time-limited database.
4. Vercel and Neon Frankfurt regions remain available.
5. The later slice fixes production packaging for runtime `pg` and explicitly pins Node 22.x.
6. Vercel automatic Git production deployment is disabled so migration can precede explicit deployment.
7. The Neon project is connected so runtime receives a pooled URL and operator tooling can obtain a direct/unpooled URL without committing credentials.
8. A stable production `BETTER_AUTH_SECRET` is generated and stored outside Git.
9. The ordinary Neon role passes the read-only Phase 31.33 `pg_control_system()` compatibility probe, or the separately reviewed fail-closed identity adaptation is merged first.
10. Exact-head Phase 31.32 preflight, Phase 31.33 recovery acceptance, complete tests, typecheck, and production build are green.
11. If existing application data is migrated, a fresh source logical backup is created and verified before cutover.
12. The operator explicitly approves resource creation/data cutover at the later HUMAN checkpoint.

## Explicitly not performed in Phase 31.34

Phase 31.34 does not:

- create the new Vercel `organy-app` project;
- create a Neon project/database/branch;
- install or authorize the Neon Vercel integration;
- add a payment method, start a Pro trial, or authorize any charge;
- deploy the application remotely;
- migrate or copy production data;
- buy/change a domain or DNS record;
- create production credentials or secrets;
- change `package.json`, application runtime code, schema, auth behavior, or nickname behavior;
- configure scheduled/off-site backup retention, RPO/RTO, HA, replication, or failover;
- automate release rollback;
- add monitoring/alerting/telemetry;
- provision Neon Auth;
- introduce OAuth/passkeys/2FA/public recovery or multi-congregation behavior.

## Primary sources checked 2026-08-15

Vercel:

- Terms of Service, Hobby plan: https://vercel.com/legal/terms
- Hobby plan and included usage: https://vercel.com/docs/plans/hobby
- Limits: https://vercel.com/docs/limits
- Fair-use guidance: https://vercel.com/docs/limits/fair-use-guidelines
- Functions/runtime model: https://vercel.com/docs/functions
- Regions (`fra1`): https://vercel.com/docs/regions
- Supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Git deployment control: https://vercel.com/docs/project-configuration/git-configuration
- Deployment methods / CLI: https://vercel.com/docs/deployments/overview

Neon:

- Free pricing/limits: https://neon.com/pricing
- Connection pooling: https://neon.com/docs/connect/connection-pooling
- Vercel manual integration: https://neon.com/docs/guides/vercel-manual
- Vercel pooled/unpooled integration variables: https://neon.com/docs/changelog/2024-02-23
- PostgreSQL compatibility / `neon_superuser`: https://neon.com/docs/reference/compatibility
- Frankfurt infrastructure reference: https://neon.com/docs/changelog/2026-02-20
- Free public transfer suspension behavior: https://neon.com/docs/introduction/network-transfer

PostgreSQL:

- PostgreSQL 16 predefined monitoring roles: https://www.postgresql.org/docs/16/predefined-roles.html
- PostgreSQL 16 system information functions: https://www.postgresql.org/docs/16/functions-info.html
