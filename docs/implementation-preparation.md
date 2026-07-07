# Implementation Preparation

## Purpose

This document is a pre-implementation readiness bridge between the accepted product backlog and later technical design. It summarizes what is already accepted as product/domain baseline, what must remain true during implementation planning, what is not ready for implementation yet, and which decisions are needed before coding begins.

This document does not choose technologies, design a database schema, define API endpoints, create UI components, create engineering tickets, or implement behavior.

## Source-of-Truth Inputs

This readiness summary is based on the accepted repository documentation:

- `docs/product-vision.md`
- `docs/analysis-log.md`
- `docs/domain-analysis.md`
- `docs/domain-model.md`
- `docs/decisions.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/backlog.md`
- `docs/legacy-data-assessment.md`

If this document appears to conflict with those sources, the underlying source document should be corrected or clarified before implementation planning proceeds.

## 1. Accepted Product and Domain Baseline

The following areas are accepted enough to serve as the product/domain baseline for later technical design.

### Product Vision

The product is a knowledge-management and planning-support tool for liturgical music in one local congregation. Planning is an important consumer of preserved knowledge, but the product is not merely a hymn picker. Its purpose is to preserve practical organist and liturgical-music knowledge, reduce repeated clarification, and support human planning decisions.

The final liturgical selection remains human-owned. The system should expose useful knowledge and candidate context without replacing the priest's judgment.

### Domain Model

The core domain language is accepted at a conceptual level:

- a song is identified by `(language, number)`;
- melody is an equivalence relation on songs, including singleton melody-equivalence classes;
- a service set is a concrete ordered set of rows for one service;
- rows may contain songs or non-song contributions, and rows without songs require textual notes;
- working sets, final sets, and completed-service records have distinct lifecycle meanings;
- preferences attach to concrete songs rather than automatically transferring across melody-equivalence classes.

This domain model is ready as product/domain baseline, but not as a database schema.

### Decisions

The accepted decisions establish the planning rules and boundaries that later design must preserve. These include human decision ownership, song identity, melody equivalence, flexible service rows, manual antiphon and liturgical-season inputs, candidate filtering order, role-weighted preferences, non-repetition behavior, final-set handling, and the current one-congregation scope.

### Requirements

Requirements are accepted as product behavior and acceptance direction. They describe expected planning support, knowledge management, permissions, candidate filtering, preferences, non-repetition, lifecycle, and defaults at the product level.

They are not yet engineering specifications for storage, endpoints, components, test cases, or deployment.

### Workflows

Workflows are accepted as product-level process descriptions for opening planning, editing service sets, selecting candidates, saving working or final sets, completing services, managing knowledge, managing preferences, and handling conflicts.

They should guide later technical design without being treated as UI wireframes or implementation tasks.

### Conceptual Architecture

The conceptual architecture is accepted as a boundary map for future design. It identifies application responsibilities such as knowledge management, service planning, candidate selection, preferences, non-repetition/conflict handling, lifecycle/history, permissions, and legacy-data considerations.

It intentionally does not select a technology stack, database, schema, API style, hosting model, or test framework.

### Roadmap

The roadmap is accepted as a product sequencing guide. It moves from baseline alignment through core knowledge, planning lifecycle, candidate selection, preferences, non-repetition/history, and later operational concerns.

It should guide implementation sequencing discussions, but it is not an engineering ticket list.

### Product Backlog

The backlog is accepted as product-level work inventory with traceability to requirements, workflows, decisions, roadmap phases, and conceptual modules.

Backlog items describe goals and acceptance direction. They do not yet define implementation tasks, schema changes, API contracts, UI components, or test cases.

### Legacy Data Assessment Template

The legacy data assessment is accepted as a read-only product/domain assessment template. It records that no inspectable legacy data source is currently present in the repository and identifies what must be inspected when a legacy database, schema, export, or manual inventory becomes available.

It does not define migration strategy, target schema, import process, synchronization approach, or data-cleaning workflow.

## 2. Invariants for Implementation Planning

The following must remain true while implementation planning and later technical design proceed.

- **Decisions remain human.** The system stores, filters, highlights, and presents knowledge; it does not automatically make the final liturgical selection.
- **Current scope is one local congregation.** Multi-congregation generalization remains deferred and must not drive the first implementation design unless the accepted scope changes.
- **Song identity is `(language, number)`.** A song number alone is insufficient because Czech and Polish hymn-book entries must remain distinct.
- **Melody is an equivalence relation on songs.** Melody planning behavior must work over melody-equivalence classes, including singleton classes.
- **The concrete ordered service set is the core planning artifact.** Planning centers on ordered service rows for one service, not on abstract recommendations alone.
- **Antiphon and liturgical season are manual highlighting inputs, not hard filters.** They may highlight candidates that survive hard filters, but they must not restore removed candidates or exclude otherwise eligible candidates.
- **Conflicts are only among non-completed plans.** Working sets and final sets that have not become completed-service records can conflict; completed-service records are historical input, not active plan conflicts.
- **Completed-service records only provide backward non-repetition input.** They are not non-completed plans and are not judged as conflicts.
- **Final sets are not directly edited.** If a final set must change, it is deleted and recreated according to accepted lifecycle behavior.

## 3. Not Ready for Implementation Yet

The following areas are not ready to implement from the current product/domain baseline alone.

- **Database schema.** The domain model is conceptual and must not be treated as a target schema.
- **API endpoints.** No API contracts, route structure, request/response shapes, or endpoint responsibilities have been selected.
- **UI components.** Workflows are product-level processes, not component specifications or screen designs.
- **Authentication infrastructure.** Roles and permissions are accepted conceptually, but the authentication and authorization mechanism has not been chosen.
- **Deployment.** Hosting, runtime, environments, release process, and operational model remain undecided.
- **Tests.** No test framework, test layers, or acceptance-test format has been selected.
- **Migration scripts.** Legacy data has not been inspected in a form that supports migration design.
- **Automatic final-set completion details.** Timing, triggering, safeguards, and exception handling for automatic conversion of final sets to completed-service records still need clarification.
- **Multi-congregation support.** The current scope is one local congregation; multi-congregation behavior remains intentionally deferred.
- **Audit/change-history behavior.** Expectations for auditability, version history, undo, attribution, and change review are not yet defined.

## 4. Decisions Needed Before Technical Design

Before technical design begins, the following decisions or clarifications are needed.

1. **Technology stack.** Decide the application framework, language/runtime, frontend approach if applicable, and supporting tooling.
2. **Persistence approach.** Decide the storage technology and persistence style before translating conceptual domain concepts into technical structures.
3. **Authentication/authorization approach.** Decide how users authenticate and how accepted role permissions will be enforced.
4. **Legacy data inspection.** Decide whether legacy data must be inspected before schema design, and if so, what source is authoritative enough for read-only assessment.
5. **Audit/change-history expectations.** Decide what changes must be attributable, reviewable, restorable, or historically visible.
6. **Automatic final-set completion timing and safeguards.** Decide when final sets become completed-service records, what confirmation or automation is allowed, and how exceptions are handled.
7. **First implementation slice / MVP boundary.** Selected as Planning Lifecycle First; keep excluded scope visible while technical design proceeds.

## 5. First Implementation Slice

Planning Lifecycle First is the selected first implementation slice. The other options remain useful sequencing context, but they are no longer equal candidates for the first slice. This section still does not convert the selected slice into engineering tickets.

### Context Option A — Knowledge Foundation First

Build the initial slice around maintaining core knowledge: songs, melody-equivalence knowledge, organist repertoire, antiphon mappings, liturgical-season mappings, and preferences as product concepts.

**Pros**

- Establishes the knowledge base that planning depends on.
- Reduces risk that planning behavior is built on incomplete or misunderstood domain concepts.
- Supports the product vision that knowledge preservation is primary.

**Risks**

- Users may not see planning value quickly if service-set workflows are delayed.
- Scope can expand if every knowledge area is treated as equally necessary for the first slice.
- Technical design may still be blocked if persistence and legacy-data decisions are unresolved.

### Selected — Planning Lifecycle First

Build the initial slice around creating, editing, saving, finalizing, deleting, and manually completing service sets according to the accepted lifecycle.

**First-slice focus**

- Concrete ordered service set for one service.
- Flexible service rows.
- Row without song requires a textual note.
- Lifecycle states: `no set exists`, `working set`, `final set`, and `completed-service record`.
- Deleting a saved working or final set returns to `no set exists`.
- Final set is not directly edited.
- Priest/admin finalization and completion permissions.
- Automatic final-set completion remains open and should not block the first manual lifecycle slice.

**Not included in this first slice**

- Full candidate selection engine.
- Melody non-repetition engine.
- Antiphon/liturgical-season highlighting.
- Full preference system.
- Legacy migration.
- Multi-congregation support.
- Automatic final-set completion details.
- Final database schema beyond what is needed for technical design.

**Pros**

- Validates the core planning artifact: a concrete ordered service set for one service.
- Clarifies lifecycle boundaries between working sets, final sets, and completed-service records.
- Gives future candidate selection a clear planning context.

**Risks**

- Candidate support may be weak until knowledge and filtering inputs exist.
- Lifecycle implementation could accidentally force unresolved UI, permission, or persistence decisions too early.
- Automatic final-set completion details remain unresolved and could block a complete lifecycle slice.

### Context Option C — Candidate Selection Prototype First

Build the initial slice around candidate eligibility and display behavior using accepted hard filters and manual highlighting concepts.

**Pros**

- Tests the highest-value planning-support logic early.
- Exercises melody-equivalence, repertoire, service language, preference threshold, non-repetition, antiphon highlighting, and season highlighting together.
- Helps reveal ambiguity in candidate display rules before broader implementation.

**Risks**

- Requires representative knowledge and historical planning inputs to be meaningful.
- Can become implementation-heavy if treated as a full planning UI or full data model.
- May depend on unresolved choices about storage, test strategy, and legacy data.

### Context Option D — Legacy Data Inspection First

Begin with read-only inspection of the legacy database, schema, export, or manual inventory before designing storage or migration.

**Pros**

- Reduces risk that schema design ignores important existing data constraints.
- Identifies whether legacy songs, melody relationships, repertoire, service history, preferences, people, and notes can map to accepted domain concepts.
- May reveal data-quality issues early, especially around song identity, language, melody equivalence, and completed history.

**Risks**

- Does not directly deliver application behavior.
- May delay implementation if legacy access is slow or incomplete.
- Could distract from accepted current-scope behavior if obsolete legacy concepts are over-weighted.

## 6. Readiness Checklist Before Coding

Coding should not begin until the following readiness items are satisfied at the appropriate level for the selected first slice.

- [ ] Product baseline accepted.
- [x] Implementation slice selected: Planning Lifecycle First.
- [ ] Technical architecture decision made.
- [ ] Storage approach selected.
- [ ] Authorization model mapped from accepted permissions.
- [ ] Legacy-data decision made for initial version.
- [ ] Test strategy defined at a high level.

## Non-Goals for This Document

This document intentionally does not:

- select technologies;
- design schema;
- define APIs;
- design UI components;
- create tests;
- create migration scripts;
- create engineering tickets;
- change roadmap, backlog, requirements, workflows, or architecture;
- implement application behavior.
