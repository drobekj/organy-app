# Decisions

## Purpose
Use this document as an index for important product and technical decisions.

## Decision Record Format
For each decision, include an identifier, date, status, context, options considered, decision, consequences, and related links.

## Decision Log

### DEC-2026-07-06-01 — Song identity uses language and number

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Czech and Polish hymn numbering must remain distinct.
- **Options considered:** identify songs by number alone; identify songs by `(language, number)`.
- **Decision:** A song is identified conceptually by `(language, number)`.
- **Consequences:** Preferences, mappings, service rows, and catalog references must refer to concrete songs using language and number.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 11.

### DEC-2026-07-06-02 — Melody is modeled as equivalence between songs

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** The domain needs to recognize the same melody across different song entries without prematurely introducing a separately named melody object.
- **Options considered:** separately named melody entity; equivalence relation on songs.
- **Decision:** Melody is modeled conceptually as an equivalence relation on songs. A melody-equivalence class contains songs sharing the same melody, and singleton classes are valid.
- **Consequences:** Repertoire filtering, non-repetition, and candidate display operate at melody-equivalence-class level where relevant.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 12.

### DEC-2026-07-06-03 — Planning artifact is a concrete ordered service set

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Real services may include songs, instrumental contributions, external choir contributions, and notes.
- **Options considered:** fixed hymn slots only; flexible ordered service rows.
- **Decision:** The primary planning artifact is a concrete ordered service set with flexible rows. Rows may be added, removed, and reordered. A row without a song must contain a textual note.
- **Consequences:** Planning remains aligned with real service structure while still supporting the standard four-song case.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 13.

### DEC-2026-07-06-04 — Service sets use a four-state lifecycle

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** The domain needs clear treatment of absent, draft, final, and historical service sets.
- **Options considered:** separate deleted/cancelled states; four-state lifecycle without deleted/cancelled states.
- **Decision:** Service set states are `no set exists`, `working set`, `final set`, and `completed-service record`. Deleting a saved non-completed set returns to `no set exists`.
- **Consequences:** Completed-service records are historical, while working and final sets are non-completed plans.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 14.

### DEC-2026-07-06-05 — Antiphon and liturgical season are manual highlighting inputs

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Earlier assumptions that service date determines antiphon number and antiphon number determines liturgical season were corrected.
- **Options considered:** derive antiphon and season from date; require manual input and use mappings only for highlighting.
- **Decision:** Antiphon number and liturgical season are not prefilled from service date. Antiphon is user-entered, liturgical season is manually selected, and both highlight candidates after hard filtering. Forward antiphon protection is removed.
- **Consequences:** `(language, antiphon number)` may map to a recommended song for red highlighting; `(language, liturgical season)` may map to songs for green highlighting. Neither is a hard filter.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discoveries 15–16.

### DEC-2026-07-06-06 — Candidate lists use four hard filters before highlighting

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Candidate selection needs to distinguish eligibility from helpful liturgical highlighting.
- **Options considered:** include antiphon and season as hard filters; apply only repertoire, language, non-repetition, and preference threshold as hard filters.
- **Decision:** Hard filters are selected/default organist repertoire, service language, melody non-repetition rule, and preference threshold with default `x = 0`.
- **Consequences:** Antiphon and liturgical season can only highlight candidates that already passed hard filters.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 17.

### DEC-2026-07-06-07 — Preferences belong to concrete songs and are role-weighted

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Preferences must preserve language-specific song identity and reflect different role weights.
- **Options considered:** store preferences at melody-equivalence-class level; store preferences on concrete songs.
- **Decision:** Preferences belong to concrete songs `(language, song number)` and do not transfer automatically across a melody-equivalence class. Priest scores range `0–3`, organist `0–2`, congregation member `0–1`, and admin has no own preference.
- **Consequences:** Candidate preference filtering uses total summed role-weighted score for the concrete song.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 18.

### DEC-2026-07-06-08 — Melody non-repetition applies to melody-equivalence classes

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Repeating the same melody under another song number should still count as repetition.
- **Options considered:** check individual songs; check melody-equivalence classes.
- **Decision:** The melody non-repetition rule applies to melody-equivalence classes, has no exceptions, and consists of backward historical checking plus forward protection of saved future plans.
- **Consequences:** Completed-service records provide backward filtering input; saved future working and final sets provide forward protection. Rows without concrete songs are ignored.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 20.

### DEC-2026-07-06-09 — Conflicts are limited to non-completed plans

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Historical completed-service records should inform future planning but not be judged against each other as conflicts.
- **Options considered:** define conflicts among all service records; define conflicts only among non-completed plans.
- **Decision:** Conflicts exist only among the currently edited plan, saved future working sets, and saved future final sets.
- **Consequences:** Completed-service records are not judged as conflicts; they only provide backward non-repetition input. Non-repetition period changes are blocked only when they would create conflicts between currently saved non-completed plans.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discoveries 21–22.

### DEC-2026-07-06-10 — Permissions separate service sets, knowledge, repertoire, and preferences

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Different roles are responsible for different kinds of domain activity.
- **Options considered:** broad shared editing rights; separated responsibility by activity area.
- **Decision:** Permissions distinguish service set management, shared knowledge management, organist repertoire management, congregation preference administration, and own song preferences.
- **Consequences:** Admin manages shared knowledge and congregation preferences; organist manages repertoire; priest and admin can save final sets; priest, organist, and congregation member can manage own song preferences within their role limits.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 23.

### DEC-2026-07-07-01 — First implementation slice is Planning Lifecycle First

- **Date:** 2026-07-07
- **Status:** Accepted
- **Context:** Implementation planning needs a first slice that validates the core planning artifact without prematurely designing the full candidate engine, legacy migration, or broader product generalization.
- **Options considered:** knowledge foundation first; planning lifecycle first; candidate selection prototype first; legacy data inspection first.
- **Decision:** The first implementation slice is Planning Lifecycle First. Initial implementation planning should focus on a concrete ordered service set for one service, flexible service rows, requiring a textual note for any row without a song, the lifecycle states `no set exists`, `working set`, `final set`, and `completed-service record`, deletion of saved working/final sets returning to `no set exists`, final sets not being directly edited, and priest/admin permissions for finalization and completion. Automatic final-set completion remains open and must not block the first manual lifecycle slice.
- **Consequences:** The first slice creates the service-set lifecycle where knowledge, repertoire, preferences, and candidate selection can later attach. It avoids premature legacy migration and avoids designing the full candidate engine before the service-set lifecycle exists. The first slice does not include the full candidate selection engine, melody non-repetition engine, antiphon/liturgical-season highlighting, full preference system, legacy migration, multi-congregation support, automatic final-set completion details, or final database schema beyond what is needed for technical design.
- **Related:** `docs/implementation-preparation.md` section 5.

### DEC-2026-07-08-01 — First-slice deployment assumption is single hosted one-congregation web app

- **Date:** 2026-07-08
- **Status:** Accepted
- **Context:** Stack, storage, authentication, backup, and recovery decisions need a concrete production-oriented operating model before they can be evaluated responsibly.
- **Options considered:** local single-user/admin-operated app; single hosted web app for one congregation; stronger hosted multi-role collaboration assumption; future multi-congregation deployment.
- **Decision:** The first production-oriented deployment assumption is a single hosted web app for one congregation, with shared access for priest, organist, admin, and congregation member roles.
- **Consequences:** Storage comparison should consider shared hosted access and backups; authentication design must support real role-bearing actors; congregation members need direct access for entering their own preference votes; congregation member access does not imply planning permissions; local-only assumptions are insufficient for the production direction; multi-congregation support remains future and out of scope; concrete storage, authentication, and hosting choices remain undecided.
- **Related:** `docs/deployment-assumptions.md`.

### DEC-2026-07-08-02 — First-slice runtime storage direction is PostgreSQL-like relational storage

- **Date:** 2026-07-08
- **Status:** Accepted
- **Context:** Planning Lifecycle First needs a production-oriented storage direction before physical schema design and later implementation planning can proceed. The accepted deployment assumption is a single hosted web app for one congregation with shared access by priest, organist, admin, and congregation member roles.
- **Options considered:** PostgreSQL-like relational storage; SQLite-like local relational storage; SQL Server-backed runtime persistence; legacy SQL Server as runtime database; deferring storage further.
- **Decision:** PostgreSQL-like relational storage is accepted as runtime storage direction for Planning Lifecycle First.
- **Consequences:** Storage approach is no longer unresolved at direction level; physical schema still unresolved; ORM/query/migration tooling still unresolved; hosting provider still unresolved; backup/export/restore design still required; legacy SQL Server remains source/reference/import only; SQLite-like and SQL Server-backed runtime directions are not accepted for first production runtime storage.
- **Related:** `docs/adr-first-slice-storage.md`; `docs/planning-lifecycle-first-schema-subset.md`; `docs/first-slice-storage-decision-preparation.md`; `docs/deployment-assumptions.md`.

### DEC-2026-07-08-03 — First-slice schema open questions resolved at design level

- **Date:** 2026-07-08
- **Status:** Accepted
- **Context:** The documentation-only first-slice physical schema draft raised several open schema questions that needed design-level resolution before later physical schema, tooling, provider, auth, and implementation decisions.
- **Options considered:** leave all first-slice schema questions open; resolve main questions at documentation/design level while keeping physical implementation decisions deferred.
- **Decision:** The main first-slice schema open questions are resolved at documentation/design level according to `docs/first-slice-schema-open-questions-resolution.md`.
- **Consequences:** Opaque stable identifiers are accepted at design level; lifecycle timestamps are operational metadata, not full audit history; unsaved service defaults are not persisted historical data; persisted planning/completed contexts require priest and organist at application/domain validation level; completed record and saved non-completed set should not coexist as active states for same service context; completed records must be self-contained through copied rows; `source_service_set_id` is optional trace only; first-slice song validation is shape-only until catalog exists; minimal seed/setup data is needed but mechanism is unresolved; SQL/Prisma/migrations/provider/tooling/auth/implementation remain unresolved.
- **Related:** `docs/first-slice-schema-open-questions-resolution.md`; `docs/first-slice-physical-schema-draft.md`; `docs/adr-first-slice-storage.md`.

### DEC-2026-07-08-04 — First-slice tooling direction is Drizzle-like typed SQL/schema toolkit plus migrations

- **Date:** 2026-07-08
- **Status:** Accepted
- **Context:** Planning Lifecycle First needs ORM/query/migration tooling direction before later physical schema files, migrations, local development workflow, and implementation planning can proceed. PostgreSQL-like relational storage is already accepted as the first-slice runtime storage direction, and the first-slice physical schema draft is small, relational, and lifecycle-oriented.
- **Options considered:** Drizzle-like typed SQL/schema toolkit plus migrations; Prisma-like ORM plus migrations; Kysely-like query builder plus separate migration tooling; raw SQL migrations plus lightweight query layer; deferring tooling further.
- **Decision:** Drizzle-like typed SQL/schema toolkit plus migrations is accepted as the ORM/query/migration tooling direction for Planning Lifecycle First.
- **Consequences:** ORM/query/migration tooling is no longer unresolved at direction level; schema files remain unresolved; migrations remain uncreated; exact package/version/configuration remain unresolved; database provider remains unresolved; hosting remains unresolved; auth remains unresolved; domain/application lifecycle validation remains mandatory; Prisma-like, Kysely-like, raw SQL-only, and further deferral are not accepted for this first-slice tooling direction.
- **Related:** `docs/adr-first-slice-tooling.md`; `docs/first-slice-tooling-decision-preparation.md`; `docs/first-slice-physical-schema-draft.md`; `docs/first-slice-schema-open-questions-resolution.md`; `docs/adr-first-slice-storage.md`.

### DEC-2026-07-09-01 — Minimal runnable scaffold baseline for Phase 2

- **Date:** 2026-07-09
- **Status:** Accepted
- **Context:** Phase 2 needs the smallest implementation baseline that can create the first runnable scaffold PR without starting product implementation or widening scope into storage, auth, schema, UI, API, or test decisions.
- **Options considered:** continue deferring framework/package-manager selection; accept a minimal scaffold-only baseline; accept the whole stack/storage/auth ADR as production-ready.
- **Decision:** Phase 2 uses a lightweight full-stack TypeScript app direction with Next.js App Router as the framework for the first runnable scaffold, npm as the package manager, and a TypeScript strict baseline. The first scaffold must not include a database, Drizzle schema, migrations, auth provider, persistence, service-set UI, service-set API, product workflows, or production-readiness claims.
- **Consequences:** This decision only unblocks the runnable scaffold PR. It does not change the accepted PostgreSQL-like runtime storage direction or Drizzle-like typed SQL/schema toolkit plus migrations direction, and it does not choose a database provider, hosting provider, auth provider, Drizzle package versions, schema layout, migration workflow, UI design, API contracts, or test strategy.
- **Related:** `docs/implementation-preparation.md`; `docs/adr-planning-lifecycle-stack-storage-auth.md`; `docs/backlog.md`; `docs/adr-first-slice-storage.md`; `docs/adr-first-slice-tooling.md`.

### DEC-2026-07-09-02 — Minimal Phase 6 persistence implementation baseline

- **Date:** 2026-07-09
- **Status:** Accepted
- **Context:** Phase 6 needs the smallest concrete persistence baseline that can unblock the first Drizzle schema and migration PR without selecting production operations, auth, hosting, UI/API contracts, tests, seeds, or the complete target schema.
- **Options considered:** keep persistence implementation details deferred; accept a minimal PostgreSQL + Drizzle implementation baseline for the first Planning Lifecycle persistence subset; treat the whole application as production-ready.
- **Decision:** Phase 6 uses PostgreSQL as the concrete local persistence target for the first schema/migration PR, Drizzle ORM plus `drizzle-kit` as the concrete package direction for first implementation, schema files under `src/db/schema`, migrations under `drizzle`, Drizzle config in `drizzle.config.ts`, and local database access via `DATABASE_URL`. The first migration must be generated SQL that is reviewable before execution.
- **Consequences:** The first schema/migration PR is unblocked at baseline level only. This documentation PR does not install packages, create schema files, migrations, SQL, DB config, or runtime persistence. Auth provider, hosting provider, production DB provider, backup/export/restore, final deployment, API contracts, UI changes, seed strategy, test strategy, and complete target schema remain out of scope. Domain/application validation remains mandatory and is not replaced by DB constraints or Drizzle schema. The application is not production-ready.
- **Related:** `docs/implementation-preparation.md`; `docs/adr-first-slice-storage.md`; `docs/adr-first-slice-tooling.md`; `docs/adr-planning-lifecycle-stack-storage-auth.md`; `docs/backlog.md`; `docs/planning-lifecycle-first-schema-subset.md`.

## Active Proposals

No active proposals are recorded at this time.

## Superseded Decisions

No formal decisions are superseded. The 2026-07-06 antiphon and liturgical-season decision corrects an earlier working assumption, not a previously accepted decision.

## Review Cadence

Review decisions when domain analysis changes, when requirements are drafted from these decisions, or when implementation exposes a mismatch with the documented domain model.
