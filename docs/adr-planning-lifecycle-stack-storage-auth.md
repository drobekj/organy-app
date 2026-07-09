# ADR: Planning Lifecycle Stack, Storage, and Authorization Direction

## Status

Accepted for the minimal Phase 2 runnable scaffold baseline only. The broader stack, storage, authentication, persistence, UI/API, and production architecture decisions remain unresolved.

## Context

The first implementation slice is **Planning Lifecycle First**. It is limited to planning one concrete ordered service set for one service in the scope of one local congregation. This ADR must now be evaluated against the accepted deployment assumption: a single hosted web app for one congregation.

`docs/target-technical-schema-draft.md` is a storage-neutral draft input to future storage and schema decisions; it is not an accepted final schema, SQL, Prisma schema, storage choice, or implementation plan. `docs/planning-lifecycle-first-schema-subset.md` narrows that draft as an input to future first-slice storage and schema decisions for Planning Lifecycle First. `docs/first-slice-storage-decision-preparation.md` prepares first-slice storage ADR work, `docs/adr-first-slice-storage.md` now accepts PostgreSQL-like relational storage as the first-slice runtime storage direction only, `docs/first-slice-physical-schema-draft.md` is a downstream documentation-only input for future stack, schema, and tooling decisions, and `docs/first-slice-tooling-decision-preparation.md` is a downstream input for future ORM/query/migration tooling decisions without selecting a tooling option.

`docs/auth-account-role-model.md` is an input to any future authentication, account, actor, role-assignment, authorization, and schema decision. It keeps person, account, actor, role, role assignment, and historical person reference distinct without choosing an authentication provider or account technology.

The repository is currently documentation-first. A minimal scaffold-only baseline is now accepted for Phase 2: lightweight full-stack TypeScript direction, Next.js App Router for the first runnable scaffold, npm as package manager, and TypeScript strict baseline. This acceptance is intentionally narrow; it does not create project files in this documentation PR and does not select persistence technology beyond the already accepted direction-level storage/tooling decisions, database schema, migration workflow, authentication mechanism, API contracts, UI design, or test strategy.

For this first slice:

- there is no full candidate engine yet;
- there is no non-repetition engine yet;
- there is no legacy migration yet;
- there is no multi-congregation support yet;
- final sets are not directly edited;
- completed-service records are historical, not active non-completed plans;
- role permissions must be enforced in application/domain behavior, not only hidden in UI;
- the accepted deployment assumption includes direct access for priest, organist, admin, and congregation member roles.

## Decision Drivers

- Keep the first implementation minimal and reviewable.
- Preserve strong domain-rule enforcement at application/domain boundaries.
- Support easy local development while evaluating production-oriented choices against the accepted single hosted one-congregation assumption.
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

- Framework selection is now limited to Next.js App Router for the runnable scaffold, but routing conventions beyond scaffold defaults, validation libraries, and test tools still need selection.
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

## Decision

Use a **lightweight full-stack TypeScript application direction** for Phase 2, with **Next.js App Router** as the framework for the first runnable scaffold, **npm** as package manager, and a **TypeScript strict** baseline. This decision unblocks only a minimal runnable scaffold PR.

The first-slice storage direction has been accepted separately in `docs/adr-first-slice-storage.md`: PostgreSQL-like relational storage for Planning Lifecycle First. Future persistence must support the refactored target-domain model, not the legacy table shape. The legacy source is the SQL Server / SSMS database `VarhanniDoprovody`, and the accepted legacy-to-domain mapping makes direct 1:1 migration inappropriate.

This ADR is **accepted only for the minimal runnable scaffold baseline**. The separate storage-direction ADR and the accepted first-slice tooling-direction ADR in `docs/adr-first-slice-tooling.md` remain unchanged. The broader stack/storage/auth architecture is not accepted as production-ready because database provider, hosting, auth provider, account model, physical schema files, local development workflow, backup/export/restore design, UI/API contracts, and test strategy remain unresolved.

Use **role-based authentication and authorization direction**. Authentication should identify an actor, and authorization must evaluate that actor's roles against accepted planning permissions in application/domain behavior. UI affordances may hide unavailable actions, but UI hiding is not sufficient enforcement.

This direction intentionally does not decide:

- runtime version or project layout details beyond the minimal scaffold defaults;
- exact database provider, exact Drizzle package/version/configuration, migration workflow, schema file layout, or schema;
- exact auth provider, session strategy, account model, user table shape, or login screens;
- persistence implementation, service-set UI, service-set API, product workflows, or production-readiness;
- hosting provider, deployment platform, or whether the first implementation later separates frontend and backend;
- final physical storage design and provider choice, which remain deferred pending legacy-to-domain mapping assessment and target-domain persistence design.

## Storage Boundary

This ADR does not design a database schema and does not select final physical storage, provider, exact ORM/query/migration package/version/configuration, or migration workflow; the downstream physical schema draft is input only and does not accept the whole stack/storage/auth ADR. Storage design remains blocked until future schema design uses `docs/target-domain-persistence-model.md`, `docs/target-technical-schema-draft.md`, `docs/planning-lifecycle-first-schema-subset.md`, and `docs/legacy-to-domain-mapping.md` rather than the legacy SQL Server table shape. For Planning Lifecycle First, this ADR should evaluate the first implementation slice against the subset document rather than the full future schema.

`docs/adr-first-slice-storage.md` explicitly chooses the first-slice storage direction and justifies it against the first-slice schema subset; the accepted single hosted one-congregation deployment assumption; hosted shared access; backup/export/restore expectations; local development workflow; and legacy SQL Server as source knowledge, not target runtime architecture. `docs/adr-first-slice-tooling.md` accepts Drizzle-like typed SQL/schema toolkit plus migrations as the first-slice tooling direction only. Follow-up storage and tooling work must still define physical schema, provider, exact package/version/configuration, schema file layout, migration workflow, connection management, backup/export/restore design, and local development workflow.

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

This ADR does not design login screens, account model, user tables, or role-assignment storage. Future auth/account design must use `docs/auth-account-role-model.md` as input and keep legacy people references distinct from authenticated users.

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

- runtime version and project-layout details beyond the minimal Next.js App Router scaffold baseline;
- exact persistence technology and schema;
- exact authentication provider, mechanism, and account model;
- full candidate selection, non-repetition, preference, knowledge-management, and legacy-migration implementation;
- multi-congregation or enterprise tenancy design.

Risks:

- TypeScript/full-stack direction may still become too broad if framework selection pulls in unnecessary defaults.
- Storage direction and tooling direction are accepted separately, but physical schema, provider, exact package/version/configuration, migration workflow, connection management, backup/export/restore design, and local development workflow remain unresolved until target-domain persistence design reconciles accepted domain concepts with the legacy-to-domain mapping.
- Role enforcement could drift into UI-only checks unless application/domain authorization is treated as mandatory.
- Deferring exact auth may leave early implementation blocked until actor and role representation is clarified.

Follow-up decisions are needed before product implementation; the current acceptance only permits a runnable scaffold baseline.

## Follow-Up Decisions Needed

- Runtime version and project-layout details beyond scaffold defaults, if scaffold defaults are insufficient.
- Exact persistence package/version/configuration, schema file layout, and migration workflow, after `docs/target-domain-persistence-model.md`, `docs/target-technical-schema-draft.md`, `docs/adr-first-slice-tooling.md`, legacy-to-domain mapping, target-domain schema design, migration/refactoring strategy, local development needs, and the accepted single hosted one-congregation deployment assumption are evaluated.
- Exact auth mechanism and provider.
- Account model and user/person representation, including how priest and organist references relate to authenticated actors and role assignments, using `docs/auth-account-role-model.md` as input.
- Minimal song reference validation for `(language, number)` before a full song catalog exists.
- Test strategy for lifecycle transitions, validation, permissions, and storage behavior.
- Target-domain persistence design that avoids direct 1:1 migration from the legacy SQL Server / SSMS `VarhanniDoprovody` database.
