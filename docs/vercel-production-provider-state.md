# Vercel production provider state

## Phase 31.37 scope

Current state: **PROJECT CREATED / ZERO DEPLOYMENTS / PRODUCTION ENV BOUNDARY ESTABLISHED**.

Baseline: merged and post-merge verified Phase 31.36 on `main` `2c2389f7336259b9102051486cf6f2ed04090643`.

Contract Gate: #188.

Phase 31.37 creates/configures only the Vercel application-provider boundary. It does not deploy the application, migrate/import application data, bootstrap production authentication, or perform cutover.

## Dashboard checkpoint — fail-closed history

The operator first reached Vercel **New Project** for GitHub repository `drobekj/organy-app` in the existing Hobby workspace with project name `organy-app`, detected Next.js, and root `./`.

The screen exposed only a final **Deploy** action. There was no separate create-only action. Per Contract Gate #188, the operator did **not** click Deploy. Connected Vercel verification immediately afterward confirmed that no `organy-app` project or deployment had been created.

The Dashboard import path was therefore rejected for this phase. Current Vercel primary documentation provides the create-only CLI command `vercel project add <project-name>`, which was used instead.

## Verified completed provider state

The HUMAN create-only CLI checkpoint completed with `vercel project add organy-app` in the existing Hobby workspace.

Connected read-only Vercel verification after creation and configuration establishes:

- exactly one intended project named `organy-app` exists in the expected workspace;
- framework preset: **Next.js**;
- project `live`: **false**;
- latest deployment: **none**;
- deployment count: **0**;
- no provider domain is assigned yet;
- no Git linking/deployment was performed by Phase 31.37.

The provider Project object currently reports its generic default Node setting, but repository configuration remains authoritative for the actual application runtime: `package.json` pins Node.js `22.x`. Vercel documents that `engines.node` overrides the Project setting when deploying. Likewise `vercel.json` remains authoritative for Frankfurt `fra1` and `git.deploymentEnabled=false`.

No Vercel Pro trial, paid plan, payment method, paid add-on, Marketplace database integration, Neon-managed Vercel integration, preview-database branching, or standing staging infrastructure was accepted or introduced.

## Manual Production environment-variable boundary

Only variable names, purposes, and target scoping are repository knowledge. Live values remain provider/operator secrets outside Git.

The HUMAN CLI checkpoint established the following Vercel **Production-only** variables, each reported by Vercel CLI as `Type Sensitive`:

- `ORGANY_RUNTIME` — value `db`;
- `DATABASE_URL` — Neon pooled/serverless runtime connection selected through the Neon pooled connection path;
- `BETTER_AUTH_SECRET` — stable cryptographically generated Production secret.

The commands explicitly targeted `production`; Preview and Development were not targeted and therefore did not receive these production DB/auth credentials through this phase.

`BETTER_AUTH_URL` remains deliberately **deferred**. It must equal the exact stable public Vercel Production alias, and no authoritative alias exists before the first explicit production deployment. It must not be guessed.

`DATABASE_URL_UNPOOLED` remains outside ordinary Vercel request-runtime configuration. The direct Neon connection is retained for migration, backup, restore, and recovery operator tooling only.

## Secret handling

Never record or expose in repository files, GitHub issues/PRs, CI logs, or chat-visible output:

- Vercel tokens;
- Neon tokens;
- database passwords;
- concrete PostgreSQL connection strings;
- concrete Neon hostnames;
- `BETTER_AUTH_SECRET` values;
- provider resource identifiers that are not required as non-secret project names;
- bootstrap/recovery passwords;
- deployment-hook URLs.

No `.env.production` or `.vercel/project.json` file belongs in Git.

## Post-HUMAN Neon verification

Connected Neon read-only verification after the Vercel project/environment checkpoint reports:

- non-system/application tables: **0**;
- `neon_auth` schema: **absent**;
- Data API roles `authenticated` / `anonymous`: **absent**.

Therefore Phase 31.37 caused no Neon migration, data import, auth provisioning, Data API setup, or application-schema side effect.

## Release boundary after Phase 31.37

First production remains blocked until a separately accepted migration/release slice performs the established order:

1. exact reviewed Git revision;
2. CI and Review Gate;
3. production backup when applicable;
4. direct/unpooled Neon migration boundary;
5. production preflight;
6. schema migration;
7. explicit deployment of the reviewed revision;
8. set/verify the authoritative `BETTER_AUTH_URL` from the stable Production alias;
9. protected sign-in and congregation nickname smoke verification.

Phase 31.37 alone is not a production deployment or cutover.
