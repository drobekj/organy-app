# ADR: First-Slice Tooling Direction

## Status

Accepted.

## Context

Planning Lifecycle First already has an accepted runtime storage direction: PostgreSQL-like relational storage for the first slice in `docs/adr-first-slice-storage.md`. The tooling decision is prepared by `docs/first-slice-tooling-decision-preparation.md` and must be read together with the draft physical table shape in `docs/first-slice-physical-schema-draft.md` and the accepted design-level schema-question resolutions in `docs/first-slice-schema-open-questions-resolution.md`.

The first-slice schema draft is intentionally small, relational, and lifecycle-oriented. It exists to support planning lifecycle behavior, ordered rows, completed history, and role-aware permission checks without copying the legacy SQL Server schema or turning persistence records into the domain model.

## Decision

Accept **Drizzle ORM plus `drizzle-kit`** as the concrete tooling package direction for the first Planning Lifecycle schema/migration implementation. Schema files will be placed under `src/db/schema`, migrations under `drizzle`, and Drizzle configuration in `drizzle.config.ts`. The first migration must be generated SQL that is reviewable before execution.

This direction is accepted because the project already accepts PostgreSQL/PostgreSQL-like relational storage for the first slice, and Drizzle tooling stays close to relational tables while providing TypeScript-friendly schema and query ergonomics.

## Scope of this decision

This decision accepts the tooling direction only. It does not:

- create schema files;
- create migrations;
- create SQL;
- install Drizzle or any package;
- select exact versions or command workflow;
- select database provider, hosting provider, authentication provider, account model, or application framework;
- begin implementation.

## Accepted tooling direction

Drizzle-like tooling is accepted as a direction for:

- typed schema representation;
- typed query support;
- migration workflow.

The tooling must support or preserve:

- the eight draft table candidates: `persons`, `actors`, `role_assignments`, `service_contexts`, `service_sets`, `service_set_rows`, `completed_service_records`, and `completed_service_rows`;
- opaque stable identifiers;
- lifecycle timestamps as metadata;
- ordered rows;
- one saved non-completed service set per service context;
- self-contained completed-service records;
- shape-only song-reference validation;
- actor/role data for permission checks.

## Rejected/deferred alternatives

### Prisma-like ORM plus migrations

Not accepted for the first slice. Although productive, a Prisma-like ORM carries higher risk of generated-model coupling, schema distortion, and domain rules becoming hidden behind generated client patterns.

### Kysely-like query builder plus separate migration tooling

Not accepted for the first slice. It keeps query control explicit, but requires more separate decisions and schema/type synchronization discipline than needed right now.

### Raw SQL migrations plus lightweight query layer

Not accepted for the first slice. It maximizes transparency, but may underinvest in TypeScript ergonomics and create more manual boilerplate.

### Deferring tooling further

Rejected. Further deferral would keep physical schema files, migrations, local development workflow, and implementation planning blocked.

### Version/command selection

Deferred. Exact versions and command workflow remain future implementation-preparation work. Package direction, schema directory, migration directory, and config-file location are accepted only as the minimal Phase 6 baseline.

## Rationale against first-slice schema draft

The draft schema in `docs/first-slice-physical-schema-draft.md` is relational and compact. A Drizzle-like direction should map naturally to its eight draft table candidates, foreign-key-shaped relationships, ordering fields, lifecycle metadata fields, and uniqueness expectations without encouraging a generated object model to reshape the schema.

The accepted schema-question resolutions in `docs/first-slice-schema-open-questions-resolution.md` remain binding design context: identifiers are opaque and stable at design level; lifecycle timestamps are operational metadata; saved non-completed sets and completed records represent different lifecycle states; completed-service records are self-contained through copied rows; and song references remain shape-only until a catalog exists.

## Rationale against domain/application validation boundary

Schema definitions are not the domain model. Typed schema and typed query helpers may support persistence code, but lifecycle rules must remain explicit in application/domain services, including:

- save working set;
- finalize set;
- delete working/final set;
- reorder rows;
- complete final set;
- enforce planning permissions.

The accepted tooling direction must not replace application/domain validation with generated/schema models or database constraints alone.

## Migration and review implications

Migrations must be reviewable before execution. The first migration must be generated SQL and inspected before it is run. Future workflow decisions must define exact commands and approval steps. This ADR does not create migrations, SQL, or choose migration commands.

## Local development implications

Local development workflow remains unresolved. Future work must define local database setup, migration execution, reset behavior, seed/setup data, environment configuration, and developer onboarding using the accepted tooling direction.

## Hosted deployment implications

Hosted deployment migration workflow remains unresolved. Database provider, hosting provider, migration execution timing, connection configuration, backup/export/restore design, and deployment sequencing remain future decisions.

## Legacy SQL Server boundary

Legacy SQL Server remains source/reference/import only, not runtime storage. Tooling must support the target first-slice relational runtime direction and must not reproduce the `VarhanniDoprovody` schema as the application schema.

## Consequences

- ORM/query/migration tooling is no longer unresolved at the direction level.
- Physical schema content remains unresolved and uncreated.
- Schema files will live under `src/db/schema` when created.
- Migrations will live under `drizzle` when created.
- Drizzle config will live in `drizzle.config.ts` when created.
- Migrations and SQL remain uncreated.
- Package direction is Drizzle ORM plus `drizzle-kit`; exact versions remain unresolved.
- Database provider remains unresolved.
- Hosting remains unresolved.
- Auth remains unresolved.
- Domain/application lifecycle validation remains mandatory.
- Prisma-like, Kysely-like, raw SQL-only, and further deferral are not accepted for this first-slice tooling direction.

## Still unresolved

- Exact package versions.
- Tool configuration content.
- Migration generation, review, and execution workflow.
- Local development database workflow.
- Hosted deployment migration workflow.
- Database provider.
- Hosting provider.
- Authentication provider and account model.
- Application framework.
- Transaction approach for save, finalize, delete, reorder, and complete lifecycle operations.
- Test strategy.

## Follow-up decisions

- Define exact package versions and configuration content.
- Define migration workflow and review process.
- Define local development database workflow.
- Define hosted deployment migration workflow.
- Define transaction approach for lifecycle operations.
- Preserve the application/domain validation boundary during implementation design.
