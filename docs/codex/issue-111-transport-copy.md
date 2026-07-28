# Issue #111 transport copy

Source: `https://github.com/drobekj/organy-app/issues/111`

This file is a transport copy for Codex environments that cannot read GitHub Issues. Issue #111 remains the authoritative contract. If this file and issue #111 differ, stop and report the mismatch.

## Authority and baseline

This issue is the single authoritative implementation contract for Phase 31.7.

Repository: `drobekj/organy-app`

Approved baseline:

```text
main
aa3e943f04104693422a2c93a861d91695c468db
```

Start from current `origin/main` and verify that it contains this exact commit.

Phase 31.6 is complete through issue #109 and PR #110. Its authoritative Reference catalog, server-resolved actor boundary, persistent own reference preferences, aggregate preference read, stale-response safety, DB-runtime UI behavior and accepted regressions are foundations and must remain unchanged.

The user explicitly approved Review Gate decision `POKRAČOVAT` and then `SCHVALUJI TECHNICKOU OBHAJOBU` for this milestone.

## Product goal

In `ORGANY_RUNTIME=db`, an authorized organist or admin can read and persist whether one concrete authoritative Reference song belongs to one concrete organist person's repertoire.

The authoritative repertoire is separate from the legacy mutable catalog repertoire and does not yet affect candidate selection.

## Single failure domain

**A concrete song in `reference_catalog_songs` cannot yet be stored, loaded or changed as explicit repertoire membership for a concrete organist person.**

This milestone has exactly this one failure domain.

## Persistence contract

Add one new table:

```text
reference_organist_repertoire
```

Required columns and constraints:

- `organist_person_id` — non-null FK to `catalog_persons.id`, cascading delete;
- `reference_song_id` — non-null FK to `reference_catalog_songs.id`, cascading delete;
- `updated_at` — non-null timezone timestamp defaulting to now;
- unique `(organist_person_id, reference_song_id)`.

Presence of a row means membership `active: true`; absence means `active: false`. Do not add a boolean membership column.

Do not alter, read through, migrate into, or write through the existing legacy `organist_repertoire` table.

## Interaction contracts

Add two separate actions:

```text
getReferenceRepertoireMembership
setReferenceRepertoireMembership
```

### Read input

```ts
{
  actor: { userId: string; role?: PlanningRole };
  input: {
    referenceSongId: string;
    organistPersonId?: string;
  };
}
```

### Write input

```ts
{
  actor: { userId: string; role?: PlanningRole };
  input: {
    referenceSongId: string;
    organistPersonId?: string;
    active: boolean;
  };
}
```

### Exact success result for both actions

```ts
{
  referenceSongId: string;
  organistPersonId: string;
  active: boolean;
}
```

The response must contain exactly those three fields and no user, role, preference, profile, catalog-person details or other repertoire rows.

## Server-authoritative target resolution

Resolve and verify the actor through the accepted Phase 31.4 server-side local actor boundary before resolving repertoire scope.

### Organist actor

- The actor must have assigned role `organist`.
- Derive `organistPersonId` exclusively from the stored user's `person_id`.
- The stored linked person must exist, be active and have `organist = true`.
- Organist requests must omit `input.organistPersonId`; a supplied target is `invalidInput`.
- The organist can read and change only this server-derived own repertoire.

### Admin actor

- The actor must have assigned role `admin`.
- `input.organistPersonId` is required.
- The target must exist, be active and have `organist = true`.
- Admin has no implicit own repertoire and no hardcoded `demo-organist` target.

### Priest and congregation member

Both roles receive `permissionDenied` for read and write.

## Repository contract

Add narrow repository behavior equivalent to:

```ts
isActiveOrganistPerson(personId: string): Promise<boolean>;
getReferenceRepertoireMembership(
  organistPersonId: string,
  referenceSongId: string,
): Promise<boolean>;
setReferenceRepertoireMembership(
  organistPersonId: string,
  referenceSongId: string,
  active: boolean,
): Promise<boolean>;
```

Required write semantics:

- `active: true` uses idempotent insert (`ON CONFLICT DO NOTHING` or equivalent);
- `active: false` deletes the row;
- repeated add leaves exactly one row;
- repeated remove safely returns `false`;
- another reference song remains isolated;
- another organist person remains isolated;
- `updated_at` reflects a successful persisted add/re-add path as implemented consistently;
- legacy `organist_repertoire` remains structurally and data-wise unchanged.

Before reading or writing membership, validate that the requested authoritative reference song exists.

## Structured errors

Preserve the accepted structured error envelope.

- malformed actor, malformed `referenceSongId`, wrong field types, extra fields or forbidden organist target field → `invalidInput`;
- unknown authoritative reference song → `notFound`;
- unknown/inactive actor, role-less actor or unassigned requested role → accepted Phase 31.4 error behavior;
- priest or congregation member → `permissionDenied`;
- organist without a stored person link → `permissionDenied`;
- organist linked to an inactive, missing or non-organist person → `permissionDenied`;
- admin without `organistPersonId` → `invalidInput`;
- admin target that is missing, inactive or not an organist → `notFound`.

## DB-runtime UI contract

Extend only the authoritative Reference record detail.

### Organist

For the selected Reference song, show read-only membership text and exactly one applicable action:

```text
My repertoire: yes
Remove from my repertoire
```

or:

```text
My repertoire: no
Add to my repertoire
```

No organist target selector is shown; target identity is server-derived.

### Admin

- Show a selector containing existing active `catalog_persons` with `organist = true`.
- No hardcoded default target.
- When no target is selected, show no membership mutation action.
- For a selected target, load and show membership for the current Reference song and offer Add or Remove.

### Priest and congregation member

Show no authoritative repertoire controls.

### Runtime boundary

Memory runtime Reference catalog remains read-only and exposes no authoritative repertoire persistence controls.

## Stale-response safety

Use an explicit request-generation/tracker mechanism. Invalidate older membership reads and writes when any of these changes:

- selected Reference song;
- active user;
- active role;
- stored actor person link;
- admin-selected organist target;
- runtime mode.

An older response must not overwrite membership for another song, actor, role or admin target. A stale Add/Remove response must not restore an older state after a newer request.

## Explicit exclusions

Do not implement or modify:

- candidate filtering, ranking, hydration, activation or Planning popup behavior;
- use of authoritative repertoire as a candidate hard filter;
- melody-equivalence classes or repertoire transfer through melody;
- antiphon or liturgical-season mappings;
- own preferences, aggregate preferences or preference thresholds;
- migration of legacy repertoire;
- legacy `organist_repertoire` semantics, schema or UI behavior;
- service-set persistence or lifecycle policy;
- creation/editing of people, app users, roles or preference profiles;
- authentication, sessions, deployment or account UI;
- frozen Reference source data, IDs, ordering, search or paging;
- broad Catalog or Planning redesign.

## Main automated acceptance

Provide exactly one focused milestone command:

```bash
npm run verify:phase-31-7
```

It must use the existing isolated PostgreSQL lifecycle and exercise the real route handler, application service, PostgreSQL repository and browser-facing DB client.

In one deterministic acceptance path prove:

1. migration creates the separate table, both FKs and composite uniqueness;
2. absent membership returns exact result with `active: false`;
3. organist adds own membership using the stored person link;
4. repeated add leaves exactly one row;
5. organist removes membership and repeated remove remains safe;
6. another Reference song remains isolated;
7. another organist person remains isolated;
8. admin manages an explicitly selected active organist target;
9. admin without target returns `invalidInput`;
10. admin cannot target missing, inactive or non-organist persons;
11. organist-supplied target is rejected and cannot affect another person;
12. organist without a valid linked active organist person is denied;
13. priest and congregation member are denied for read and write;
14. unknown Reference song returns `notFound`;
15. malformed/extra fields and actor/role failures remain structured;
16. success response keys are exactly `referenceSongId`, `organistPersonId`, `active`;
17. the browser-facing DB client invokes both actual actions;
18. deterministic stale tests cover song, actor, role, person link, admin target and competing writes;
19. authoritative Reference UI has organist own controls, admin selector behavior and no hardcoded authoritative target;
20. memory runtime remains read-only;
21. legacy `organist_repertoire` schema and rows are unchanged;
22. candidate output is identical before and after authoritative membership changes;
23. Phase 31.5–31.6 preference behavior remains unchanged;
24. temporary database cleanup succeeds and the guard database fingerprint remains unchanged.

Automated proof must call the real route handler. Helper-only unit tests are insufficient.

PASS requires the exact line:

```text
Phase 31.7 authoritative reference organist repertoire: PASS
```

## CI evidence

Add a focused CI invocation of:

```bash
npm run verify:phase-31-7
```

Upload a focused Phase 31.7 log artifact. Keep every existing Engineering E1, Phase 31.2–31.6, migration, DB smoke, typecheck, full test, reference-catalog test and production-build check present and green on one exact final head.

## Single human checkpoint

Only after independent Automatic Review Gate authorization, the user will run exactly:

```powershell
npm run verify:phase-31-7:local
```

The local wrapper must:

- run only the focused Phase 31.7 PostgreSQL acceptance;
- show live output in the same terminal;
- automatically start the repository PostgreSQL lifecycle, wait for readiness and stop it in `finally`;
- require no manual environment, SQL, Docker or process diagnosis;
- print the exact Phase 31.7 PASS line;
- return exit code `0` and exit automatically.

No output-file upload is required when the exact PASS line and successful return are reported.

## Definition of Done

The milestone is complete only when:

1. authoritative Reference repertoire is persisted only in the new separate table;
2. organist scope is derived from the stored actor/person link;
3. admin manages only an explicitly selected valid active organist person;
4. exact read/write and privacy contracts hold;
5. DB-runtime Reference UI supports authorized Add/Remove behavior;
6. stale responses cannot overwrite current scope;
7. memory, legacy repertoire, candidates and preference behavior remain unchanged;
8. focused verification and full CI are green on the exact final head;
9. the single human checkpoint passes;
10. PR evidence is complete;
11. Merge Gate passes;
12. the user explicitly commands `MERGOVAT`.

Green CI alone is not Definition of Done.

## Branch and pull-request discipline

- one issue: this issue;
- one implementation branch from current `origin/main` containing the exact approved baseline;
- recommended branch: `codex/phase-31-7-reference-organist-repertoire`;
- one Draft PR into `main`;
- all corrections stay in that same branch and Draft PR;
- do not mark Ready, merge, create another issue or begin another milestone;
- stop after the Draft PR and evidence are complete.

## Required Draft PR evidence

The Draft PR must contain:

| Acceptance item | Implementation | Automated proof | Human step | Status |
|---|---|---|---|---|

Also include:

- this issue number and baseline SHA;
- exact current head SHA;
- changed files grouped by purpose;
- migration/schema/FK/uniqueness evidence;
- organist server-derived scope and admin explicit-target evidence;
- idempotent add/remove and cross-song/cross-organist isolation evidence;
- exact response privacy evidence;
- DB-client and Reference-detail UI evidence;
- stale-response evidence;
- memory, legacy-repertoire, candidate and preference regression evidence;
- Phase 31.6/31.5/31.4/31.3/31.2/E1 evidence;
- cleanup and guard-fingerprint evidence;
- forbidden-area confirmation;
- remaining human checkpoint;
- `Closes #111`.

Leave the PR Draft and stop for independent review.
