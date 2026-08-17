# Production authoritative reference-data synchronization

## Purpose

Phase 31.39 initializes the already-migrated production PostgreSQL schema with **deterministic authoritative Reference knowledge only**. It is intentionally separate from application deployment and from user/business-data initialization.

The phase starts from the completed Phase 31.38 state: the reviewed application schema exists in Neon production, all application/auth/reference/service tables are empty, and the only public application row is the migration-owned `melody_non_repetition_config` singleton `global / months=2`.

Phase 31.39 does **not** deploy the application, create users, bootstrap Better Auth, import legacy application data, create services, synchronize preferences/repertoire, or set `BETTER_AUTH_URL`.

## Authoritative data synchronized

The existing reviewed synchronizers remain the only writers:

- `synchronizeReferenceCatalog` — Czech `808`, Polish `990`, total `1,798` Reference songs;
- the catalog synchronizer's deterministic initial melody baseline — one `reference-melody:<song-id>` class and one membership for every Reference song until later explicitly curated melody-equivalence knowledge exists;
- `synchronizeProductionReferenceAntiphons` — Czech `116`, Polish `116`, total `232` Reference antiphons;
- `synchronizeReferenceThematicSections` — Czech `35` selectable sections, Polish `36`, total `71`, together with the reviewed hierarchy/ranges.

The operator does not duplicate source parsing or business reconciliation logic. Before any production write it calls the existing source validators. The Czech/Polish antiphon and thematic-section validators enforce their frozen SHA-256 contracts; the Reference catalog validator enforces the accepted identity/count contract and is covered by the existing Phase 31.2/catalog materialization acceptance chain.

## Operator command

The dedicated operator boundary is:

```text
npx tsx scripts/production-reference-sync.ts
```

It reads only the direct operator credential from:

```text
DATABASE_URL_UNPOOLED
```

The normal Vercel pooled runtime `DATABASE_URL` is not copied or repurposed merely to run this operation.

The command accepts either no argument (read-only preflight) or exactly:

```text
--apply
```

No other argument is accepted.

## Fail-closed preflight

Before a write, the operator requires:

- the reviewed Phase 31.38 schema with exactly 32 public application tables;
- no `neon_auth` schema and no Data API roles;
- the exact migration-owned non-repetition singleton `global / months=2`;
- either the pristine Phase 31.38 baseline, where that config table is the only non-empty public application table, or the exact completed Phase 31.39 reference snapshot;
- successful validation of all authoritative Reference source artifacts.

Any operational/auth/user/service data, any partial Reference synchronization, an unexpected schema, or Neon Auth/Data API state is a STOP condition. The operator never prints the database URL, hostname, password, token, provider/system identifier, or other secret.

Running the command without `--apply` performs no synchronization.

## Authorized production write

The actual production write is permitted only at the Phase 31.39 HUMAN checkpoint after:

1. the exact-head Phase 31.39 CI/regression set passes;
2. fresh Review Gate passes;
3. connected Neon read-only verification proves the exact Phase 31.38 baseline;
4. connected Vercel verification proves zero deployments;
5. the user receives one secret-safe local operator action.

The direct Neon credential remains outside Git and must not be pasted into chat.

At that checkpoint the operator is re-run with `--apply`. The existing synchronizers use transactional reconciliation per Reference domain and are idempotent. All source validation completes before the first synchronization call. If a database/runtime failure nevertheless leaves a partial cross-domain Reference state, the next preflight refuses it and the release stops for review rather than silently continuing.

## Exact accepted final snapshot

After synchronization, connected read-only verification must prove:

- `reference_catalog_songs`: Czech `808`, Polish `990`, total `1,798`;
- `reference_melody_classes`: `1,798`;
- `reference_song_melody_memberships`: `1,798`;
- every initial membership is exactly `reference-melody:<reference-song-id>` and there are no missing/orphan classes;
- `reference_antiphons`: Czech `116`, Polish `116`, total `232`;
- thematic parents: `6`;
- thematic selectable sections: Czech `35`, Polish `36`, total `71`;
- thematic ranges: Czech `35`, Polish `36`, total `71`;
- `melody_non_repetition_config`: exactly `global / months=2`;
- every other public application table remains empty;
- no Neon Auth/Data API state exists;
- Vercel still has zero deployments.

A successful authorized rerun against that exact final snapshot is accepted and must leave the same counts/content; it must not duplicate rows.

## Explicit exclusions

Phase 31.39 does not perform any of the following:

- Vercel deployment or Git auto-deployment enablement;
- `BETTER_AUTH_URL` creation, guessing, or configuration;
- Better Auth protected-account bootstrap/password reset;
- creation of real admin/priest/organist/congregation actors;
- legacy SQL Server restore/import;
- demo, smoke, synthetic, or acceptance fixture insertion;
- production service/Working/Final/Completed creation;
- organist repertoire or user preference initialization;
- manually curated melody-equivalence merges;
- antiphon recommendation mappings;
- custom domain/DNS/cutover;
- managed Vercel/Neon integration/add-on;
- Neon Auth/Data API provisioning;
- paid/trial/provider-plan changes.

`BETTER_AUTH_URL`, the first explicit Vercel production deployment, protected-account bootstrap, operational knowledge initialization, and public production smoke remain later separately authorized slices.
