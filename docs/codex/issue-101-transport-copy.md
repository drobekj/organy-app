# Phase 31.2 — PostgreSQL persistence of the real reference catalog

> Transport copy of GitHub issue `drobekj/organy-app#101` for a Codex environment without GitHub access.
> The GitHub issue remains the single authoritative implementation contract. This file does not modify or supplement it.

## Authority and baseline

This issue is the single authoritative implementation contract for Phase 31.2.

Repository: `drobekj/organy-app`

Approved baseline:

```text
main
c5146eab27145daa323d5b5e641c28c1bfcec57a
```

Start from the current `main` branch and verify that it contains this commit before implementation.

Do not reuse, reopen, cherry-pick, or continue superseded issue/PR branches, including issues #94/#96 or PR #95.

## Success contract

Persist the exact authoritative Czech and Polish reference catalogs in PostgreSQL through one deterministic, transactional and repeatable synchronization path.

The database snapshot must contain exactly:

- Czech: `808`
- Polish: `990`
- Total: `1,798`

Running the synchronization repeatedly must produce the same exact database snapshot without duplicates, stale rows, partial replacement, demo records or synthetic records.

This milestone creates only the PostgreSQL persistence foundation. It does not activate the real catalog in Planning, candidate selection, preferences, repertoire, Knowledge, the current Reference catalog UI, or any mutation workflow.

## Failure domain

**Loss, corruption, duplication, stale data or non-reproducibility while transferring the authoritative frozen reference catalog into PostgreSQL.**

This milestone has exactly this one failure domain.

## Authoritative catalog contract

The only accepted catalog inputs are:

- `data/catalog/catalog-czech-final.json`
- `data/catalog/catalog-polish-final.json`

They must be produced and verified through:

```bash
node data/catalog/materialize-catalogs.mjs
```

Required counts and hashes:

- Czech upstream: `5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9`
- Czech corrected final: `9812d32e636542865dca471f318ab4df695d0bc2dc8054d4c340e47ffa25c1a7`
- Polish final/upstream: `b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9`
- Czech validation: `e47da19e263f1ba962cb8e2699c6e94125499438a3ff74ccf78bdb29517cab40`
- Polish validation: `49a0accd4392ff9167707e2677d9edab9b5ed9ceb7d0d023a2251dfbca1b5559`

The approved Czech correction remains mandatory:

- `source_id 6016`: `7511` → display `751/1`
- `source_id 6017`, title `Blíž Tobě, Bože můj`: upstream `7522` → final `7512` → display `751/2`
- no accepted `7521`, `752/1`, `7522`, or `752/2`

Files under `data/catalog/payload/` are immutable upstream transport and must remain byte-for-byte unchanged.

## Required persistence boundary

Create a separate read-only PostgreSQL persistence subsystem for the authoritative reference catalog.

Do not populate, replace or repurpose the existing mutable `catalog_songs` table.

Use a dedicated table, named:

```text
reference_catalog_songs
```

Its persisted data contract must include:

```text
id                 text, primary key
language           existing song_language enum, not null
canonical_number   integer, not null
source_id           text, not null
title               text, not null
source_url           text, nullable
```

Required identity and integrity constraints:

- primary key on `id`;
- unique `(language, canonical_number)`;
- unique `(language, source_id)`;
- positive `canonical_number`;
- non-empty `id`, `source_id`, and `title` enforced either by database constraints or by the transactional synchronizer before writes.

Stable ID remains exactly:

```text
${language}:${canonicalNumber}
```

Do not add `active`, `sheetMusicUrl`, preference, repertoire, mutation, ownership or role fields to this table.

## Transactional synchronization

Provide one explicit application command:

```bash
npm run db:sync:reference-catalog
```

It must:

1. require `DATABASE_URL`;
2. read only the two final authoritative JSON files;
3. validate the complete input before committing any change;
4. write the complete exact snapshot in one PostgreSQL transaction;
5. remove stale rows from a previous snapshot inside the same transaction;
6. never leave a partial snapshot on failure;
7. be safe to run repeatedly;
8. print exact resulting Czech, Polish and total row counts.

A full delete-and-reinsert of only `reference_catalog_songs` is acceptable when performed inside one transaction. No other table may be cleared or rewritten.

Add an injected-failure automated proof showing that the previous valid reference snapshot remains unchanged when synchronization fails before commit.

## PostgreSQL read provider

Add a separate read-only PostgreSQL reference catalog provider. It must not replace or modify the existing Planning `CatalogRepository` contract and must not activate the UI.

It must provide database-backed behavior for:

- listing and pagination;
- Czech / Polish / All filtering;
- title search;
- ordinary-number search;
- canonical encoded-number search;
- displayed slash-variant search;
- deterministic natural numeric ordering;
- retrieving a record by stable reference ID;
- exact language counts.

Reuse or extract the already accepted pure canonical/display-number behavior rather than creating conflicting number rules.

Automated proofs must demonstrate that results were read from PostgreSQL, not from `InMemoryReferenceCatalogProvider` or direct JSON access.

## Explicit scope

Allowed work is limited to:

- the dedicated Drizzle schema definition;
- one generated migration for the dedicated table and constraints;
- transactional synchronization code and command;
- the separate PostgreSQL read-only provider;
- focused Phase 31.2 tests and verification scripts;
- `package.json` commands;
- one focused Phase 31.2 CI step and its log artifact if useful;
- narrowly shared E1 helper extraction only when E1 behavior and public commands remain unchanged.

## Explicit exclusions and forbidden changes

Do not implement or modify:

- the current Reference catalog UI behavior or runtime provider;
- Planning catalog activation;
- candidate selection;
- planning row lookup;
- the existing mutable `CatalogRepository` contract;
- existing `catalog_songs` data semantics;
- people management;
- preferences;
- repertoire;
- Knowledge;
- role simulator or workspace role matrix;
- authentication or authorization;
- API routes;
- production deployment;
- legacy-database migration;
- Phase 30.1 browser/manual regression closure;
- E2 smoke/reset as a separate engineering gate;
- a new browser E2E framework;
- broad UI or architecture redesign;
- dependencies not already present in the repository unless absolutely required by this single failure domain.

Do not create demo or synthetic reference records.

Do not change any accepted final catalog record or any payload file.

## Main automated acceptance

Provide exactly one milestone verification command:

```bash
npm run verify:phase-31-2
```

It must use the isolated PostgreSQL lifecycle proven by Engineering Gate E1 and must not alter the guard database.

The command must prove in one acceptance path:

1. materialization and all approved hashes;
2. creation of an isolated temporary PostgreSQL database;
3. migrations applied successfully twice;
4. synchronization applied successfully twice;
5. exact idempotent database snapshot after both synchronizations;
6. exact counts `808 / 990 / 1,798` read from PostgreSQL;
7. exact equality between the PostgreSQL snapshot and both final JSON files;
8. stable IDs and uniqueness of `(language, canonical_number)` and `(language, source_id)`;
9. no stale, demo or synthetic rows;
10. exactly seven Czech rows with null `source_url`;
11. exact Czech `298` and Polish `955` sample records and source URLs;
12. `751/1` and corrected `751/2` are present;
13. all rejected `752` forms are absent;
14. database-backed language filtering, title search, ordinary-number search, canonical search, slash-variant search, pagination, natural ordering and `getById`;
15. injected synchronization failure leaves the previous valid snapshot unchanged;
16. temporary database cleanup after success and injected failure;
17. unchanged guard database fingerprint;
18. existing Engineering E1 verification remains green;
19. project typecheck, existing tests and build remain green.

The same core Phase 31.2 acceptance path must run locally and in CI.

## CI evidence

Add a focused CI invocation of:

```bash
npm run verify:phase-31-2
```

It must run against the repository PostgreSQL service while performing the actual acceptance work in an isolated temporary database.

Do not replace or weaken the existing Engineering E1 CI step.

## Single human checkpoint

After automatic review authorizes it, the user will run only:

```powershell
npm run verify:phase-31-2:local
```

The local wrapper must:

- start the repository PostgreSQL service itself;
- wait for readiness;
- use the same core acceptance path as CI;
- manage its isolated temporary database automatically;
- require no manual `DATABASE_URL`, SQL, Docker inspection or technical diagnosis.

The checkpoint is PASS only when the command prints exactly:

```text
Phase 31.2 PostgreSQL catalog persistence: PASS
```

## Definition of Done

The milestone is complete only when all conditions hold:

1. the dedicated schema and migration satisfy this contract;
2. the exact 1,798-row snapshot is persisted reproducibly;
3. synchronization is atomic, idempotent and removes stale rows only from the dedicated table;
4. the PostgreSQL provider proves the accepted read behavior without UI activation;
5. all catalog hashes and correction invariants remain valid;
6. `npm run verify:phase-31-2` is green on the exact final head;
7. Engineering E1 and all relevant regressions remain green;
8. CI is green on the exact final head;
9. the single human checkpoint passes;
10. no forbidden subsystem or file area is changed;
11. PR evidence is current and audit-ready;
12. Merge Gate passes and the user explicitly commands `MERGOVAT`.

Green CI alone is not Definition of Done.

## Branch and pull-request discipline

- one issue: this issue;
- one implementation branch created from current `main`;
- recommended branch: `codex/implement-github-issue-#101`;
- one Draft PR into `main`;
- no second branch, issue or PR;
- corrective work stays on the same branch and same Draft PR;
- do not merge;
- do not start another milestone.

## Corrective boundary

Continue correcting the same PR only when blockers are confined to:

- the dedicated table or migration;
- import validation;
- transactionality;
- idempotence or stale-row removal;
- PostgreSQL provider behavior;
- isolated acceptance scripts;
- CI, typecheck, tests or build caused by this implementation;
- the single manual checkpoint.

Stop implementation and report the blocker without broadening scope if solving it requires:

- changing the approved persistence contract;
- using `catalog_songs` instead of the dedicated table;
- activating UI, Planning or another product subsystem;
- changing roles or authentication;
- introducing another failure domain;
- changing the authoritative catalog data contract;
- modifying the frozen handover package.

## Required Draft PR evidence

Open one Draft PR to `main` with a current table:

| Acceptance item | Implementation | Automated proof | Human step | Status |
|---|---|---|---|---|

Also include:

- issue reference;
- baseline SHA;
- current head SHA;
- changed-file list grouped by purpose;
- exact successful commands and outputs;
- migration and constraint evidence;
- transactionality and injected-failure evidence;
- first- and second-sync counts;
- exact PostgreSQL counts;
- JSON-to-database equality evidence;
- search, ordering, pagination and sample evidence;
- temporary-database cleanup and guard-fingerprint evidence;
- Engineering E1 regression evidence;
- explicit confirmation that every forbidden area remained unchanged;
- the remaining human checkpoint;
- `Closes #101`.

Do not mark the milestone complete merely because Codex finished coding. Leave the PR as Draft and stop for independent review.

---

## Ratification comment

Review Gate approval recorded on 2026-07-26: the user explicitly approved Phase 31.2 and ratified issue #101 as the authoritative implementation contract. Implementation may now begin under the frozen HANDOVER PACKAGE workflow. This comment does not modify or supplement the issue contract.
