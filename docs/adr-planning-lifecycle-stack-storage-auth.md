# ADR: Planning Lifecycle Stack, Storage, and Authorization Direction

## Status

Proposed

## Context

The first implementation slice is **Planning Lifecycle First**. It is limited to planning one concrete ordered service set for one service in the scope of one local congregation.

The repository is currently documentation-first. Repository inspection found no selected application framework, runtime, persistence technology, database schema, migration tooling, authentication mechanism, API setup, UI setup, or test framework. This ADR therefore proposes direction only; it does not create project files or implementation structure.

For this first slice:

- there is no full candidate engine yet;
- there is no non-repetition engine yet;
- there is no legacy migration yet;
- there is no multi-congregation support yet;
- final sets are not directly edited;
- completed-service records are historical, not active non-completed plans;
- role permissions must be enforced in application/domain behavior, not only hidden in UI.

## Decision Drivers

- Keep the first implementation minimal and reviewable.
- Preserve strong domain-rule enforcement at application/domain boundaries.
- Support easy local development before larger operational decisions are needed.
- Maintain traceability to accepted requirements and decisions.
- Persist service sets and ordered rows reliably enough for lifecycle behavior.
- Represent roles and permissions for priest, organist, admin, and congregation member.
- Avoid premature enterprise, multi-tenant, or multi-congregation complexity.
- Keep future candidate selection, knowledge management, and non-repetition behavior possible.

## Options Considered

### 1. Documentation-only continuation

**Pros**

- Avoids premature technical commitments.
- Keeps the repository aligned with its current documentation-first baseline.
- Allows unresolved legacy, auth, and persistence questions to be explored further.

**Risks**

- Does not validate lifecycle behavior in a runnable system.
- Leaves stack, storage, and auth decisions blocking implementation.
- Delays feedback on how domain rules should be enforced technically.

**Fit for Planning Lifecycle First**

Low. Useful if decisions are still too uncertain, but it does not move the selected first slice toward implementation.

### 2. Lightweight full-stack TypeScript app

**Pros**

- Provides a small end-to-end path for UI, domain/application behavior, persistence access, and tests.
- Can keep local development simple with one language and one project setup.
- Fits a narrow first slice where planning lifecycle behavior is more important than distributed system boundaries.

**Risks**

- The exact framework, routing style, validation libraries, and test tools still need selection.
- A full-stack framework can blur domain-rule enforcement if rules are implemented only in UI handlers.
- Early choices may need adjustment when candidate selection and knowledge management expand.

**Fit for Planning Lifecycle First**

High, if kept conservative: domain/application rules should be separated from UI concerns, and persistence/auth choices should stay minimal but real.

### 3. Backend-first API with separate frontend later

**Pros**

- Encourages explicit application/domain boundaries.
- Makes authorization enforcement easier to centralize outside UI behavior.
- Can support future clients if product scope grows.

**Risks**

- Adds API/client separation before the first slice proves it needs that complexity.
- May slow local development and review for a small one-congregation application.
- Can lead to endpoint design before UI and workflow details are clear enough.

**Fit for Planning Lifecycle First**

Medium. It protects boundaries well, but is likely heavier than needed for the first minimal slice.

### 4. Local-first or prototype storage approach

**Pros**

- Very quick to start for local experimentation.
- Avoids early database operations and hosting decisions.
- Can help explore lifecycle interactions before committing to durable infrastructure.

**Risks**

- May undercut the need to persist lifecycle states, ordered rows, and historical completed-service records reliably.
- Can require rework when real role enforcement and shared congregation use are needed.
- May hide storage constraints that matter for candidate selection and historical non-repetition later.

**Fit for Planning Lifecycle First**

Medium-low. Useful for disposable exploration, but not ideal as the first implementation foundation unless explicitly time-boxed.

## Proposed Direction

Use a **lightweight full-stack TypeScript application direction** for the first implementation slice, with a small domain/application layer that owns planning lifecycle validation and permission checks. The exact framework and project setup remain undecided and should be chosen in a follow-up decision before coding.

Keep **storage direction unresolved and deferred**. Future persistence must support the refactored target-domain model, not the legacy table shape. The legacy source is the SQL Server / SSMS database `VarhanniDoprovody`, and the accepted legacy-to-domain mapping makes direct 1:1 migration inappropriate.

SQLite with Prisma may remain a possible future option for lightweight local development, but it is not accepted or preferred by this ADR. SQL Server-backed persistence may also remain a possible future option, especially because the legacy source is SQL Server. Another relational database may be justified later. Final storage selection depends on the accepted target-domain schema design, legacy-to-domain mapping, migration/refactoring strategy, local development needs, and deployment assumptions.

Use **role-based authentication and authorization direction**. Authentication should identify an actor, and authorization must evaluate that actor's roles against accepted planning permissions in application/domain behavior. UI affordances may hide unavailable actions, but UI hiding is not sufficient enforcement.

This direction intentionally does not decide:

- exact framework, runtime version, package manager, or project layout;
- exact database, ORM/query layer, migration strategy, or schema;
- exact auth provider, session strategy, user table shape, or login screens;
- whether the first implementation runs as a single deployable app or later separates frontend and backend;
- final storage choice, which remains deferred pending legacy-to-domain mapping assessment and target-domain persistence design.

## Storage Boundary

This ADR does not design a database schema and does not select final storage. Storage design remains blocked until the target-domain persistence model is designed from the accepted domain model and legacy-to-domain mapping rather than from the legacy SQL Server table shape.

For the Planning Lifecycle First slice, storage must conceptually support:

- services;
- service-set lifecycle state;
- ordered rows;
- optional song reference as `(language, number)`;
- textual note for non-song rows;
- priest and organist references;
- manual antiphon and liturgical-season fields;
- completed-service records as historical records, not active non-completed plans.

The storage design should avoid introducing deleted or cancelled lifecycle states unless a later accepted decision changes the domain model.

## Authorization Boundary

This ADR does not design login screens or user tables.

Implementation must support role-based permissions for:

- priest;
- organist;
- admin;
- congregation member.

Planning lifecycle permissions from accepted requirements must be enforced in application/domain behavior, including:

- priest, organist, and admin may create, edit, and delete working sets;
- priest and admin may save final sets;
- priest and admin may delete final sets;
- priest and admin may convert final sets to completed-service records;
- congregation members have no planning lifecycle actions;
- no role may directly edit a final set.

## Consequences

This enables:

- a conservative path from documentation to the first runnable planning lifecycle slice;
- early enforcement of accepted lifecycle and permission rules;
- a clear list of persistence capabilities needed for services, service sets, rows, and historical completed-service records;
- future expansion toward candidate selection, non-repetition, knowledge, and preferences without selecting those systems now.

This postpones:

- exact framework and project setup;
- exact persistence technology and schema, including whether to use SQLite with Prisma, SQL Server-backed persistence, or another relational option;
- exact authentication mechanism and account model;
- full candidate selection, non-repetition, preference, knowledge-management, and legacy-migration implementation;
- multi-congregation or enterprise tenancy design.

Risks:

- TypeScript/full-stack direction may still become too broad if framework selection pulls in unnecessary defaults.
- Storage selection remains unresolved until target-domain persistence design reconciles accepted domain concepts with the legacy-to-domain mapping.
- Role enforcement could drift into UI-only checks unless application/domain authorization is treated as mandatory.
- Deferring exact auth may leave early implementation blocked until actor and role representation is clarified.

Follow-up decisions are needed before coding to turn this proposal into an accepted implementation baseline.

## Follow-Up Decisions Needed

- Exact framework and project setup.
- Exact persistence technology, after target-domain schema design, legacy-to-domain mapping, migration/refactoring strategy, local development needs, and deployment assumptions are clarified.
- Exact auth mechanism.
- User/person representation, including how priest and organist references relate to authenticated actors.
- Minimal song reference validation for `(language, number)` before a full song catalog exists.
- Test strategy for lifecycle transitions, validation, permissions, and storage behavior.
- Target-domain persistence design that avoids direct 1:1 migration from the legacy SQL Server / SSMS `VarhanniDoprovody` database.
