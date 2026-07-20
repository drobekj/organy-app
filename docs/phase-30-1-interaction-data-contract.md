# Phase 30.1 interaction and data-contract foundation

Issue #88 is implemented as the first manual Planning interaction milestone using deterministic demo fixtures and synthetic scale data only. It does **not** import or derive from the real Czech or Polish hymn catalogs.

## Delivered foundation

- Service context now carries an optional service-level note. Whitespace-only notes are treated as absent, and persisted records keep the note through Working, Final, and Completed lifecycle operations.
- Planning uses catalog-backed priest and organist selections rather than valid free text. Historical saved snapshots remain displayable because the service context still stores both stable person IDs and display-name snapshots.
- Development mode exposes deterministic user identities with effective roles so preference and repertoire behavior can be exercised before authentication exists.
- Catalog is present in the permanent workspace navigation for all roles. Admin-only actions remain application-service guarded.
- The persistent contract now includes users, user roles, one preference profile per user, song preferences, organist repertoire, melody-equivalence classes, antiphon mappings, liturgical-season mappings, and one shared melody non-repetition configuration.
- Candidate-query and row-transition contracts live in `src/application/interaction-contracts.ts`; they define deterministic candidate ordering, antiphon/season signals, preference shading, repertoire authorization, Knowledge authorization, invalid lookup blocking helpers, and synthetic scale fixtures.
- Planning rows now expose a candidate popup, candidate Detail navigation with return to the row, and a precise two-line selected-song presentation. Lookup text remains invalid until a candidate is selected or the lookup is cancelled.
- Catalog has role-aware Songs, People, and Knowledge sections: non-admins can browse, users can manage their own preference/repertoire within role limits, and only admins can mutate People, Songs activation, or Knowledge configuration.
- Melody non-repetition uses one shared configurable window instead of per-melody-class rule rows.

## Demo and synthetic data policy

All current seed data remains deliberately synthetic and visibly marked as demo/Phase 29 data. Future scale verification should use deterministic generated records with synthetic identifiers and titles only. Production hymn texts, real catalog numbers, guessed melody knowledge, and production antiphon or season mappings remain excluded from this milestone.

## Rollback

For local development, rollback is safe by rebuilding a disposable database from migrations before `0005_phase_30_1_contract_foundation.sql`, or by dropping the new Phase 30.1 tables and the nullable `service_contexts.note` column in a disposable environment. The migration only adds new tables and one nullable column; it does not rewrite existing rows or historical snapshots.

## Final local checkpoint

1. Open Planning and verify defaults are resolved from the latest Completed service by stable person ID.
2. Verify priest/organist dropdown selection and historical inactive snapshots.
3. Enter a multi-line service note, save Working, finalize, complete, reopen, and confirm line breaks remain.
4. Switch deterministic Development users and confirm shell identity changes.
5. Exercise preference score limits through contract tests.
6. Exercise own-organist and admin repertoire permissions through contract tests.
7. Open Catalog as non-admin and admin, browse Songs and People, and verify Knowledge remains admin-only by service contract.
8. Confirm the left navigation remains visible while switching workspaces.
9. Activate a Planning row, select a demo candidate, and confirm invalid lookup text cannot be persisted by state-machine tests.
10. Use a disposable DB to run migrate and smoke checks when Docker/PostgreSQL are available.
11. Verify candidate popup ordering, Detail return navigation, selected-song two-line display, invalid lookup blocking, preference/repertoire actions, admin-only Knowledge changes, and synthetic scale fixtures.

## Completion matrix

| Acceptance item | Status | Implementation | Automated evidence | Manual checkpoint |
| --- | --- | --- | --- | --- |
| Service context priest/organist dropdowns, stable IDs, historical inactive display, and service note lifecycle | DONE | `app/planning-lifecycle-client.tsx`, `src/planning-lifecycle/model.ts`, lifecycle repositories | `npm test` lifecycle/catalog suites | Steps 1-3 |
| Stable deterministic actor identity and one preference profile per non-admin user | DONE | `src/application/interaction-contracts.ts` | `scripts/phase-30-1-contract-tests.ts` | Step 4 |
| Preference score ranges, aggregate score, repertoire, admin-only Knowledge authorization | DONE | `src/application/interaction-contracts.ts` | `scripts/phase-30-1-contract-tests.ts` | Steps 5-8 |
| Persistent model and migration for users, roles, profiles, preferences, repertoire, melody equivalence, mappings, note, and shared non-repetition config | DONE | `src/db/schema/index.ts`, `drizzle/0005_phase_30_1_contract_foundation.sql`, `scripts/db-phase-30-1-smoke.ts` | `npm run typecheck`; DB smoke script available when PostgreSQL is available | Step 17 |
| Planning row activation, candidate popup/list, ordering/signals/shading, two-line selected song, Detail navigation, invalid lookup blocking, cancel/restore | DONE | `app/planning-lifecycle-client.tsx`, `src/application/interaction-contracts.ts`, `app/globals.css` | `scripts/phase-30-1-contract-tests.ts`; `npm run build` | Steps 10-16 |
| Role-aware Catalog Songs/People/Knowledge with language browsing, empty-query browse, search, active/inactive visibility, pagination over synthetic scale data, and song detail | DONE | `app/planning-lifecycle-client.tsx`, `src/application/interaction-contracts.ts` | `scripts/phase-30-1-contract-tests.ts`; `npm run build` | Steps 7-8 and 13-14 |
| Deterministic fixtures and synthetic scale data without real catalog import | DONE | `src/application/interaction-contracts.ts`, `scripts/phase-30-1-contract-tests.ts` | 2,500-song synthetic assertion in `scripts/phase-30-1-contract-tests.ts` | Steps 10-16 |
| Existing Phase 30 lifecycle permissions and snapshots remain green | DONE | Existing lifecycle services and adapters plus service note round-trip | `npm test` | Steps 1-3 and 17 |
