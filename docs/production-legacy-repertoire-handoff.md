# Phase 31.43 — definitive Production melody/repertoire handoff

Phase 31.43 establishes the first real Production knowledge set required for Jaroslav's repertoire to have its intended melody-class-wide meaning.

The legacy SQL Server interpretation is finished. **Do not reconstruct data from old SQL exports or earlier handoff formats.** The only accepted source is the definitive Data Contract Gate archive on branch `agent/phase-31-43-data-contract`:

```text
data/handoff/phase-31-43-data-contract/church-organy-data-contract-definitive.zip
```

Authoritative SHA-256:

```text
acd33d29aa07a6439b42fc3ebb973045c22781b2e1ec187139b71abeb3ee3be1
```

The ZIP must contain exactly:

```text
A-melody-equivalence.json
B-jaroslav-repertoire-pivots.json
C-validation-report.json
HANDOFF.md
```

## Frozen contract

The operator validates the archive itself and the derived knowledge state before it can write anything. The accepted result is:

- Reference songs: **1,798** (808 Czech + 990 Polish)
- legacy source rows: `CeskePisne` **180**, `PolskePisne` **6**, `CeskePolskePisne` **59**, `VarhaniciPisne` **343**
- cross-language mapping is a bijection: **59 / 59 / 59**
- final manually corrected Polish orientation: **(144,142)**
- melody-equivalence edges: **245**
- members of non-singleton classes: **348**
- non-singleton melody classes: **103**
- singleton melody classes: **1,450**
- total melody classes: **1,553**
- forest invariant: **245 = 348 - 103**
- explicit Jaroslav repertoire pivots: **233**
- effective playable songs through melody equivalence: **442** (378 Czech + 64 Polish)
- unresolved identities: **0**
- duplicate/self/null edge defects: **0**

A repertoire pivot is one explicit concrete Reference song membership. The application already applies repertoire eligibility class-wide: if one member of a melody class is an explicit pivot, the class is playable. Therefore the 233 pivots are deliberately **not** expanded into 442 stored repertoire rows.

## Repository acceptance

CI checks out the definitive data-contract branch separately, verifies the ZIP bytes/member set, establishes a disposable PostgreSQL Reference baseline, and runs:

```bash
npx tsx scripts/phase-31-43-tests.ts
```

Focused acceptance proves, among other things:

- exact archive/hash/member validation;
- all frozen graph and repertoire counts;
- exact Reference identity resolution;
- independent melody-forest connectivity validation;
- pristine starting state: 1,798 singleton classes, 1,798 memberships, repertoire 0;
- dry-run is read-only;
- melody changes and repertoire pivots are one atomic transaction;
- an injected failure after melody mutation rolls the whole transaction back;
- apply yields exactly 103 non-singleton + 1,450 singleton = 1,553 classes, 1,798 memberships and 233 pivots;
- current candidate semantics yield exactly 442 playable songs;
- exact rerun is a no-op;
- unexpected pre-existing manual melody/repertoire drift is a STOP condition;
- unrelated Reference/auth/configuration/antiphon/thematic/preference/service/history state is unchanged.

## Operator

The one-time boundary is:

```powershell
npx tsx scripts/production-legacy-repertoire-handoff.ts --archive <DEFINITIVE_ZIP_PATH>
```

Default invocation is a **read-only dry-run**. It requires:

```powershell
$env:ORGANY_REPERTOIRE_PERSON_ID = "person-jaroslav-drobek"
```

and a direct/unpooled Production PostgreSQL connection in `DATABASE_URL_UNPOOLED`. The URL must be acquired without printing or pasting it into chat; pooled hosts containing `-pooler.` are rejected.

Before any mutation the operator:

1. verifies the exact ZIP SHA-256 and exact four-member archive;
2. validates A/B/C/HANDOFF and all frozen counts/invariants;
3. independently proves every declared melody class is connected and acyclic;
4. resolves every accepted identity against the exact current Reference catalog;
5. verifies `person-jaroslav-drobek` exists, is active and organist-eligible;
6. accepts only one of two database states:
   - pristine: 1,798 singleton melody classes + zero repertoire rows;
   - exact already-applied definitive state.

Any partial/manual/mixed state is STOP + review.

Dry-run uses a read-only repeatable-read transaction and rolls it back. It never changes Production.

## Separate HUMAN Production apply authorization

Green CI and a passing dry-run do **not** authorize a Production write.

Only after a separate explicit HUMAN authorization may the same command be run with:

```powershell
npx tsx scripts/production-legacy-repertoire-handoff.ts --archive <DEFINITIVE_ZIP_PATH> --apply
```

Apply uses one PostgreSQL transaction and one transaction-scoped advisory lock. It establishes the definitive melody partition first, inserts exactly the 233 explicit pivots, validates the complete post-state inside the same transaction, and only then commits. Any failure rolls back melody and repertoire together. Exact rerun is a no-op.

No schema migration, runtime UI/API redesign, account/auth change, provider configuration change, deployment, general legacy migration, service/history/preferences import, or `doporučená` repertoire import belongs to this phase.

## Post-apply acceptance

After an authorized apply, connected read-only verification must prove:

- Reference songs 1,798 unchanged;
- melody memberships 1,798;
- melody classes exactly 1,553 = 103 non-singleton + 1,450 singleton;
- no orphan/empty melody class;
- Jaroslav explicit repertoire exactly 233;
- no unrelated organist repertoire;
- effective class-wide playable songs exactly 442;
- identities/auth/roles/links unchanged and no unexpected sessions/verifications;
- antiphons, thematic knowledge and `global/months=2` unchanged;
- preferences/service/planning/history/manual recommendations unchanged;
- Vercel/provider state unchanged and no deployment caused by the data write.

A focused signed-in UI check follows database reconciliation; it does not replace it.
