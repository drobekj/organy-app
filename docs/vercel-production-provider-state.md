# Vercel production provider state

## Phase 31.37 scope

Current state: **PRE-HUMAN / PROJECT NOT YET CREATED**.

Baseline: merged and post-merge verified Phase 31.36 on `main` `2c2389f7336259b9102051486cf6f2ed04090643`.

Contract Gate: #188.

Phase 31.37 is the Vercel-provider counterpart to the completed Neon Phase 31.36. It may create/configure exactly one Vercel Hobby project for the application and establish the manual Production environment-variable boundary, but it must not deploy the application, migrate or import application data, bootstrap production authentication, or perform cutover.

## Verified pre-HUMAN provider state

Connected read-only Vercel inspection before provider creation found no `organy-app` project. The workspace contains only the pre-existing unrelated `drobek-portfolio` project.

Therefore, before the HUMAN provider step:

- intended Vercel project `organy-app`: **absent**;
- `organy-app` deployments: **zero because the project does not yet exist**;
- production/preview application deployment: **not performed**;
- managed Neon/Vercel integration: **not installed**;
- custom domain/DNS: **not configured**;
- production Vercel environment-variable values: **not recorded in Git**.

The already-created Neon project remains the separate PostgreSQL provider target from Phase 31.36. Phase 31.37 must not mutate its schema, data, Auth, Data API, branches, or recovery boundary.

## Accepted Vercel project boundary

The HUMAN provider action must create/configure exactly one project named `organy-app` in the operator's existing Vercel workspace while remaining inside the accepted Hobby / zero-recurring-cost boundary.

Repository configuration remains authoritative:

- framework: Next.js;
- Node.js: `22.x` from `package.json`;
- Functions region: Frankfurt `fra1` from `vercel.json`;
- Git automatic deployment: disabled by `git.deploymentEnabled=false`.

The GitHub repository may be linked only if that operation does not trigger a remote deployment. If the Vercel Console cannot finish project creation/configuration without starting a deployment, the HUMAN step must stop and Phase 31.37 remains blocked.

No Vercel Pro trial, paid plan, payment method, credit purchase, paid add-on, Marketplace database integration, Neon-managed Vercel integration, preview-database branching, or standing staging infrastructure is authorized.

## Manual Production environment-variable boundary

Only variable names, purposes, and target scoping are repository knowledge. Live values remain provider/operator secrets outside Git.

Production runtime boundary:

- `ORGANY_RUNTIME` — Production target, value `db`;
- `DATABASE_URL` — Production-only Neon pooled/serverless runtime connection;
- `BETTER_AUTH_SECRET` — Production-only stable secret, at least 32 characters;
- `BETTER_AUTH_URL` — exact stable public Vercel Production alias when that alias is authoritative.

Operator/release boundary:

- `DATABASE_URL_UNPOOLED` — Neon direct connection retained for migration, backup, restore, and recovery tooling; it is not an ordinary Vercel request-runtime variable.

Preview and Development targets must not receive the production `DATABASE_URL` or production `BETTER_AUTH_SECRET` by default.

`BETTER_AUTH_URL` must not be guessed before a stable Production alias exists. If the alias is not authoritative until the first explicit deployment, setting this value remains deferred to the release/cutover slice.

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

## Post-HUMAN verification required

After the HUMAN provider step, this document must be updated only from connected read-only provider evidence. Acceptance must establish, without recording secrets:

1. exactly one intended `organy-app` Vercel project exists in the expected workspace;
2. the project has **zero deployments** at the end of Phase 31.37;
3. Git linking did not trigger Preview or Production deployment;
4. no managed Neon integration or paid add-on was introduced;
5. non-secret project settings exposed by the provider are consistent with the repository contract;
6. Production environment-variable target scoping is correct to the extent safely verifiable without surfacing values;
7. Preview/Development do not inherit production DB/auth secrets by default;
8. connected Neon remains unchanged and empty of application schema/data;
9. no application/auth/DB-schema behavior changed in this phase.

Provider facts that cannot be read through connected tooling must remain HUMAN-verification facts; the repository must not invent machine-readable evidence.

## Release boundary after Phase 31.37

Even after successful project creation/configuration, first production remains blocked until a separately accepted migration/release slice performs the established order:

1. exact reviewed Git revision;
2. CI and Review Gate;
3. production backup when applicable;
4. direct/unpooled Neon migration boundary;
5. production preflight;
6. schema migration;
7. explicit deployment of the reviewed revision;
8. protected sign-in and congregation nickname smoke verification.

Phase 31.37 alone is not a production deployment or cutover.
