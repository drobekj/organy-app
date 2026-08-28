# Roadmap

## Purpose
This document communicates the high-level product and development roadmap for the liturgical music knowledge-management and planning-support application.

The roadmap is derived from the accepted product, domain, decision, requirement, workflow, and architecture documents. It intentionally stays at milestone and phase level. It does not define detailed engineering tickets, implementation tasks, database schema, UI components, or technical design.

## Roadmap Principles
- Keep the product focused on one local congregation until future multi-congregation support is explicitly accepted.
- Preserve and make usable shared liturgical-music planning knowledge before optimizing planning workflows.
- Treat planning as decision support: the system presents knowledge, context, eligibility, and conflicts, while people make final selections.
- Sequence development from accepted documentation to domain foundations, then planning and candidate support, then implementation preparation.
- Keep every roadmap phase traceable to accepted requirements, workflows, decisions, and conceptual architecture modules.
- Avoid inventing migration strategy, storage design, authentication design, UI design, or implementation details in this roadmap.

## Sequencing Rationale
The roadmap starts with documentation because the repository is the source of truth for product intent, domain rules, workflows, and architecture. Implementation should not begin until the accepted documents establish a stable baseline.

Domain foundation follows because later planning behavior depends on core concepts such as song identity, melody equivalence, one-congregation scope, roles, permissions, and legacy-data boundaries.

Knowledge and repertoire capabilities come before advanced planning because candidate selection depends on catalog, melody, repertoire, antiphon, season, and preference knowledge. Planning lifecycle support then establishes the concrete service-set artifact and its states. Candidate selection, preferences, non-repetition, and historical records build on those foundations.

Implementation preparation comes last in this roadmap. Backlog decomposition, technical design, database schema, and detailed implementation planning should follow only after the product/domain/architecture baseline is accepted.

## Phase 1 — Documentation Baseline
Establish and maintain an accepted documentation baseline before implementation work begins.

Milestone outcomes:

- Accepted product vision defining the application as a knowledge-management and planning-support tool rather than only a hymn picker.
- Accepted domain analysis and domain model covering roles, songs, melody equivalence, planning artifacts, preferences, historical records, and unresolved domain questions.
- Accepted decisions documenting settled product and domain choices.
- Accepted requirements and workflows describing expected system behavior and planning lifecycle rules.
- Accepted conceptual architecture defining logical modules and boundaries without choosing technologies or schema.

Traceability:

- Product direction and human decision principle.
- Domain analysis and domain model.
- Decisions, requirements, workflows, and architecture module boundaries.

## Phase 2 — Domain Foundation
Establish the core concepts that all later product behavior depends on.

Milestone outcomes:

- Song identity is consistently understood as `(language, number)` rather than number alone.
- Melody equivalence is treated as an equivalence relationship among concrete songs, including singleton classes when no related songs are known.
- Current product scope remains one local congregation.
- Roles and permissions model is accepted for priest, organist, admin, and congregation member responsibilities.
- Legacy data is assessed against accepted domain concepts without inventing or committing to a migration strategy.

Traceability:

- Song, melody, congregation scope, role, and legacy-data concepts in the domain model.
- Roles and permissions architecture module.
- Legacy data boundary in the architecture.

## Phase 3 — Knowledge and Repertoire Foundation
Establish the shared knowledge base and practical repertoire knowledge required for planning support.

Milestone outcomes:

- Song catalog knowledge is available as the foundation for planning and candidate selection.
- Melody equivalence management supports extending or merging equivalence classes as musical knowledge is discovered.
- Organist repertoire is maintained as explicit concrete songs and remains distinct from shared melody knowledge.
- Antiphon mappings connect `(language, antiphon number)` to concrete songs for highlighting.
- Liturgical-season mappings connect `(language, liturgical season)` to songs for highlighting.

Traceability:

- Knowledge, repertoire, and candidate selection architecture modules.
- Requirements for song catalog, melody equivalence, repertoire, antiphon mappings, and liturgical-season mappings.
- Workflow rules that antiphon and liturgical-season mappings highlight candidates rather than hard-filtering them.

## Phase 4 — Planning Lifecycle
Establish the concrete ordered service-set lifecycle for one service.

Milestone outcomes:

- Planning centers on a concrete ordered service set for one service.
- Service rows are flexible: rows may be added, removed, reordered, and may represent songs or non-song contributions.
- A row without a song requires a textual note before the service set can be saved or finalized.
- Service-set lifecycle follows `no set exists`, `working set`, `final set`, and `completed-service record`.
- Deleting a saved non-completed working or final set returns the service to `no set exists`.
- A final set is not directly edited; changes require deletion and recreation by an authorized role.

Traceability:

- Planning module responsibilities in the architecture.
- Planning lifecycle requirements and workflows.
- Decision support principle that planning produces a human-owned ordered service set.

## Phase 5 — Candidate Selection and Decision Support
Establish candidate filtering and display behavior that helps humans make informed selections.

Milestone outcomes:

- Candidate selection applies the selected/default organist repertoire filter.
- Candidate selection applies the service language filter to concrete songs.
- Candidate selection applies the melody non-repetition rule to melody-equivalence classes.
- Candidate selection applies the preference threshold, with default threshold `x = 0`.
- Antiphon and liturgical-season matches are highlighted after hard filters, not used as hard filters.
- Candidate display includes melody-equivalence context.
- Candidate display makes explicit repertoire visibility clear, including bold display of repertoire songs and the accepted opposite-language repertoire visibility rule.

Traceability:

- Candidate selection architecture module.
- Requirements and workflows for hard filters, highlighting, and candidate display.
- Product vision value proposition around reducing cognitive load and surfacing planning context.

## Phase 6 — Preferences
Establish preference knowledge as decision support and candidate filtering input.

Milestone outcomes:

- Preferences are role-weighted and attached to concrete songs, not automatically transferred across melody-equivalence classes.
- Priest, organist, and congregation member own preferences follow accepted score ranges.
- Admin has no own preference score.
- Admin may manage congregation preferences.
- Total preference score is available for candidate filtering through the preference threshold.

Traceability:

- Preferences module in the architecture.
- Role-weighted preference requirements.
- Candidate selection requirement using total preference score.

## Phase 7 — Non-Repetition and Conflicts
Establish melody non-repetition protection and conflict validation.

Milestone outcomes:

- Backward historical checks use completed-service records within the configured non-repetition period before the planned service date.
- Forward protection checks saved future working sets and final sets within the configured non-repetition period after the planned service date.
- Conflicts are defined only among non-completed plans.
- Completed-service records inform backward filtering but are not judged as conflicts with each other.
- Rows without concrete songs are ignored by melody non-repetition checks.
- Non-repetition period administration is supported for admin.
- Non-repetition period changes are blocked when they would create conflicts between currently saved non-completed plans.

Traceability:

- Non-repetition / conflict architecture module.
- Requirements and workflows for melody non-repetition, future protection, and non-repetition period administration.
- Decisions removing forward antiphon protection and defining conflicts only among non-completed plans.

## Phase 8 — Historical Records
Establish completed-service records as historical planning knowledge.

Milestone outcomes:

- A final set can become a completed-service record.
- Completed-service records preserve the ordered service rows and concrete song use as historical knowledge.
- Completed-service records provide backward filtering input for melody non-repetition.
- Completed-service records are not treated as non-completed plans.
- Automatic conversion is resolved: a Final set whose service date is strictly before the current `Europe/Prague` calendar date becomes Completed at the next normal application reconciliation opportunity; service time does not affect this transition.

Traceability:

- History module in the architecture.
- Planning lifecycle requirements and workflows.
- Open workflow and architecture questions about automatic conversion.

## Phase 9 — Implementation Preparation
Prepare for implementation only after the accepted product, domain, workflow, requirement, and architecture documents are stable.

Milestone outcomes:

- Confirm that product, domain, decision, requirement, workflow, and architecture documents are accepted as the implementation baseline.
- Audit/change-history product policy is resolved and implemented: successful state-changing business actions are recorded as append-only explanatory history, separate from Completed-service business history, with the accepted admin read-only Audit History surface.
- The implementation-preparation line has progressed through Phase 31.27–31.43 and subsequent Production acceptance: protected username/password staff authentication, nickname-only congregation voting, account administration and credential recovery, runtime/preflight and recovery boundaries, Vercel + Neon Production deployment, protected identity bootstrap, authoritative Reference data, melody equivalence, repertoire handoff, audit history, and the accepted Production UX refinements are implemented and deployed.
- Decompose accepted roadmap phases into backlog items only after roadmap acceptance.
- Develop technical design only after implementation scope is chosen.
- Design database schema only after technical design begins and accepted domain concepts are stable.
- Select technologies only when they can be traced to accepted requirements, constraints, and implementation goals.

Traceability:

- Architecture principles and technology-choice boundaries.
- Product and documentation boundaries.
- Backlog and implementation work intentionally deferred until after roadmap acceptance.

## Current Planning Boundary
The roadmap phases above have already been taken through implementation and the accepted Production rollout. This document therefore no longer treats authentication, account administration, PostgreSQL persistence, deployment, audit history, candidate decision support, repertoire, melody equivalence, or the completed Production UX refinements as future implementation work.

No **Phase 32** is currently accepted or defined. A new product milestone must be explicitly accepted before new feature work is inferred from older implementation-preparation notes.

The following boundaries remain intentionally outside the current accepted product plan:

- multi-congregation product generalization;
- additional legacy-data migration beyond the already accepted selective Production handoffs, unless separately scoped;
- additional observability/security-telemetry or operational hardening beyond the accepted Production baseline, unless separately scoped.

## Open Roadmap Questions
- What future multi-congregation support may be needed, and what changes would be required before expanding beyond one local congregation?
- Should any additional legacy data be brought into the Production model beyond the completed selective handoffs?
- Is a new post-Production product milestone needed? If so, it must be defined and accepted explicitly rather than inferred as a historical “Phase 32”.

## Change Log
- 2026-08-28 — Reconciled the roadmap with the completed Phase 31.27–31.43 implementation and Production acceptance state; removed stale future-work claims and recorded that no Phase 32 is currently accepted.
- 2026-07-07 — Replaced the roadmap template with a high-level phased roadmap derived from accepted product, domain, decision, requirement, workflow, and architecture documents.

## Phase 29 implementation note

Phase 29 adds the lookup foundation for DB-backed person and song catalogs, including explicit development seed data and snapshot persistence. It deliberately does not close the broader candidate-selection roadmap: full Czech/Polish chorale import, melody equivalence, repertoire management, non-repetition, preferences, antiphon/season highlighting, and automatic candidate picking remain later phases.

The catalog import foundation is limited to documented JSON validation in `docs/catalog-import-format.md`; a full chorale importer and production catalog population remain separate future milestones.
