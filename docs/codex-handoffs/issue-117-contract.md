# Transport copy — GitHub issue #117

This repository file carries the approved Phase 31.9 implementation contract for environments that cannot access GitHub issues directly. GitHub issue #117 remains the sole authority. The exact starting commit is supplied by the reviewer task and recorded in issue #117.

## Product goal

Activate the frozen Czech antiphon catalog as a separate authoritative read-only runtime catalog in both memory and PostgreSQL modes.

The source artifact is:

- `data/catalog/catalog-czech-antiphons.json`
- exactly 116 records
- number range 800–915
- exact SHA-256 `9fe6f782ad62afa2d664fcb480a039a9b5dacf4bc193decb92a41d85023414e8`

This milestone exposes antiphon knowledge for later use. It does not select an antiphon in Service Context, map an antiphon to a recommended hymn, or alter candidate ranking.

## Exactly one failure domain

**Persist, synchronize and expose the frozen Czech antiphon catalog through a dedicated authoritative read-only runtime boundary without conflating antiphons with songs.**

## Dedicated persistence

Create a new table `reference_antiphons` with only the fields required for stable catalog identity and provenance:

- `id` text primary key
- `language` using the existing `song_language` enum
- `canonical_number` integer
- `title` text
- `source_url` text

Required invariants:

- current IDs are exactly `czech:<number>`;
- `(language, canonical_number)` is unique;
- number is positive;
- ID and title are non-empty after trimming;
- source URL is non-empty HTTPS on exact origin `https://www.evangelickykancional.cz`;
- no foreign key to either song catalog;
- no preference, repertoire, melody or recommendation relation in this issue.

Add the next Drizzle migration after `0011_phase_31_8_reference_melodies` and update schema metadata consistently.

## Deterministic synchronization

Add a dedicated loader and synchronizer that reads only `data/catalog/catalog-czech-antiphons.json`.

The loader must reject:

- non-array input;
- keys other than exactly `number`, `title`, `url`;
- non-integer or out-of-range numbers;
- duplicate or unordered numbers;
- empty or untrimmed titles;
- invalid URLs or any origin other than `https://www.evangelickykancional.cz`;
- any count/range/hash mismatch against Data Gate A1.

Map each accepted record to:

```text
id = czech:<number>
language = czech
canonicalNumber = <number>
title = <title>
sourceUrl = <url>
```

Synchronization must:

- validate before writes;
- run in one transaction;
- use a temporary incoming table;
- upsert exact incoming records;
- delete stale rows only from `reference_antiphons`;
- be idempotent;
- preserve prior state on injected failure;
- return exact counts `czech: 116`, `polish: 0`, `total: 116`.

Expose a concise npm command for synchronization.

## Runtime contract

Create a dedicated antiphon contract and providers, separate from `ReferenceCatalogRecord` and all song contracts.

A runtime record contains:

- `id`
- `language`
- `canonicalNumber`
- `displayNumber`
- `title`
- `sourceUrl`

The read-only query supports:

- language filter `all | czech | polish`;
- search by exact number or case-insensitive title substring;
- page and page size;
- strict ascending number order;
- stable `getById`.

Expected counts are always `116 / 116 / 0` for `all / czech / polish`.

Implement:

- bundled memory provider from the frozen JSON;
- PostgreSQL provider whose filtering, ordering, counts and paging execute in SQL;
- shared async client boundary;
- `MemoryReferenceAntiphonClient`;
- `DbReferenceAntiphonClient`;
- dedicated `POST /api/reference-antiphons` route.

The API accepts only `list` and `getById`, validates all inputs strictly, returns explicit 400/404/500 responses, requires `ORGANY_RUNTIME=db` and `DATABASE_URL`, instantiates only the PostgreSQL provider, and always closes its pool.

No database request may fall back to bundled JSON.

## Automated acceptance

Add isolated Phase 31.9 acceptance proving:

1. migration applies twice and exact table structure, constraints and indexes exist;
2. loader returns exactly 116 records, 800–915, with Data Gate A1 SHA unchanged;
3. two synchronizations are identical and stale-row deletion is scoped correctly;
4. injected failure rolls back completely;
5. PostgreSQL provider and actual API/client path return exact counts and deterministic first/middle/last records 800/858/915;
6. number search, title search, ordering, paging and `getById` work;
7. a PostgreSQL-only title mutation is visible through DB API/client and absent from memory provider, proving no fallback;
8. malformed, unsupported, mutating and invalid requests are rejected;
9. temporary acceptance database is removed and the guard database fingerprint is unchanged;
10. Engineering E1, Phases 31.2–31.8, DB migration/smoke, typecheck, full tests and build remain green.

Add one standard CI step for `verify:phase-31-9` inside the existing `verify` job. Do not create another workflow or job.

## One human checkpoint

After Automatic Review Gate PASS, the user runs exactly one PowerShell command from repository root:

```powershell
npm run verify:phase-31-9:local
```

The wrapper must start PostgreSQL, wait, migrate, synchronize, execute the same core acceptance and required regressions, clean up, and exit by itself. No second terminal, watcher, manual URL inspection or diagnosis is part of this checkpoint.

## Definition of Done

- dedicated antiphon table, migration and synchronizer are committed;
- memory and PostgreSQL read-only runtimes are implemented;
- dedicated API/client boundary is green;
- exact 116 / 0 / 116 counts and samples 800/858/915 are recorded in the Draft PR;
- exact-head CI is fully green;
- the one local checkpoint passes;
- Merge Gate passes and the user explicitly writes `MERGOVAT`.

## Explicit exclusions / forbidden changes

Do not implement or modify:

- Service Context UI or selector;
- `service_contexts.antiphon_key` or any service persistence field;
- candidate ranking, hydration or `antiphonMatch` behavior;
- `antiphon_mappings` semantics;
- recommended-song relations;
- Polish antiphon data;
- `reference_catalog_songs`, mutable `catalog_songs`, existing hymn JSON or hashes;
- preferences, repertoire or melody equivalence;
- authentication, roles or authorization;
- deployment or destructive reset behavior;
- Data Gate A1 JSON/payload/scripts;
- a dependency, test framework or permanent new CI workflow.

## Corrective boundary and stop conditions

Corrective passes may address only the dedicated antiphon schema/migration, loader/synchronizer, memory/PostgreSQL providers, antiphon API/client, isolated acceptance, npm commands and existing CI integration.

Stop and return to Review Gate if:

- implementation requires changing Service Context, candidate logic or song-domain semantics;
- the frozen catalog must be changed;
- a new product rule is needed for identity, language or URL meaning;
- another subsystem or dependency becomes necessary;
- the same architectural blocker survives two corrective passes.

## Draft PR evidence

Open exactly one Draft PR to `main` with `Closes #117` and include:

- exact baseline and current head SHA;
- migration, synchronization and verification commands;
- table and runtime boundary summary;
- exact counts and first/middle/last records;
- rollback, stale deletion, DB-only mutation and no-fallback proof;
- final standard CI on exact head;
- forbidden-area confirmation;
- human checkpoint `PENDING`.

Do not mark Ready and do not merge before Automatic Review Gate, the one human checkpoint and explicit `MERGOVAT`.
