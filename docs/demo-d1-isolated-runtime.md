# Demo Stage D1 isolated public runtime

Stage D1 builds on the approved D0 safety foundation.

## Runtime contract

The axes remain independent:

```text
DATA BACKEND: memory | db
EXPERIENCE:   standard | demo
```

Normal Production keeps the existing default:

```text
ORGANY_EXPERIENCE unset/standard
ORGANY_RUNTIME=db
```

The isolated Demo deployment is:

```text
ORGANY_EXPERIENCE=demo
ORGANY_RUNTIME=memory
```

## Isolation

Demo production startup fails closed if any protected Production credential is configured, including:
- DATABASE_URL / DATABASE_URL_UNPOOLED
- POSTGRES_URL / POSTGRES_PRISMA_URL
- BETTER_AUTH_SECRET / BETTER_AUTH_URL
- CRON_SECRET
- NEON_API_KEY

Demo therefore cannot accidentally inherit the existing Production database/auth environment.

## Public entry

Stage D1 does not add a /demo route.

When the separate Demo Vercel project requests / with ORGANY_EXPERIENCE=demo, app/page.tsx validates the isolated Demo runtime before any standard runtime/auth work and renders the minimal DemoD1Shell.

The shell:
- is public;
- uses only src/demo/d1-fixture.ts;
- contains synthetic data only;
- performs no fetch;
- imports no DB/auth client;
- does not expose Planning or Catalog interactions yet.

The normal standard branch below it remains the existing protected Production flow.

## Network boundary

src/application/demo-network.ts denies:
- all /api and /api/* application paths;
- the known Production Vercel hostnames.

Future Demo data adapters must use this boundary before making application network requests.

The D1 shell itself performs no network request.

## Persistent writes

D1 keeps the D0 Demo capability/write boundary unchanged. Persistent Demo writes remain fail-closed with DemoWriteDeniedError before mutation execution.

## Vercel deployment

D1 requires a separate Vercel project, intended name:

```text
organy-app-demo
```

It must not copy or pull environment variables from the existing organy-app project.

The only application runtime variables required are:

```text
ORGANY_EXPERIENCE=demo
ORGANY_RUNTIME=memory
```

No Production deployment is part of D1.

## Acceptance

Before merge:
- D0 standard Production auth/API/write acceptance remains green;
- D1 pure isolation tests pass;
- standard Production build/root auth pass;
- a second production-mode Next build succeeds with all DB/auth/cron/Neon variables unset;
- that secret-free build boots publicly and renders the D1 shell;
- the D1 shell HTML contains no sign-in or /api dependency;
- protected DB API remains disabled under memory runtime;
- full existing CI remains green;
- no database migration is added.

After merge:
- create/link the separate Vercel project;
- set only the two Demo runtime variables;
- deploy the exact merged SHA to that project;
- verify READY, public root, D1 shell, zero runtime errors;
- verify the existing organy-app Production deployment was not changed.
