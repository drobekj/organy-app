# Production legacy repertoire handoff

Phase 31.43 defines the one-time boundary for moving the current organist's playable legacy repertoire into the authoritative Production Reference repertoire model.

This runbook does **not** connect to the old SQL Server database and does **not** contain or guess a SQL extraction query. The repository currently has only the accepted domain semantics of `VarhanniDoprovody.VarhaniciPisne`, not the physical source schema/export needed to write a trustworthy query.

## Accepted legacy semantics

Only these legacy states are relevant:

- `připravená` — playable repertoire; include;
- `hraná` — playable repertoire; include;
- `doporučená` — not repertoire; exclude.

The target model stores repertoire membership only. Phase 31.43 intentionally does not preserve a `připravená` versus `hraná` state distinction.

## Local handoff JSON

The real handoff file stays local and outside Git by default. It must be UTF-8 JSON in this exact shape:

```json
{
  "format": "organy-app-legacy-repertoire-v1",
  "sourceDatabase": "VarhanniDoprovody",
  "targetPersonId": "person-jaroslav-drobek",
  "sourceOrganist": {
    "legacyId": "source evidence only",
    "displayName": "source evidence only"
  },
  "rows": [
    {
      "language": "czech",
      "number": "123",
      "state": "připravená",
      "sourceEvidence": "optional source-row evidence"
    },
    {
      "language": "polish",
      "number": "456",
      "state": "hraná"
    },
    {
      "language": "czech",
      "number": "789",
      "state": "doporučená"
    }
  ]
}
```

The example values are illustrative only and are not real repertoire data.

Rules:

- `format` is exactly `organy-app-legacy-repertoire-v1`;
- `sourceDatabase` is exactly `VarhanniDoprovody`;
- `targetPersonId` must also be supplied independently through `ORGANY_REPERTOIRE_PERSON_ID` and the two values must match;
- `language` is only `czech` or `polish`;
- `number` is the accepted positive encoded Reference number as digits without leading zeroes;
- `state` is only `připravená`, `hraná`, or `doporučená`;
- `sourceOrganist` and `sourceEvidence` are optional review evidence only and are never used to identify Production records;
- duplicate rows with the same canonical song and different legacy states are rejected;
- an exact duplicate with the same state is harmlessly collapsed;
- song title, legacy numeric id, fuzzy matching, and melody inference are never used to resolve a target song.

## Repository acceptance

CI uses only synthetic handoff data and disposable PostgreSQL. It proves the dry-run/apply contract without touching a real legacy source or Production.

The focused command is:

```bash
npx tsx scripts/phase-31-43-tests.ts
```

The Phase 31.43 workflow first materializes the accepted Reference catalogs, applies migrations, establishes the accepted Reference baseline, and then runs the focused acceptance plus normal typecheck/tests/build and relevant Production identity regressions.

## Later HUMAN legacy extraction

This is a future checkpoint, not part of the implementation PR.

When the real SQL Server source is made available, inspect its schema/read-only export first. Produce the local JSON above by explicitly mapping the real source rows to canonical `language`, encoded Reference `number`, and accepted legacy `state`.

Do not invent a query from table names alone. If the physical source columns/relationships do not support a row unambiguously, leave it unresolved and stop rather than guessing.

No SQL Server password, connection string, database dump, or other credential should be pasted into chat or committed to Git.

## Production dry-run

After the real local handoff file has been reviewed, obtain the Neon **direct/unpooled** Production connection string into the local process environment without printing or copying it through chat.

Set the explicit target Person separately:

```powershell
$env:ORGANY_REPERTOIRE_PERSON_ID = "person-jaroslav-drobek"
```

Then run the importer **without** `--apply`:

```powershell
npx tsx scripts/production-legacy-repertoire-handoff.ts --file <LOCAL_JSON_PATH>
```

Dry-run behavior:

- requires `DATABASE_URL_UNPOOLED`;
- rejects a host containing `-pooler.`;
- validates the entire JSON before database writes are possible;
- verifies the explicit target Person exists, is active, and is organist-eligible;
- resolves every `připravená`/`hraná` row by exact `(language, canonical_number)` in `reference_catalog_songs`;
- reports `doporučená` rows as excluded;
- calculates existing versus planned repertoire memberships;
- runs in a read-only transaction and rolls it back;
- prints no database URL or credentials.

Expected safe success form:

```text
Legacy repertoire handoff preflight: PASS
Target Person: person-jaroslav-drobek
Rows: ...; playable: ...; excluded recommended: ...; existing memberships: ...; planned inserts: ....
Dry-run only; no data was changed.
```

After dry-run, connected read-only verification must confirm Production is unchanged before any write authorization is requested.

## Separate HUMAN Production apply authorization

A Production write is a separate checkpoint. Do not add `--apply` merely because dry-run passed.

Only after explicit authorization run:

```powershell
npx tsx scripts/production-legacy-repertoire-handoff.ts --file <LOCAL_JSON_PATH> --apply
```

Apply behavior:

- repeats validation inside one PostgreSQL transaction;
- inserts only missing `reference_organist_repertoire` rows for the explicit target Person;
- uses conflict/no-op semantics for already-present memberships;
- never deletes existing repertoire;
- leaves other organists untouched;
- rolls back the entire transaction on any error;
- exact rerun is a no-op.

## Post-write acceptance

After a future authorized apply, connected read-only verification must confirm:

- the target organist has exactly the expected imported playable memberships;
- no `doporučená` row became repertoire;
- Reference songs, melody classes/memberships, antiphons, thematic data, and configuration are unchanged;
- identities, roles, credentials, links, sessions, and verifications are unchanged;
- preferences, service/planning/history, and manual recommendation data are unchanged except for data created later through their own authorized workflows;
- no unrelated organist repertoire was changed.

Then perform a small UI acceptance while signed in as the organist: inspect several imported Reference songs and confirm repertoire visibility and candidate behavior. This UI check is verification only; it is not a substitute for database reconciliation.

## Out of scope

Phase 31.43 does not migrate general legacy data, service history, preferences, people, melody edges, themes, account data, or `doporučená`. It adds no schema migration, no runtime UI/API behavior, no provider configuration, and no automatic deployment or Production write.
