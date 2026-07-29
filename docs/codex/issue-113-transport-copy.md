# Phase 31.8 — Persistent melody equivalence on the authoritative Reference catalog

## Transport-copy status

This repository document is the approved transport copy of GitHub issue #113 for Codex access.

GitHub issue #113 remains the single authoritative implementation contract. If this file and the issue ever differ, stop and report the mismatch rather than choosing one silently.

## Authority and baseline

Repository: `drobekj/organy-app`

Approved implementation baseline:

```text
main
86ef8806122284b18420b619490612c49335b9bb
```

Start from current `origin/main` and verify that it contains this exact commit plus this transport copy.

Phase 31.7 is complete through issue #111 and PR #112. Its authoritative Reference catalog, server-authoritative local actor boundary, persistent own preferences, aggregate preference read, persistent authoritative organist repertoire, stale-response safety, DB-runtime UI behavior and accepted regressions are foundations and must remain unchanged.

The user explicitly approved Review Gate decision `POKRAČOVAT` and then `SCHVALUJI TECHNICKOU OBHAJOBU` for this milestone.

## Product goal

In `ORGANY_RUNTIME=db`, every authoritative Reference song belongs to exactly one persistent melody-equivalence class. Authorized users can read the complete class of a selected Reference song. Admin can merge the complete classes of two Reference songs.

Unknown melody knowledge is represented by a singleton class. A user-visible melody name is not required.

## Single failure domain

**An authoritative Reference song cannot yet be persistently assigned to a melody-equivalence class or show the other authoritative Reference songs with the same melody.**

This milestone has exactly this one failure domain.

## Persistence contract

Add two new authoritative tables, separate from all legacy melody tables.

### `reference_melody_classes`

Required columns:

- `id` — non-null text primary key;
- `created_at` — non-null timezone timestamp defaulting to now;
- `updated_at` — non-null timezone timestamp defaulting to now.

Do not require or expose a user-editable melody name.

### `reference_song_melody_memberships`

Required columns and constraints:

- `reference_song_id` — non-null primary key and FK to `reference_catalog_songs.id`, cascading delete;
- `class_id` — non-null FK to `reference_melody_classes.id`, cascading delete;
- `updated_at` — non-null timezone timestamp defaulting to now;
- index or equivalent support for reading all members by `class_id`.

Each authoritative Reference song must have exactly one membership row.

For the current authoritative catalog, migration/bootstrap creates one singleton class per existing song. The deterministic initial class id is:

```text
reference-melody:<referenceSongId>
```

Migration acceptance requires exactly 1,798 Reference songs, 1,798 membership rows and 1,798 singleton classes before any merge.

Do not alter, read through, migrate into, or write through legacy tables:

```text
melody_equivalence_classes
song_melody_equivalence
```

## Reference-catalog synchronization safety

Replace destructive `DELETE FROM reference_catalog_songs` synchronization with a transactional upsert/reconcile algorithm because authoritative preferences, repertoire and melody memberships reference stable Reference ids.

Required behavior:

- unchanged ids update only mutable Reference metadata;
- unchanged preference, repertoire and melody rows survive repeated synchronization;
- newly inserted Reference songs receive one deterministic singleton class and membership;
- ids genuinely absent from the frozen source are deleted through accepted FK behavior;
- empty authoritative melody classes are removed after reconciliation;
- frozen JSON content, stable ids and accepted counts remain unchanged;
- any synchronization failure rolls back catalog, preference, repertoire and melody state atomically.

## Interaction contracts

Add two separate actions:

```text
getReferenceMelodyClass
mergeReferenceMelodyClasses
```

### Read input

```ts
{
  actor: { userId: string; role?: PlanningRole };
  input: { referenceSongId: string };
}
```

### Merge input

```ts
{
  actor: { userId: string; role?: PlanningRole };
  input: {
    referenceSongId: string;
    mergeWithReferenceSongId: string;
  };
}
```

### Exact success result for both actions

```ts
{
  referenceSongId: string;
  classId: string;
  members: Array<{
    referenceSongId: string;
    language: "czech" | "polish";
    canonicalNumber: number;
    displayNumber: string;
    title: string;
  }>;
}
```

The response must contain exactly those top-level fields. Each member must contain exactly the five specified fields.

Members are unique and sorted deterministically by language and canonical number using the accepted Reference ordering. A singleton read returns exactly one member.

## Authorization

Resolve and verify the actor through the accepted Phase 31.4 server-side local actor boundary before melody behavior.

All active users with an assigned requested/default role may read: priest, organist, admin and congregation member.

Only assigned role `admin` may merge melody classes. Priest, organist and congregation member receive `permissionDenied` for merge.

No client-supplied person id or client-supplied role is authoritative.

## Repository and transaction contract

Add a narrow authoritative repository/service boundary equivalent to:

```ts
referenceSongExists(referenceSongId: string): Promise<boolean>;
getReferenceMelodyClass(referenceSongId: string): Promise<ReferenceMelodyClass>;
mergeReferenceMelodyClasses(
  referenceSongId: string,
  mergeWithReferenceSongId: string,
): Promise<ReferenceMelodyClass>;
```

Merge semantics:

1. validate that both Reference songs exist;
2. begin one database transaction;
3. find both class ids and lock both classes/membership sets in deterministic class-id order;
4. the class of `referenceSongId` is the surviving anchor class;
5. move every member of the target class into the anchor class;
6. update the surviving class timestamp consistently;
7. remove the now-empty target class;
8. return the complete resulting anchor class;
9. commit atomically.

Merging a song with itself or merging two songs already in the same class is an idempotent success without membership loss or duplicate rows.

Concurrent merges touching overlapping classes must not lose members, create duplicate memberships, leave empty orphan classes or violate one-class-per-song.

Phase 31.8 does not implement split, detach or member removal.

## Structured errors

Preserve the accepted structured error envelope.

- malformed actor, malformed role or extra actor field → `invalidInput`;
- malformed Reference id, wrong field type, missing field or extra input field → `invalidInput`;
- unknown anchor Reference song → `notFound`;
- unknown merge target Reference song → `notFound`;
- unknown/inactive actor, role-less actor or unassigned requested role → accepted Phase 31.4 `permissionDenied` behavior;
- non-admin merge → `permissionDenied`;
- database or transaction failure → existing `internalError` envelope.

Any failed read or merge must leave all authoritative and legacy data unchanged.

## DB-runtime UI contract

Extend only the authoritative Reference record detail.

All assigned roles see a read-only `Same melody` section listing every class member with display number, title and language.

Admin additionally gets Reference-song search by accepted number/title semantics, one concrete merge target, no default or hardcoded target, self-target rejection, already-linked indication and exactly one `Merge melody classes` action.

Priest, organist and congregation member show no merge controls.

Memory runtime remains read-only without authoritative melody persistence calls or merge controls.

## Stale-response safety

Use an explicit generation/tracker mechanism for Reference melody reads, admin target search and merges.

Invalidate older work when selected Reference song, active user, active role, runtime mode, admin merge target, target-search query or a newer merge request changes.

An older read, search or merge response must not overwrite the current class, target list, selected target or merge result.

Automated proof must use genuinely deferred browser-facing transport promises resolved in reverse order, not only direct tracker-helper tests.

## Explicit exclusions

Do not implement or modify:

- split/detach/remove-member melody operations;
- user-visible melody names;
- legacy melody migration or semantics;
- automatic melody recognition;
- candidate engine use of authoritative Reference songs;
- repertoire hard filtering through authoritative melody classes;
- melody non-repetition, historical checks or planning conflicts;
- antiphon or liturgical-season mappings;
- preference or repertoire contracts;
- Planning rows, service-set persistence or lifecycle behavior;
- frozen Reference JSON data, ids, ordering or accepted counts;
- authentication, sessions, deployment or account UI;
- Phase 31.9 or any later milestone.

## Main automated acceptance

Provide exactly one focused milestone command:

```bash
npm run verify:phase-31-8
```

It must use the existing isolated PostgreSQL lifecycle and exercise the real route handler, application service, PostgreSQL repository, browser-facing DB client and relevant DB-runtime UI gates.

In one deterministic acceptance path prove:

1. both new tables, columns, timestamps, FKs, primary/unique constraints and class lookup index;
2. exactly 1,798 initial memberships and 1,798 singleton classes;
3. every Reference song has exactly one membership;
4. singleton read returns the exact response shape;
5. all four assigned roles may read;
6. only admin may merge;
7. admin merges two singleton classes;
8. admin merges one complete multi-member class into another;
9. anchor class survives and the target class is deleted;
10. repeated/self/same-class merge is idempotent;
11. members are complete, unique and deterministically ordered;
12. top-level and member response keys are exact;
13. malformed/extra input and complete actor/role failures remain structured for both actions;
14. unknown anchor and unknown target return `notFound`;
15. failed transaction rolls back every membership/class change;
16. overlapping concurrent merges lose no members and leave no orphan/duplicate state;
17. repeated Reference synchronization preserves existing melody, preference and repertoire data;
18. a newly reconciled Reference song receives one singleton class and membership;
19. synchronization failure rolls back all authoritative state;
20. browser-facing DB client invokes both actual actions;
21. UI shows read-only members for all roles, merge controls only for admin, no default/hardcoded target and no memory controls;
22. deferred stale tests cover song, actor, role, runtime, target, search query and competing merge;
23. legacy melody tables and candidate output are identical before and after authoritative merges;
24. Phase 31.5–31.7 preference/repertoire behavior remains unchanged;
25. temporary database cleanup succeeds and the guard database fingerprint remains unchanged.

Automated proof must call the real route handler. Helper-only unit tests or source-regex checks alone are insufficient.

PASS requires the exact line:

```text
Phase 31.8 authoritative reference melody equivalence: PASS
```

## CI evidence

Add a focused CI invocation of `npm run verify:phase-31-8` and upload artifact `phase-31-8-log`.

Keep Engineering E1, Phase 31.2–31.7, migration, DB smoke, typecheck, full test, Reference-catalog test and production build green on one exact final head.

## Single human checkpoint

Only after independent Automatic Review Gate authorization, the user will run exactly:

```powershell
npm run verify:phase-31-8:local
```

The wrapper runs only focused Phase 31.8 PostgreSQL acceptance, shows live output, automatically starts/waits/stops PostgreSQL in `finally`, requires no manual diagnostics, prints the exact PASS line and returns exit code `0`.

## Definition of Done

The milestone is complete only when exact persistence, merge, synchronization, UI, stale-safety and regression contracts pass; focused verification and full CI are green on the exact final head; the single human checkpoint passes; PR evidence is complete; Merge Gate passes; and the user explicitly commands `MERGOVAT`.

Green CI alone is not Definition of Done.

## Branch and pull-request discipline

- one issue: GitHub issue #113;
- exact implementation branch: `codex/phase-31-8-reference-melody-equivalence`;
- one Draft PR into `main`;
- all corrections stay in that same branch and Draft PR;
- do not mark Ready, merge, create another issue or begin another milestone;
- stop after the Draft PR and evidence are complete.

## Required Draft PR evidence

The Draft PR must contain:

| Acceptance item | Implementation | Automated proof | Human step | Status |
|---|---|---|---|---|

Also include issue #113, approved baseline SHA, transport-copy commit, exact current head, changed files grouped by purpose, schema/bootstrap evidence, exact read/merge/privacy and permission evidence, transaction/idempotence/concurrency/rollback evidence, synchronization preservation evidence, DB-client/UI/stale-response evidence, memory/legacy/candidate/preference/repertoire regressions, Phase 31.7–31.2/E1 evidence, cleanup/fingerprint evidence, forbidden-area confirmation, remaining human checkpoint, and `Closes #113`.

Leave the PR Draft and stop for independent review.