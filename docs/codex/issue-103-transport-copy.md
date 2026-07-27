# Issue #103 transport copy

Source: `https://github.com/drobekj/organy-app/issues/103`

This file is a transport copy for Codex environments that cannot read GitHub Issues. Issue #103 remains the authoritative contract. If this file and issue #103 differ, stop and report the mismatch.

## Authority and baseline

This issue is the single authoritative implementation contract for Phase 31.3.

Repository: `drobekj/organy-app`

Approved baseline:

```text
main
58b8155daebb13db39bff0a88aaa4a57bed10c24
```

Start from current `main` and verify that it contains this commit.

Phase 31.2 is complete through issue #101 and PR #102. Its dedicated `reference_catalog_songs` table, transactional synchronization command and `PostgresReferenceCatalogProvider` are accepted foundations and must not be replaced or weakened.

## Current verified gap

The application still imports the in-memory `referenceCatalog` into `app/planning-lifecycle-client.tsx` and synchronously calls its `list` and `getById` methods for the Reference tab, regardless of runtime mode.

The existing `/api/catalog` route serves the mutable `catalog_songs`/people subsystem through `CatalogService` and `DrizzleCatalogRepository`; it is not the read-only reference-catalog boundary.

Therefore `ORGANY_RUNTIME=db` still does not prove that Reference-tab browsing and search come from PostgreSQL.

## Success contract

When `ORGANY_RUNTIME=db`, the existing Reference tab must read exclusively from PostgreSQL `reference_catalog_songs` through the accepted `PostgresReferenceCatalogProvider`.

When runtime is `memory`, the existing in-memory reference provider may remain available for deterministic development/tests.

The visible Reference-tab behavior must remain:

- Czech / Polish / All filtering;
- title search;
- ordinary-number, canonical-number and slash-variant search;
- natural numeric ordering;
- pagination;
- exact counts `808 / 990 / 1,798`;
- stable-record selection by ID;
- exact source link when non-null;
- clean presentation when `source_url` is null.

## Single failure domain

**The DB runtime may silently display reference-catalog data from bundled JSON/in-memory state instead of the accepted PostgreSQL snapshot.**

This milestone has exactly this one failure domain.

## Required runtime boundary

Add a separate read-only reference-catalog API/runtime boundary. A dedicated route such as:

```text
/api/reference-catalog
```

is preferred.

It must expose only:

- `list` with language, search, page and page-size input;
- `getById` with stable reference ID.

Requirements:

1. In DB runtime, instantiate `PostgresReferenceCatalogProvider` against `DATABASE_URL`.
2. Validate all request input and return explicit 4xx errors for malformed or unsupported input.
3. Return explicit 5xx configuration error when DB runtime lacks `DATABASE_URL`.
4. Always release the PostgreSQL pool.
5. Do not expose create, update, delete, active/inactive or other mutation operations.
6. Do not route this through mutable `CatalogService`, `CatalogRepository` or `catalog_songs`.
7. Do not load the final JSON files or `InMemoryReferenceCatalogProvider` anywhere in the DB request path.

## Client and UI integration

Refactor only the existing Reference-tab data access so that:

- DB runtime uses an asynchronous API client;
- memory runtime uses the accepted in-memory provider;
- filter/search/page changes request the correct page and reset paging where appropriate;
- stale/out-of-order responses cannot replace newer results;
- loading, empty and error states are explicit;
- selected-record detail is obtained through the active runtime provider/client;
- current layout and unrelated workspaces remain functionally unchanged.

A controlled database-only title change must become visible through the API/client path without changing bundled JSON, proving the DB runtime source.

## Data preparation boundary

Do not introduce a destructive local reset in this milestone.

Reuse the accepted commands:

```bash
npm run db:migrate
npm run db:sync:reference-catalog
```

The local verification wrapper must start repository PostgreSQL itself, wait for readiness, apply migrations and synchronize the dedicated table automatically. The user must not set `DATABASE_URL`, run SQL or inspect Docker manually.

## Explicit exclusions

Do not implement or modify:

- Planning song lookup or candidate selection;
- preference, repertoire, Knowledge, melody, antiphon or season behavior;
- the mutable Songs admin tab or `catalog_songs` semantics;
- synthetic-scale cleanup outside the Reference tab;
- people management;
- role or authentication behavior;
- reference-catalog mutations;
- catalog import/data correction rules already accepted in Phase 31.2;
- production deployment;
- destructive local database reset;
- broad UI redesign;
- another browser framework.

Do not change any payload, validation file, final catalog record, Phase 31.2 migration or accepted synchronization semantics.

## Main automated acceptance

Provide exactly one milestone command:

```bash
npm run verify:phase-31-3
```

It must prove in one path:

1. Phase 31.2 materialization, migration and synchronization remain green;
2. an isolated PostgreSQL database contains exactly `808 / 990 / 1,798` rows;
3. the read-only runtime/API returns exact All, Czech and Polish counts;
4. title search returns Polish `955`, title `Żegnamy was w Bogu naszym`, with its exact URL;
5. Czech `298`, title `Otevři své srdce`, and its exact URL are returned;
6. ordinary, canonical and slash searches cover accepted variant families, including Czech `751/1`, corrected `751/2`, Czech `52/1` and Polish `347/8`;
7. rejected `7521`, `752/1`, `7522` and `752/2` return no record;
8. natural ordering and pagination are deterministic;
9. `getById` returns the exact stable record;
10. a database-only mutation is visible through the runtime/API/client path;
11. the same change is absent from the bundled in-memory data, proving no fallback;
12. malformed inputs, missing DB configuration and unknown IDs are handled explicitly;
13. the DB route exposes no mutation action;
14. the memory-runtime Reference tab contract remains green;
15. existing Engineering E1, Phase 31.2 verification, typecheck, tests and build remain green;
16. the isolated database is removed and the guard database remains unchanged.

Automated proof must exercise the runtime boundary, not merely call `PostgresReferenceCatalogProvider` directly again.

## CI evidence

Add a focused CI invocation of:

```bash
npm run verify:phase-31-3
```

Keep existing E1 and Phase 31.2 checks green and unweakened.

## Single human checkpoint

After independent automatic review authorizes it, the user will run only:

```powershell
npm run verify:phase-31-3:local
```

The wrapper must:

- start repository PostgreSQL;
- wait for readiness;
- migrate and synchronize the reference catalog;
- run the same core runtime acceptance path as CI;
- require no manual environment editing, SQL, Docker diagnosis or browser debugging;
- exit automatically.

PASS requires the exact line:

```text
Phase 31.3 PostgreSQL reference catalog runtime: PASS
```

## Definition of Done

The milestone is complete only when:

1. DB runtime Reference-tab reads use the dedicated PostgreSQL provider through the read-only runtime boundary;
2. no DB runtime fallback to bundled JSON/in-memory data is possible;
3. filters, searches, ordering, pagination, counts, selection and source links satisfy the accepted contract;
4. the API is read-only and separate from mutable `catalog_songs`;
5. `npm run verify:phase-31-3` is green on the exact final head;
6. E1, Phase 31.2 and relevant regressions remain green;
7. CI is green on the exact final head;
8. the single human checkpoint passes;
9. forbidden subsystems and accepted catalog artifacts remain unchanged;
10. PR evidence is complete;
11. Merge Gate passes and the user explicitly commands `MERGOVAT`.

Green CI alone is not Definition of Done.

## Branch and pull-request discipline

- one issue: this issue;
- one implementation branch from current `main`;
- recommended branch: `codex/phase-31-3-reference-runtime`;
- one Draft PR into `main`;
- all corrections stay in the same branch and Draft PR;
- do not merge;
- do not start another milestone.

## Corrective boundary

Continue correcting the same PR only for blockers in:

- the dedicated read-only API/runtime adapter;
- Reference-tab async client state;
- DB-source proof;
- focused acceptance/CI/local wrapper;
- regressions caused by this implementation.

Stop and report instead of broadening scope if a fix would require Planning/candidate activation, mutable catalog changes, destructive reset, role/auth redesign or accepted catalog-data changes.

## Required Draft PR evidence

The Draft PR must contain:

| Acceptance item | Implementation | Automated proof | Human step | Status |
|---|---|---|---|---|

Also include:

- issue and baseline SHA;
- exact current head SHA;
- changed files grouped by purpose;
- runtime/API contract;
- proof of PostgreSQL origin through database-only mutation;
- exact filter/search/order/pagination/sample results;
- malformed/configuration error evidence;
- proof that no mutation endpoint exists;
- memory-runtime regression evidence;
- E1 and Phase 31.2 regression evidence;
- cleanup and guard-fingerprint evidence;
- forbidden-area confirmation;
- remaining human checkpoint;
- `Closes #103`.

Leave the PR Draft and stop for independent review.