# First production Neon schema migration

## Phase 31.38 state

Current state: **PRE-HUMAN / PRODUCTION NEON STILL UNMIGRATED**.

Baseline: merged and post-merge verified Phase 31.37 on `main` `53025f1f2a4dda898c9caf1755eab14f31a60968`.

Contract Gate: #190.

Phase 31.38 owns only the first application **schema migration** into the already-created, currently empty Neon production target. It does not deploy the application, import/restore application data, bootstrap a protected Account, set `BETTER_AUTH_URL`, or perform production cutover.

## Why the first migration has its own preflight

The full Phase 31.32 production runtime preflight correctly requires `BETTER_AUTH_URL`. For the first release, however, the authoritative stable Vercel Production alias does not exist until the first explicit deployment. Database schema must be migrated before that deployment so the application can never be started against an empty schema.

Phase 31.38 therefore adds a narrower **migration-only** operator boundary. It validates only the database facts required before the first schema migration and deliberately does not weaken or replace the full runtime preflight. The later deployment slice must still set the authoritative HTTPS `BETTER_AUTH_URL` and pass the full Phase 31.32 preflight before production is accepted as ready.

## Operator credential boundary

The migration command reads only the operator-held direct connection variable:

```text
DATABASE_URL_UNPOOLED=<Neon direct connection>
```

It does not require the Vercel pooled runtime `DATABASE_URL`, and it does not require `BETTER_AUTH_URL`.

Never copy the direct connection value, password, hostname, provider token, system identifier, or Better Auth secret into GitHub, repository files, CI logs, or chat-visible output.

The command rejects a connection URL whose hostname identifies the pooled endpoint. The direct/unpooled value remains an operator/recovery credential and is not added to ordinary Vercel request-runtime configuration.

## Read-only preflight

Before the HUMAN migration checkpoint, the same command can be run without an apply flag:

```text
npx tsx scripts/production-first-migrate.ts
```

This is read-only. It requires:

- a valid PostgreSQL `DATABASE_URL_UNPOOLED`;
- zero existing public application tables;
- no `neon_auth` schema;
- no Data API `authenticated` or `anonymous` roles.

It prints only PASS/FAIL-safe summaries and never prints the connection value.

If the target is not still empty, STOP. Phase 31.38 is explicitly a **first migration** path, not an update/repair path for an already initialized production database.

## Authorized migration action

Only after exact-head CI/Review Gate and fresh connected provider verification pass may the HUMAN checkpoint use:

```text
npx tsx scripts/production-first-migrate.ts --apply
```

The `--apply` form:

1. repeats the empty-target/provider-boundary checks;
2. applies the existing reviewed Drizzle migration chain through the direct/unpooled connection;
3. requires the expected public application schema to exist afterward;
4. rejects any Neon Auth/Data API state;
5. permits exactly one migration-owned data row: the reviewed `melody_non_repetition_config` singleton with `id='global'` and `months=2`;
6. requires every other public table, including `auth_users`, `app_users`, catalogs, service data, preferences and recommendations, to remain row-empty.

The configuration singleton is not imported/user/bootstrap data. It is deliberately inserted by reviewed migration 0005 and normalized by migration 0006, and represents the schema's default non-repetition setting. The stricter invariant is therefore: **no application/user/catalog/auth data beyond this exact reviewed migration-owned default**.

This proves the first migration did not silently run catalog seed/sync, demo fixtures, protected-account bootstrap, or imported application data.

The command is intentionally not reusable after the first migration: once public application tables exist, rerunning it fails closed.

## Post-migration provider acceptance

After the HUMAN write, connected read-only verification must establish:

- the intended Neon production project now contains the application schema;
- migration metadata exists and the schema is reachable;
- the only non-empty public table is the exact reviewed `melody_non_repetition_config` singleton;
- `auth_users` and `app_users` remain empty;
- all catalog/service/preference/recommendation tables remain empty;
- `neon_auth` and Data API roles remain absent;
- Vercel `organy-app` still has zero deployments;
- `BETTER_AUTH_URL` remains deferred.

No secret/provider connection value is recorded as evidence.

## Backup boundary

The current Neon production target is pre-user-data empty, so there is no application state to preserve before this one-time first schema migration. Phase 31.33 remains authoritative once production contains user/application data: later production migrations must create and verify a fresh logical backup when required by that contract.

Phase 31.38 does not weaken the source=target restore guard or any recovery invariant.

## Explicit exclusions

Phase 31.38 does **not**:

- deploy to Vercel Production or Preview;
- set or guess `BETTER_AUTH_URL`;
- install Neon Auth, Data API, Marketplace, Vercel-managed Neon, or Neon-managed Vercel integrations;
- import/restore local or historical application data;
- run catalog seed/sync commands or demo fixtures;
- run `db:bootstrap:auth`, password reset, or recovery commands;
- create the first protected production Account;
- configure custom domain/DNS;
- perform public sign-in smoke verification or production cutover;
- create a paid plan, trial, payment method, or paid add-on.

The next release slice begins only after this migration is separately accepted and merged.