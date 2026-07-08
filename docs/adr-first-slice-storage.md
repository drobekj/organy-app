# ADR: First-Slice Runtime Storage Direction

## Status

Accepted

## Context

Planning Lifecycle First is the accepted first implementation slice. The storage-neutral subset for that slice is described in `docs/planning-lifecycle-first-schema-subset.md`, and the storage tradeoffs for the slice are prepared in `docs/first-slice-storage-decision-preparation.md`.

The accepted first production-oriented deployment assumption is a single hosted web app for one congregation with shared access by priest, organist, admin, and congregation member roles. This deployment assumption creates a need for durable hosted persistence, safe lifecycle writes, ordered rows, completed history, and credible backup/export/restore expectations even though the first-slice subset is intentionally small.

The legacy SQL Server / SSMS database `VarhanniDoprovody` remains important source knowledge, but it is not the target runtime architecture and must not force a direct copy of the legacy table shape.

## Decision

Accept **PostgreSQL-like relational storage** as the runtime storage direction for the first production-oriented Planning Lifecycle First slice.

This accepts the storage direction only. It does not accept a completed physical schema, database provider, hosting provider, connection management approach, migration tool, ORM/query layer, schema file, implementation plan, authentication provider, or account model.

## Scope of this decision

This decision covers only the first-slice runtime storage direction for Planning Lifecycle First. It does not:

- select a hosting provider;
- select a concrete database provider;
- select an ORM, query layer, migration tool, schema language, or Prisma;
- create or accept a physical schema;
- create database schema files, migrations, Prisma schema, SQL, application code, API endpoints, UI components, or tests;
- select an authentication provider, authentication method, account model, app framework, or concrete authorization implementation;
- begin implementation or create an implementation plan.

## Accepted storage direction

PostgreSQL-like relational storage is accepted because it fits the hosted shared web-app direction for one congregation without binding the project to the legacy SQL Server runtime architecture.

Runtime storage for the first slice must support the subset described in `docs/planning-lifecycle-first-schema-subset.md`, including:

- minimal actor-role representation for permission checks;
- minimal song reference by `(language, number)`;
- service context;
- working/final service set;
- ordered service rows;
- completed-service record;
- ordered completed rows;
- lifecycle distinction between no set, working set, final set, and completed history;
- manual conversion from final set to completed-service record.

This direction is relational and production-oriented, but it remains a direction rather than a physical database design.

## Rejected/deferred alternatives

### SQLite-like local relational storage

SQLite-like local relational storage is not accepted for first production runtime storage because hosted shared access, durable hosting persistence, backup/restore, and concurrency expectations would need too much verification before it could safely serve the accepted single hosted one-congregation deployment assumption.

SQLite-like storage may remain useful for local experiments or throwaway prototypes only if later explicitly allowed.

### SQL Server-backed runtime persistence

SQL Server-backed runtime persistence is not accepted for the first slice. Although it has legacy continuity, it adds operational weight and increases the risk of preserving the legacy `VarhanniDoprovody` table shape.

SQL Server remains the legacy source/reference system.

### Legacy SQL Server as runtime database

The legacy SQL Server database is not accepted as the runtime app database. PostgreSQL-like storage does not mean copying legacy data directly, and the runtime app database must be designed from accepted target concepts rather than the legacy schema.

Legacy SQL Server remains source knowledge, import evidence, and reference material only.

### Deferring storage further

Deferring storage further is rejected because physical schema design and later implementation planning would remain blocked at the storage-direction level.

### ORM/query/migration tool selection

ORM, query layer, migration tooling, and schema-file decisions are deferred. This ADR does not select Prisma or any other tool.

## Rationale against first-slice subset

The first-slice subset is small but not storage-free in production. It needs durable storage for service context, non-completed service sets, ordered rows, completed-service records, completed rows, minimal song references, and minimal actor-role information for permission checks.

PostgreSQL-like relational storage fits these structured needs while preserving the subset's important lifecycle distinctions:

- no saved non-completed set;
- working set;
- final set that is not edited directly;
- completed-service record as historical record;
- ordered service rows and ordered completed rows;
- row content that may be a song reference or a textual note.

The direction also supports future physical schema design without assuming fixed four-song slots, without copying legacy SQL Server tables, and without requiring the full future candidate-selection, repertoire, preference, melody non-repetition, or import model in the first slice.

## Rationale against deployment assumption

The accepted deployment assumption is a single hosted web app for one congregation with shared access by priest, organist, admin, and congregation member roles. That assumption makes production storage more demanding than a local-only prototype.

PostgreSQL-like relational storage is accepted because it fits hosted shared web-app expectations for durable persistence, safe lifecycle writes, completed history, and operational backup/export/restore planning. It does this without selecting a hosting provider or database provider.

## Backup/export/restore implications

Backup, export, and restore expectations must be designed before production use. Accepting PostgreSQL-like relational storage does not by itself define:

- backup frequency;
- backup ownership;
- export format;
- restore procedure;
- restore testing;
- operational access for recovery;
- acceptable data-loss window.

These remain required follow-up design decisions before production operation.

## Local development implications

Local development workflow must still be defined. The project has not yet decided whether development will use a local database service, container, remote development database, generated fixtures, seed data, or another workflow.

The accepted direction means local development should be evaluated against PostgreSQL-like relational storage, but it does not select tooling, scripts, providers, schema files, migrations, or test infrastructure.

## Legacy SQL Server boundary

Legacy SQL Server remains source knowledge/import/reference only. It may inform domain understanding, data assessment, and future import/refactoring decisions, but it is not the runtime app database.

Any future import must transform legacy meaning into accepted domain concepts instead of copying the legacy schema directly.

## Consequences

- Storage approach is no longer unresolved at the direction level for Planning Lifecycle First.
- Physical schema remains unresolved.
- ORM/query/migration tooling remains unresolved.
- Hosting provider and database provider remain unresolved.
- Authentication provider and account model remain unresolved.
- Backup/export/restore design remains required before production use.
- Local development database workflow remains unresolved.
- Legacy SQL Server remains source/reference/import only.
- SQLite-like and SQL Server-backed runtime directions are not accepted for first production runtime storage.
- Coding still must not begin merely because storage direction is accepted.

## Still unresolved

The following remain unresolved:

- exact database provider;
- hosting provider;
- connection management;
- physical schema;
- schema files;
- migration tool;
- ORM/query layer;
- local development database workflow;
- backup/export/restore design;
- authentication provider;
- account model;
- application framework;
- implementation plan.

## Follow-up decisions

Follow-up decisions should address:

1. physical schema design for Planning Lifecycle First against the accepted PostgreSQL-like relational direction;
2. ORM/query layer and migration tooling selection;
3. database provider and hosting provider selection;
4. connection management and environment configuration expectations;
5. backup/export/restore ownership, format, procedure, and restore testing;
6. local development database workflow;
7. authentication provider and account model;
8. how legacy SQL Server reference/import boundaries remain explicit during future data work.
