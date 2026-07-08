# First-Slice Tooling Decision Preparation

## 1. Purpose

This document prepares a future ORM, query-layer, and migration-tooling decision for **Planning Lifecycle First**.

It evaluates tooling directions against the accepted PostgreSQL-like relational storage direction, the first-slice physical schema draft, the accepted schema-question resolutions, and the accepted single hosted one-congregation deployment assumption.

This is a decision-preparation document only. It does not select tooling and does not mean implementation can start.

## 2. Non-goals

This document does not:

- select Prisma, Drizzle, Kysely, raw SQL, an ORM, a query layer, a migration tool, a database provider, a hosting provider, an authentication provider, or an application framework;
- create application code, database schema files, migrations, Prisma schema, Drizzle schema, SQL, tests, UI components, or API endpoints;
- create an implementation plan;
- mark the whole stack/storage/auth ADR as accepted;
- decide exact physical ID representation, timestamp type, provider-specific database features, backup procedure, local development workflow, account model, or auth integration;
- treat the legacy SQL Server `VarhanniDoprovody` schema as the target runtime model.

## 3. Inputs

Primary inputs:

- `docs/first-slice-physical-schema-draft.md`
- `docs/first-slice-schema-open-questions-resolution.md`
- `docs/adr-first-slice-storage.md`
- `docs/planning-lifecycle-first-schema-subset.md`
- `docs/first-slice-storage-decision-preparation.md`
- `docs/target-technical-schema-draft.md`
- `docs/target-domain-persistence-model.md`
- `docs/auth-account-role-model.md`
- `docs/deployment-assumptions.md`
- `docs/legacy-to-domain-mapping.md`
- `docs/adr-planning-lifecycle-stack-storage-auth.md`
- `docs/implementation-preparation.md`
- `docs/architecture.md`
- `docs/backlog.md`
- `docs/technical-design-planning-lifecycle.md`
- `docs/domain-model.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/decisions.md`

## 4. Accepted context

Accepted context for this preparation:

- Planning Lifecycle First is the first implementation slice.
- PostgreSQL-like relational storage is accepted as the first-slice runtime storage direction.
- The first production-oriented deployment assumption is a single hosted web app for one congregation.
- Direct access roles are priest, organist, admin, and congregation member.
- Multi-congregation support is out of scope for the first slice.
- Legacy SQL Server remains source knowledge, import evidence, and reference material only.
- Runtime persistence must not copy the legacy SQL Server schema directly.
- Opaque stable identifiers are accepted at design level, without choosing exact physical representation.
- Lifecycle timestamps are operational event metadata, without choosing exact type, precision, timezone handling, or generation responsibility.
- Business lifecycle validation must remain explicit in the domain/application layer, not only implicit in generated models or database constraints.

## 5. First-slice tooling needs

The future tooling choice must be able to represent or support the draft first-slice tables:

- `persons`
- `actors`
- `role_assignments`
- `service_contexts`
- `service_sets`
- `service_set_rows`
- `completed_service_records`
- `completed_service_rows`

The tooling direction must also support:

- PostgreSQL-like relational storage;
- opaque stable identifiers without tying runtime identity to legacy IDs;
- lifecycle timestamps as operational metadata;
- ordered service rows and ordered completed rows;
- at most one saved non-completed service set per service context;
- song-reference shape validation for Czech or Polish concrete song language, non-empty song number, and no Mixed song language;
- minimal actor and role data for permission checks;
- explicit domain/application lifecycle validation;
- self-contained completed-service records through copied completed rows;
- reviewable migrations before execution;
- a later local development workflow;
- future extension without forcing catalog, melody, repertoire, preferences, or full legacy import into the first slice.

## 6. Evaluation criteria

Each option is evaluated for:

- fit with PostgreSQL-like storage direction;
- fit with the first-slice physical schema draft;
- fit with opaque IDs and lifecycle timestamp strategy;
- support for constraints and invariants;
- support for application/domain validation boundaries;
- migration clarity;
- local development workflow impact;
- hosted deployment impact;
- backup/export/restore implications;
- TypeScript developer experience;
- risk of overengineering;
- risk of underengineering;
- risk of tool-driven schema distortion;
- risk of hiding domain rules inside generated models;
- what must be verified before accepting.

## 7. Option A — Prisma-like ORM plus migrations

A Prisma-like direction means schema-first or model-first ORM tooling with generated TypeScript client APIs and integrated migration workflow.

- **Fit with PostgreSQL-like storage direction:** Likely strong for common relational tables, references, indexes, and basic constraints. Provider-specific constraint patterns and partial uniqueness may need careful verification.
- **Fit with first-slice physical schema draft:** The eight-table draft is small enough for this style. The option must avoid reshaping the schema around generated relation convenience instead of lifecycle concepts.
- **Fit with opaque IDs and lifecycle timestamps:** Generated models can represent opaque IDs and timestamp fields, but exact defaults, update behavior, and generation responsibility must be explicit rather than assumed.
- **Support for constraints and invariants:** Basic foreign keys, required fields, enums, and uniqueness are likely straightforward. More nuanced rules, such as one active non-completed set per context or row content shape, may require provider-specific constraints, application validation, or both.
- **Support for application/domain validation boundaries:** Strong generated models can improve productivity, but they must not become the only place lifecycle meaning lives. Finalization, completion, deletion, permission checks, and song-reference shape rules still need explicit domain/application validation.
- **Migration clarity:** Integrated migrations may be productive and reviewable, but generated migration output must be inspected for unwanted table shape, implicit defaults, or provider-specific surprises.
- **Local development workflow impact:** Usually good once a local or remote development database exists. The project still needs a separate local database, seed, reset, and environment workflow decision.
- **Hosted deployment impact:** Commonly compatible with hosted PostgreSQL-like providers, but connection management, migration execution, build-time generation, and deployment sequencing must be verified.
- **Backup/export/restore implications:** Does not replace provider-level backups or export/restore procedures. Generated models should not obscure the relational data that must be restored.
- **TypeScript developer experience:** Potentially very strong because generated client types reduce boilerplate and improve query ergonomics.
- **Risk of overengineering:** Moderate if the ORM encourages a broad model layer before the first slice needs it.
- **Risk of underengineering:** Low to moderate for the first slice, unless unsupported constraint needs are pushed silently into ad hoc application code.
- **Risk of tool-driven schema distortion:** Meaningful. The future ADR must verify that table names, join shape, nullable fields, constraints, and lifecycle rows remain aligned with the draft rather than ORM convenience.
- **Risk of hiding domain rules inside generated models:** Meaningful. Generated create/update types are not a substitute for explicit lifecycle use cases and permission checks.
- **Must be verified before accepting:** Constraint support, migration diff review quality, generated client behavior for transactions, partial/conditional uniqueness strategy, timestamp/default behavior, local workflow, deployment migration process, and how domain validation remains outside generated models.

## 8. Option B — Drizzle-like typed SQL/schema toolkit plus migrations

A Drizzle-like direction means TypeScript-defined schema and typed query helpers that stay relatively close to SQL, usually with a migration workflow.

- **Fit with PostgreSQL-like storage direction:** Likely strong because the style maps closely to relational tables, columns, indexes, and PostgreSQL-like capabilities.
- **Fit with first-slice physical schema draft:** The draft tables and constraints can likely be expressed with good schema control. The option should preserve explicit table concepts and flexible ordered rows.
- **Fit with opaque IDs and lifecycle timestamps:** Opaque IDs and lifecycle timestamp columns can be represented directly. Defaults and update behavior still need explicit policy.
- **Support for constraints and invariants:** Closeness to SQL may make constraints and indexes transparent. Application-level invariants still need explicit implementation outside the schema definitions.
- **Support for application/domain validation boundaries:** Typed schema code can support repository/query code without forcing domain rules into generated entity classes. The project must still avoid treating schema definitions as the domain model.
- **Migration clarity:** Potentially clear if migration output is readable and reviewable. Ergonomics for generated versus manually curated migrations must be verified.
- **Local development workflow impact:** Good once database setup exists, but the project must decide how migrations, seeds, resets, and developer onboarding work.
- **Hosted deployment impact:** Likely compatible with hosted PostgreSQL-like providers. Migration execution, connection pooling, and environment configuration remain separate decisions.
- **Backup/export/restore implications:** Keeps relational shape visible, which can help future export/restore reasoning. It still does not provide backups by itself.
- **TypeScript developer experience:** Strong for developers comfortable with SQL-shaped TypeScript. It may be less abstract than a full ORM but more explicit.
- **Risk of overengineering:** Moderate if schema and query helpers become too elaborate before the first slice needs them.
- **Risk of underengineering:** Low to moderate, depending on migration maturity and transaction/query patterns.
- **Risk of tool-driven schema distortion:** Lower than heavier ORM styles, but still present if TypeScript schema convenience drives physical design.
- **Risk of hiding domain rules inside generated models:** Lower than model-heavy tooling, but schema types can still be mistaken for domain validation.
- **Must be verified before accepting:** Migration ergonomics, generated SQL review, constraint/index expressiveness, transaction support, seed/reset workflow, hosted migration process, and whether the added toolkit complexity is justified for the first slice.

## 9. Option C — Kysely-like query builder plus separate migration tooling

A Kysely-like direction means a typed SQL query builder for application queries, paired with separate migration tooling or manually maintained migration definitions.

- **Fit with PostgreSQL-like storage direction:** Strong for relational query control. The database remains visibly SQL-shaped.
- **Fit with first-slice physical schema draft:** The draft schema can be represented if the team maintains schema types and migrations with discipline.
- **Fit with opaque IDs and lifecycle timestamps:** Opaque ID and timestamp choices remain explicit, but generated or handwritten TypeScript database types must stay synchronized with migrations.
- **Support for constraints and invariants:** Database constraints can be implemented through the separate migration tool. Query builder types do not by themselves enforce lifecycle invariants.
- **Support for application/domain validation boundaries:** Strong separation is possible: migrations define storage, query builders perform persistence, and domain/application services enforce lifecycle behavior. The project must design that separation intentionally.
- **Migration clarity:** Depends heavily on the separate migration tool. This option can be very clear with reviewed SQL-like migrations, or fragile if schema and types drift.
- **Local development workflow impact:** Requires more decisions: migration runner, schema type generation or maintenance, seed/reset commands, and database setup.
- **Hosted deployment impact:** Compatible in principle, but deployment must coordinate the query layer, migration runner, and connection management.
- **Backup/export/restore implications:** Transparent relational schema can help backup/export/restore reasoning. Tooling does not provide operational recovery.
- **TypeScript developer experience:** Good query type safety, but more manual setup than full ORM or integrated schema toolkit.
- **Risk of overengineering:** Moderate if separate tools, generated DB types, and custom repository patterns become too much for the first slice.
- **Risk of underengineering:** Moderate if migrations, type synchronization, or transaction discipline are left informal.
- **Risk of tool-driven schema distortion:** Relatively low because queries can follow the schema, but type-generation limitations could still influence schema choices.
- **Risk of hiding domain rules inside generated models:** Low if the query builder remains persistence-only. Risk returns if repository helpers start embedding lifecycle rules inconsistently.
- **Must be verified before accepting:** Migration tool choice, schema/type synchronization, transaction patterns, constraint support, local workflow, hosted migration execution, and expected maintenance burden.

## 10. Option D — Raw SQL migrations plus lightweight query layer

A raw SQL migration direction means reviewed SQL migration files define schema changes, while application code uses a minimal query helper, small repository layer, or thin typed wrapper.

- **Fit with PostgreSQL-like storage direction:** Very strong for exact PostgreSQL-like relational control, assuming the final provider supports the chosen SQL features.
- **Fit with first-slice physical schema draft:** Strong for preserving the draft shape, including explicit constraints, indexes, ordered rows, and self-contained completed history.
- **Fit with opaque IDs and lifecycle timestamps:** Exact ID and timestamp choices remain fully explicit. The project must still decide defaults and generation responsibility.
- **Support for constraints and invariants:** Strong for database-level constraints that can be expressed directly. Application/domain lifecycle validation remains necessary for rules that span permissions, state transitions, and user intent.
- **Support for application/domain validation boundaries:** Clear separation is possible because SQL defines storage and application code defines lifecycle behavior. The risk is inconsistent validation if no typed boundary is established.
- **Migration clarity:** Potentially strongest: reviewers see the exact migration. It also requires more database expertise and discipline.
- **Local development workflow impact:** Requires explicit migration runner, reset, seed, and database setup choices. There is less integrated tooling help.
- **Hosted deployment impact:** Compatible with hosted PostgreSQL-like providers if migration execution and connection management are designed. Provider-specific SQL must be controlled.
- **Backup/export/restore implications:** Transparent schema can simplify export/restore reasoning. Backups remain an operational provider/process decision.
- **TypeScript developer experience:** Potentially weaker unless paired with generated types, validation schemas, or carefully typed query helpers.
- **Risk of overengineering:** Low to moderate. The approach can stay small, but custom infrastructure can grow if not bounded.
- **Risk of underengineering:** Meaningful if type safety, query reuse, transaction handling, or migration execution are too manual.
- **Risk of tool-driven schema distortion:** Lowest among active tooling options because SQL can follow the intended schema directly.
- **Risk of hiding domain rules inside generated models:** Low, provided lifecycle rules are not scattered into SQL-only checks or repository shortcuts.
- **Must be verified before accepting:** Migration runner, SQL review conventions, TypeScript type strategy, transaction helpers, local workflow, hosted migration execution, and whether manual boilerplate is acceptable.

## 11. Option E — Defer tooling decision further

Deferring tooling means no ORM, query builder, or migration direction is selected yet.

- **Fit with PostgreSQL-like storage direction:** Temporarily acceptable only because the storage direction is already accepted. It does not help express the physical schema.
- **Fit with first-slice physical schema draft:** Poor beyond short-term discussion. Schema files, migrations, implementation planning, and local development workflow remain blocked.
- **Fit with opaque IDs and lifecycle timestamps:** Leaves exact representation and generation responsibility unresolved.
- **Support for constraints and invariants:** Leaves enforcement split unresolved.
- **Support for application/domain validation boundaries:** Keeps the boundary discussion open, but does not make it implementable.
- **Migration clarity:** None yet.
- **Local development workflow impact:** Blocks concrete local database setup, seed/reset expectations, and developer onboarding.
- **Hosted deployment impact:** Blocks migration execution and deployment sequencing decisions.
- **Backup/export/restore implications:** Blocks practical verification against real schema artifacts and provider capabilities.
- **TypeScript developer experience:** Unknown until a direction is selected.
- **Risk of overengineering:** Low in the immediate term because no tool is added.
- **Risk of underengineering:** Increasing. The project cannot create physical schema artifacts or implementation plans responsibly without a tooling direction.
- **Risk of tool-driven schema distortion:** Low while deferred, but distortion risk is merely postponed.
- **Risk of hiding domain rules inside generated models:** Low while deferred, but validation architecture is also postponed.
- **Must be verified before accepting:** Deferral can only be accepted briefly, with a clear next decision point. Physical schema files and implementation planning must remain blocked until tooling is decided.

## 12. Cross-option comparison table

| Option | Main strength | Main risk | Migration clarity | TypeScript experience | Domain-rule boundary risk | First-slice suitability question |
| --- | --- | --- | --- | --- | --- | --- |
| Prisma-like ORM plus migrations | High productivity and generated client ergonomics | Schema distortion or generated-model coupling | Potentially good if generated migrations are reviewed | Very strong | Medium to high | Can it preserve explicit lifecycle schema and validation outside generated models? |
| Drizzle-like typed SQL/schema toolkit plus migrations | Close SQL control with typed schema | Migration ergonomics and project complexity | Potentially good | Strong | Medium | Does it add the right amount of structure without overcomplicating the first slice? |
| Kysely-like query builder plus separate migration tooling | Query control with type-safe SQL style | Separate migration and type-sync discipline | Depends on migration tool | Good | Low to medium | Can the project maintain schema/types/migrations cleanly? |
| Raw SQL migrations plus lightweight query layer | Maximum transparency and schema control | Manual boilerplate and weaker type integration | Strong if SQL is reviewed directly | Variable | Low to medium | Can the project keep queries typed and maintainable without excessive custom work? |
| Defer tooling decision further | Avoids premature selection | Blocks schema artifacts and implementation planning | None | Unknown | Deferred | Is there a near-term reason to delay despite blocking downstream work? |

## 13. Decision pressure and tradeoffs

The tooling decision is now a near-term blocker for physical schema artifacts, migrations, local development workflow design, and implementation planning. Deferral remains possible only briefly.

The main tradeoff is between integrated productivity and explicit control:

- More integrated ORM-style tooling may speed development but must be checked for schema control, migration review, and generated-model coupling.
- SQL-closer tooling may preserve the intended relational shape and lifecycle boundaries, but may require more manual migration, type, and query discipline.
- Raw SQL may maximize transparency but can underinvest in TypeScript safety and developer ergonomics if not paired with a disciplined lightweight query approach.

No option should be accepted unless it can keep first-slice lifecycle rules explicit in domain/application code while also preserving important database constraints and reviewable migrations.

## 14. Questions that must be answered before accepting tooling

Before a tooling ADR is accepted, answer at least:

1. How will the tool represent the eight draft tables without copying legacy SQL Server shape?
2. How will opaque IDs be generated and typed?
3. How will lifecycle timestamps be stored, generated, updated, and compared?
4. Which invariants are enforced by database constraints, and which are enforced by application/domain validation?
5. How will the schema support at most one saved non-completed service set per service context?
6. How will song-reference shape validation prevent Mixed as a concrete song language and require non-empty song numbers?
7. How will ordered rows be inserted, reordered, and persisted transactionally?
8. How will completion copy rows into self-contained completed-service history?
9. How will migrations be reviewed before execution?
10. How will local development run migrations, seed minimal actors/persons/roles, and reset data later?
11. How will hosted deployment run migrations safely?
12. How will backup/export/restore expectations be verified against the chosen schema and provider?
13. How will generated or inferred TypeScript types avoid becoming the domain model?
14. How will permission checks use actor/role data at state-changing boundaries?
15. What project complexity does the tool add, and is it proportionate to the first slice?

## 15. Provisional candidates for a future ADR

A future ADR may compare these candidate directions without assuming any is preferred:

- Prisma-like ORM plus migrations, if schema control, migration review, transaction support, and domain-validation boundaries are verified.
- Drizzle-like typed SQL/schema toolkit plus migrations, if migration ergonomics, hosted deployment flow, and project complexity are verified.
- Kysely-like query builder plus separate migration tooling, if migration tooling and schema/type synchronization are verified.
- Raw SQL migrations plus lightweight query layer, if TypeScript safety, transaction handling, and developer workflow are verified.
- Brief continued deferral, only if a specific unresolved dependency makes tooling selection irresponsible and downstream schema/implementation work remains explicitly blocked.

## 16. What a future tooling ADR must decide

A future tooling ADR must decide:

- ORM/query-layer direction;
- migration tooling direction;
- whether schema definitions are generated, manually authored, or SQL-authored;
- how migration review and execution work;
- how database constraints and application/domain validation are divided;
- how TypeScript types are produced and kept aligned with schema;
- how transactions support save, finalize, delete, reorder, and complete lifecycle operations;
- what local development database workflow is assumed by the tooling;
- what hosted deployment migration workflow is assumed by the tooling;
- what remains explicitly deferred, including provider, hosting, auth provider, account model, backup/export/restore implementation details, and application framework if still unresolved.

The ADR must also state that accepting tooling does not itself create schema files, migrations, SQL, application code, API endpoints, UI components, tests, or permission to begin unrelated implementation work.
