# Backlog

## Purpose
This document is the high-level product backlog for the liturgical music knowledge-management and planning-support application.

It bridges the accepted roadmap, requirements, workflows, decisions, domain model, and conceptual architecture into product-level epics and backlog items. It intentionally does not define detailed engineering tickets, database tasks, frontend component tasks, API endpoint tasks, estimates, dates, or sprints.

## Backlog Item Format
Each item uses:

- **Type:** Epic / Product backlog item / Open question
- **Goal:** The product outcome the item supports
- **Source / traceability:** Accepted requirements, workflows, architecture modules, roadmap phases, decisions, or source documents that justify the item
- **Acceptance direction:** High-level product acceptance direction, not technical test steps
- **Status:** Proposed / Accepted / Open

## Prioritization Direction
Backlog ordering should follow the accepted roadmap sequence:

1. preserve the documentation baseline;
2. establish domain foundations;
3. make shared knowledge and repertoire available;
4. support planning lifecycle and candidate decision support;
5. support preferences, non-repetition, conflicts, and history;
6. resolve open product/workflow questions before implementation details are decomposed.

Items should remain traceable to accepted source documents and should not be decomposed into implementation work until the implementation-preparation phase begins.

## 1. Documentation and Baseline Control

### BL-001 — Maintain accepted documentation baseline

- **Type:** Epic
- **Goal:** Keep product vision, domain analysis, domain model, decisions, requirements, workflows, architecture, roadmap, and backlog aligned as the source of truth before implementation planning begins.
- **Source / traceability:** Roadmap Phase 1 and Phase 9; architecture principles; `docs/product-vision.md`; `docs/requirements.md` traceability guidance.
- **Acceptance direction:** The accepted documents remain consistent, changes are made in the document responsible for that concern, and later backlog or implementation planning can trace to stable accepted sources.
- **Status:** Accepted

### BL-002 — Preserve one-local-congregation scope

- **Type:** Product backlog item
- **Goal:** Ensure all backlog and later implementation preparation remain focused on one local congregation until broader scope is explicitly accepted.
- **Source / traceability:** Product vision scope boundaries; domain-analysis constraints; architecture system context; Roadmap Phase 2.
- **Acceptance direction:** Product backlog items do not assume multi-congregation configuration, tenancy, generalized administration, or cross-congregation sharing as current scope.
- **Status:** Accepted

### BL-003 — Keep backlog product-oriented

- **Type:** Product backlog item
- **Goal:** Maintain this backlog as a product planning bridge rather than a set of engineering tickets.
- **Source / traceability:** Roadmap Phase 9; roadmap “Not Yet Ready to Implement”; architecture technology-choice boundaries.
- **Acceptance direction:** Backlog entries remain epics, product backlog items, or open questions, and avoid schema, API, UI-component, test, deployment, or migration implementation tasks.
- **Status:** Accepted

## 2. Domain Foundation

### DF-001 — Establish song identity as `(language, number)`

- **Type:** Product backlog item
- **Goal:** Treat each song as a concrete hymn-book entry identified by language and number, never by number alone.
- **Source / traceability:** REQ-001; DEC-2026-07-06-01; Domain Model “Song”; Roadmap Phase 2; Knowledge module.
- **Acceptance direction:** Product behavior and future implementation planning consistently reference songs in service rows, repertoire, preferences, antiphon mappings, and liturgical-season mappings by `(language, number)`.
- **Status:** Accepted

### DF-002 — Establish melody-equivalence model

- **Type:** Product backlog item
- **Goal:** Represent melody as equivalence between concrete songs, including singleton classes, without prematurely requiring named melody objects.
- **Source / traceability:** REQ-002; DEC-2026-07-06-02; Domain Model “Melody-equivalence class”; Roadmap Phase 2; Knowledge, Candidate selection, and Non-repetition / conflict modules.
- **Acceptance direction:** Product planning treats melody-equivalence classes as reusable knowledge for repertoire filtering, candidate display, and melody non-repetition.
- **Status:** Accepted

### DF-003 — Preserve accepted role vocabulary

- **Type:** Product backlog item
- **Goal:** Keep priest, organist, admin, and congregation member as the current product roles and preserve their distinct responsibilities.
- **Source / traceability:** REQ-012; DEC-2026-07-06-10; Domain Model “Role”; Roadmap Phase 2; Roles and permissions module.
- **Acceptance direction:** Future backlog decomposition and implementation preparation use the accepted role set and do not add or merge roles without an accepted product decision.
- **Status:** Accepted

## 3. Knowledge Management

### KM-001 — Manage shared song catalog knowledge

- **Type:** Epic
- **Goal:** Maintain the base catalog of concrete songs that planning, repertoire, mappings, preferences, and history reference.
- **Source / traceability:** REQ-001; REQ-012; WF-009; Roadmap Phase 3; Knowledge module.
- **Acceptance direction:** Admin-managed shared catalog knowledge supports concrete song identity and becomes a reliable foundation for downstream planning behavior.
- **Status:** Accepted

### KM-002 — Manage melody equivalence knowledge

- **Type:** Product backlog item
- **Goal:** Allow shared melody-equivalence knowledge to be extended or merged as musical knowledge is discovered.
- **Source / traceability:** REQ-002; WF-009; DEC-2026-07-06-02; Roadmap Phase 3; Knowledge module.
- **Acceptance direction:** Admin-managed melody-equivalence knowledge can support candidate display, repertoire eligibility by melody class, and non-repetition by melody class.
- **Status:** Accepted

### KM-003 — Manage antiphon mappings for highlighting

- **Type:** Product backlog item
- **Goal:** Preserve mappings from `(language, antiphon number)` to concrete songs for candidate highlighting.
- **Source / traceability:** REQ-006; WF-009; DEC-2026-07-06-05; Roadmap Phase 3; Knowledge and Candidate selection modules.
- **Acceptance direction:** Antiphon mappings provide red highlighting only for candidates that already passed hard filters and do not act as eligibility rules.
- **Status:** Accepted

### KM-004 — Manage liturgical-season mappings for highlighting

- **Type:** Product backlog item
- **Goal:** Preserve mappings from `(language, liturgical season)` to relevant songs for candidate highlighting.
- **Source / traceability:** REQ-006; WF-009; DEC-2026-07-06-05; Roadmap Phase 3; Knowledge and Candidate selection modules.
- **Acceptance direction:** Liturgical-season mappings provide green highlighting only for candidates that already passed hard filters and do not act as eligibility rules.
- **Status:** Accepted

## 4. Repertoire Management

### RM-001 — Maintain organist repertoire as explicit concrete songs

- **Type:** Epic
- **Goal:** Capture what an organist can play as explicit repertoire entries tied to concrete songs.
- **Source / traceability:** REQ-001; REQ-002; REQ-007; REQ-008; WF-007; Roadmap Phase 3; Repertoire module.
- **Acceptance direction:** Organist and admin can maintain repertoire knowledge separately from shared melody-equivalence knowledge, and candidate selection can use repertoire through melody-equivalence classes.
- **Status:** Accepted

### RM-002 — Preserve explicit repertoire visibility in planning

- **Type:** Product backlog item
- **Goal:** Ensure planning surfaces which songs are explicitly in the selected/default organist's repertoire.
- **Source / traceability:** REQ-008; WF-003; WF-007; Roadmap Phase 5; Candidate selection and Repertoire modules.
- **Acceptance direction:** Candidate display makes explicit repertoire songs bold, including the accepted opposite-language repertoire visibility rule when a Czech or Polish service would otherwise hide every explicit repertoire song in the melody class.
- **Status:** Accepted

## 5. Planning Lifecycle

### PL-001 — Support concrete ordered service sets

- **Type:** Epic
- **Goal:** Make planning center on a concrete ordered service set for one service.
- **Source / traceability:** REQ-003; DEC-2026-07-06-03; WF-002; WF-004; Roadmap Phase 4; Planning module.
- **Acceptance direction:** A service plan can represent ordered rows for one service, with the standard four-song case supported without preventing additional real-service rows.
- **Status:** Accepted

### PL-002 — Support flexible rows and non-song notes

- **Type:** Product backlog item
- **Goal:** Allow rows to be added, removed, reordered, and used for songs or non-song contributions.
- **Source / traceability:** REQ-003; WF-002; Roadmap Phase 4; Planning module.
- **Acceptance direction:** Product behavior allows service rows for songs, instrumental contributions, choir contributions, and other notes; any row without a song requires textual note content before saving or finalizing.
- **Status:** Accepted

### PL-003 — Support service-set lifecycle states

- **Type:** Product backlog item
- **Goal:** Represent service planning through `no set exists`, `working set`, `final set`, and `completed-service record`.
- **Source / traceability:** REQ-004; DEC-2026-07-06-04; WF-001 through WF-006; Roadmap Phase 4; Planning and History modules.
- **Acceptance direction:** Planning state is understandable to users and follows the accepted lifecycle, including direct finalization from no set when valid and authorized.
- **Status:** Accepted

### PL-004 — Delete saved non-completed sets to return to no set exists

- **Type:** Product backlog item
- **Goal:** Allow authorized deletion of saved working or final sets without introducing deleted or cancelled states.
- **Source / traceability:** REQ-004; REQ-012; WF-005; DEC-2026-07-06-04; Roadmap Phase 4; Planning module.
- **Acceptance direction:** Deleting a saved non-completed working or final set returns the service to `no set exists`, while completed-service records remain historical records outside this delete workflow.
- **Status:** Accepted

### PL-005 — Preserve no direct edit of final sets

- **Type:** Product backlog item
- **Goal:** Protect final selections from direct editing after they are saved.
- **Source / traceability:** REQ-004; REQ-012; WF-004; DEC-2026-07-06-04; Roadmap Phase 4; Planning module.
- **Acceptance direction:** A final set is changed only by authorized deletion and recreation, not by direct edit-in-place behavior.
- **Status:** Accepted

### PL-006 — Clarify automatic final-set completion

- **Type:** Open question
- **Goal:** Decide whether, when, and how a final set should automatically become a completed-service record.
- **Source / traceability:** REQ-004; WF-006; Roadmap Phase 8 open outcome; Architecture Open Architecture Questions; History module.
- **Acceptance direction:** Product/workflow decision clarifies automatic completion timing and behavior before any implementation details are decomposed.
- **Status:** Open

## 6. Candidate Selection

### CS-001 — Apply candidate hard filters before highlighting

- **Type:** Epic
- **Goal:** Present eligible candidates by applying hard filters before antiphon or liturgical-season highlighting.
- **Source / traceability:** REQ-007; DEC-2026-07-06-06; WF-003; Roadmap Phase 5; Candidate selection module.
- **Acceptance direction:** Candidate eligibility is based on repertoire, service language, melody non-repetition, and preference threshold, with default threshold `x = 0`.
- **Status:** Accepted

### CS-002 — Apply repertoire hard filter by melody class

- **Type:** Product backlog item
- **Goal:** Keep candidates playable by the selected/default organist while respecting melody equivalence.
- **Source / traceability:** REQ-002; REQ-007; WF-003; WF-007; Roadmap Phase 5; Repertoire and Candidate selection modules.
- **Acceptance direction:** A candidate passes repertoire filtering when its melody-equivalence class contains at least one song explicitly in the selected/default organist's repertoire.
- **Status:** Accepted

### CS-003 — Apply service-language hard filter to concrete songs

- **Type:** Product backlog item
- **Goal:** Show songs appropriate to Czech, Polish, or mixed service language.
- **Source / traceability:** REQ-007; WF-003; Domain Model “Language”; Roadmap Phase 5; Candidate selection module.
- **Acceptance direction:** Czech services display Czech songs, Polish services display Polish songs, and mixed services display Czech and Polish songs, subject to other accepted candidate rules.
- **Status:** Accepted

### CS-004 — Apply melody non-repetition hard filter

- **Type:** Product backlog item
- **Goal:** Exclude melody-equivalence classes blocked by accepted backward historical checks and forward protection.
- **Source / traceability:** REQ-009; WF-011; DEC-2026-07-06-08; Roadmap Phase 5 and Phase 7; Non-repetition / conflict and Candidate selection modules.
- **Acceptance direction:** Candidate filtering removes melody-equivalence classes blocked by completed-service history or saved future working/final sets within the configured period.
- **Status:** Accepted

### CS-005 — Apply preference-threshold hard filter

- **Type:** Product backlog item
- **Goal:** Use total role-weighted concrete-song preference score as a candidate eligibility input.
- **Source / traceability:** REQ-007; REQ-013; WF-003; WF-008; Roadmap Phase 5 and Phase 6; Preferences and Candidate selection modules.
- **Acceptance direction:** Candidate filtering keeps concrete songs with total preference score at least the selected threshold, defaulting to `x = 0`.
- **Status:** Accepted

### CS-006 — Highlight antiphon and liturgical-season matches after hard filters

- **Type:** Product backlog item
- **Goal:** Surface contextual liturgical signals without turning them into hard eligibility rules.
- **Source / traceability:** REQ-006; WF-003; DEC-2026-07-06-05; Roadmap Phase 5; Knowledge and Candidate selection modules.
- **Acceptance direction:** Antiphon and liturgical-season matches are highlighted only among candidates that remain after hard filters, and they never restore candidates removed by hard filters.
- **Status:** Accepted

### CS-007 — Display melody-equivalence context for candidates

- **Type:** Product backlog item
- **Goal:** Reduce cognitive load by showing relevant songs from the same melody-equivalence class during selection.
- **Source / traceability:** REQ-008; WF-003; DEC-2026-07-06-02; Roadmap Phase 5; Candidate selection module.
- **Acceptance direction:** Candidate records expose relevant melody-class songs and preserve bold visibility for explicit repertoire songs according to accepted display rules.
- **Status:** Accepted

## 7. Preferences

### PR-001 — Support role-weighted own preferences

- **Type:** Epic
- **Goal:** Capture decision-support preference knowledge for concrete songs using accepted role-specific score ranges.
- **Source / traceability:** REQ-013; DEC-2026-07-06-07; WF-008; Roadmap Phase 6; Preferences module.
- **Acceptance direction:** Priest, organist, and congregation member preferences apply to concrete songs, follow accepted score ranges, do not transfer across melody-equivalence classes, and contribute to total preference score.
- **Status:** Accepted

### PR-002 — Support congregation preference administration

- **Type:** Product backlog item
- **Goal:** Allow admin to administer congregation preferences while admin has no own song preference score.
- **Source / traceability:** REQ-012; REQ-013; WF-008; DEC-2026-07-06-10; Roadmap Phase 6; Preferences and Roles and permissions modules.
- **Acceptance direction:** Admin can manage congregation preference knowledge, while own preference entry remains limited to priest, organist, and congregation member roles.
- **Status:** Accepted

## 8. Melody Non-Repetition and Conflicts

### NR-001 — Apply backward historical melody non-repetition

- **Type:** Product backlog item
- **Goal:** Prevent reuse of melody-equivalence classes found in completed-service records within the configured period before the planned service date.
- **Source / traceability:** REQ-009; WF-011; DEC-2026-07-06-08; Roadmap Phase 7; Non-repetition / conflict and History modules.
- **Acceptance direction:** Completed-service records provide backward filtering input by melody-equivalence class, and rows without concrete songs are ignored.
- **Status:** Accepted

### NR-002 — Apply forward protection for saved future plans

- **Type:** Product backlog item
- **Goal:** Protect saved future working and final sets from melody conflicts with earlier planned services.
- **Source / traceability:** REQ-009; WF-011; DEC-2026-07-06-08; Roadmap Phase 7; Non-repetition / conflict and Planning modules.
- **Acceptance direction:** Saved future working and final sets within the configured period can exclude candidate melody-equivalence classes, while forward antiphon protection is not part of the rule.
- **Status:** Accepted

### NR-003 — Define conflicts only among non-completed plans

- **Type:** Product backlog item
- **Goal:** Keep conflict validation focused on current and future non-completed plans rather than historical records.
- **Source / traceability:** REQ-010; DEC-2026-07-06-09; WF-010; WF-011; Roadmap Phase 7; Non-repetition / conflict module.
- **Acceptance direction:** Conflicts are considered only among the currently edited plan and saved future working/final sets; Completed-service records are not judged as conflicts; they only provide backward non-repetition input.
- **Status:** Accepted

### NR-004 — Administer non-repetition period with conflict validation

- **Type:** Product backlog item
- **Goal:** Allow admin to change the melody non-repetition period only when the change does not create conflicts among saved non-completed plans.
- **Source / traceability:** REQ-011; WF-010; DEC-2026-07-06-09; DEC-2026-07-06-10; Roadmap Phase 7; Non-repetition / conflict and Roles and permissions modules.
- **Acceptance direction:** The default period is 2 months, only admin may change it, and a proposed change is blocked if currently saved non-completed plans would conflict until one or more blocking saved sets are deleted.
- **Status:** Accepted

## 9. Historical Records

### HR-001 — Preserve completed-service records as history

- **Type:** Epic
- **Goal:** Retain completed services as historical planning knowledge after final sets are completed.
- **Source / traceability:** REQ-004; REQ-009; REQ-010; WF-006; Roadmap Phase 8; History module.
- **Acceptance direction:** Completed-service records preserve ordered rows and concrete song use, provide backward non-repetition input, and are not treated as editable non-completed plans.
- **Status:** Accepted

### HR-002 — Clarify audit and change-history needs

- **Type:** Open question
- **Goal:** Determine what auditability or change history is needed for shared knowledge changes, repertoire changes, preferences, planning transitions, and historical records.
- **Source / traceability:** Architecture Cross-Cutting Concerns; Architecture Open Architecture Questions; Roadmap Open Roadmap Questions.
- **Acceptance direction:** Product and architecture sources clarify audit/change-history expectations before detailed implementation planning defines mechanisms.
- **Status:** Open

## 10. Roles and Permissions

### RP-001 — Support accepted planning permissions

- **Type:** Product backlog item
- **Goal:** Enforce accepted role responsibilities for creating, editing, saving, deleting, and completing service sets.
- **Source / traceability:** REQ-012; Domain Model permission table; WF-002 through WF-006; Roadmap Phase 2; Roles and permissions module.
- **Acceptance direction:** Priest, organist, admin, and congregation member abilities align with accepted permissions, including priest/admin final-set actions and no direct final-set editing.
- **Status:** Accepted

### RP-002 — Support accepted knowledge, repertoire, and preference permissions

- **Type:** Product backlog item
- **Goal:** Enforce accepted role responsibilities outside service-set planning.
- **Source / traceability:** REQ-012; WF-007; WF-008; WF-009; DEC-2026-07-06-10; Roadmap Phase 2 and Phase 6; Roles and permissions module.
- **Acceptance direction:** Admin manages shared knowledge and congregation preferences, organist and admin manage repertoire, priest/organist/congregation member manage own preferences, and congregation members do not administer plans, repertoire, or shared knowledge.
- **Status:** Accepted

## 11. Legacy Data Assessment

### LD-001 — Assess legacy data against accepted domain concepts

- **Type:** Epic
- **Goal:** Understand existing legacy data in relation to accepted song identity, melody equivalence, repertoire, preferences, service sets, and history without inventing a migration strategy.
- **Source / traceability:** Analysis Log Discovery 8; Domain Analysis constraints and open questions; Roadmap Phase 2; Legacy data boundary in architecture.
- **Acceptance direction:** Legacy data is evaluated as an input and constraint, and findings can inform later decisions without committing to migration, transformation, replacement, synchronization, schema, or data-cleaning implementation.
- **Status:** Proposed

## 12. Implementation Preparation

### IP-001 — Confirm implementation baseline before technical decomposition

- **Type:** Epic
- **Goal:** Begin technical design and detailed implementation planning only after accepted product, domain, decision, requirement, workflow, architecture, roadmap, and backlog sources are stable.
- **Source / traceability:** Roadmap Phase 9; architecture principles; roadmap “Not Yet Ready to Implement.”
- **Acceptance direction:** Implementation preparation can proceed only with clear traceability from chosen implementation scope back to accepted product backlog items and source documents.
- **Status:** Proposed

### IP-002 — Review and refine future technical schema draft

- **Type:** Product backlog item
- **Goal:** Review and refine `docs/target-technical-schema-draft.md` as a storage-neutral input to later schema design, without treating candidate concepts as accepted physical tables.
- **Source / traceability:** `docs/target-domain-persistence-model.md`; `docs/target-technical-schema-draft.md`; `docs/legacy-to-domain-mapping.md`; architecture data and persistence note.
- **Acceptance direction:** Future schema design derives from target-domain concepts and the reviewed draft rather than copying the legacy SQL Server schema, and remains separate from current implementation tasks until storage and architecture decisions are accepted.
- **Status:** Proposed

### IP-003 — Design first-slice physical schema directionally against PostgreSQL-like relational storage

- **Type:** Product backlog item
- **Goal:** Prepare future physical schema design for Planning Lifecycle First using the accepted PostgreSQL-like relational storage direction.
- **Source / traceability:** Architecture Technology Choices; ADR storage boundary; `docs/adr-first-slice-storage.md`; `docs/target-domain-persistence-model.md`; `docs/target-technical-schema-draft.md`; `docs/planning-lifecycle-first-schema-subset.md`; `docs/first-slice-storage-decision-preparation.md`; `docs/storage-options-comparison.md`; `docs/first-slice-physical-schema-draft.md`; `docs/first-slice-schema-open-questions-resolution.md`; `docs/first-slice-tooling-decision-preparation.md`.
- **Acceptance direction:** Future design reviews `docs/first-slice-physical-schema-draft.md`, applies/reviews accepted design-level schema resolutions before physical schema/tooling decisions, and derives physical schema concepts from the first-slice subset and accepted storage direction while keeping schema files, migrations, SQL, ORM models, and implementation tasks out of this backlog item.
- **Status:** Proposed

### IP-004 — Define exact first-slice tooling package/version/configuration

- **Type:** Product backlog item
- **Goal:** Define exact package names, versions, and configuration for the accepted Drizzle-like typed SQL/schema toolkit plus migrations direction without starting implementation.
- **Source / traceability:** `docs/adr-first-slice-tooling.md`; `docs/adr-first-slice-storage.md`; `docs/first-slice-tooling-decision-preparation.md`; `docs/first-slice-physical-schema-draft.md`; `docs/first-slice-schema-open-questions-resolution.md`; `docs/adr-planning-lifecycle-stack-storage-auth.md`.
- **Acceptance direction:** Future design records exact package/version/configuration choices for the accepted tooling direction while keeping package installation, schema files, migrations, SQL, and application implementation out of this backlog item.
- **Status:** Proposed

### IP-005 — Define backup/export/restore design

- **Type:** Product backlog item
- **Goal:** Define backup, export, and restore expectations for PostgreSQL-like relational first-slice runtime storage before production use.
- **Source / traceability:** `docs/adr-first-slice-storage.md`; `docs/first-slice-storage-decision-preparation.md`; `docs/storage-options-comparison.md`; `docs/deployment-assumptions.md`; `docs/first-slice-physical-schema-draft.md`; `docs/first-slice-schema-open-questions-resolution.md`; `docs/first-slice-tooling-decision-preparation.md`.
- **Acceptance direction:** Future design identifies backup ownership, export format, restore procedure, restore-test expectations, and acceptable data-loss window against the draft relational shape without creating implementation tasks.
- **Status:** Proposed

### IP-006 — Define local development database workflow

- **Type:** Product backlog item
- **Goal:** Define how developers will work locally with the accepted PostgreSQL-like relational storage direction.
- **Source / traceability:** `docs/adr-first-slice-storage.md`; `docs/adr-first-slice-tooling.md`; `docs/first-slice-storage-decision-preparation.md`; `docs/storage-options-comparison.md`; `docs/deployment-assumptions.md`; `docs/planning-lifecycle-first-schema-subset.md`; `docs/first-slice-physical-schema-draft.md`; `docs/first-slice-schema-open-questions-resolution.md`; `docs/first-slice-tooling-decision-preparation.md`.
- **Acceptance direction:** Future design clarifies local database service, container, remote development database, fixture, seed, reset, and migration expectations using the accepted tooling direction, without creating scripts, migrations, schema files, SQL, or implementation tasks in this backlog item.
- **Status:** Proposed

### IP-007 — Determine canonical song catalog sourcing

- **Type:** Product backlog item
- **Goal:** Decide how the future canonical song catalog will be sourced for Czech and Polish songs.
- **Source / traceability:** REQ-001; Knowledge module; `docs/target-domain-persistence-model.md`; `docs/legacy-to-domain-mapping.md`.
- **Acceptance direction:** Future planning identifies authoritative catalog sources and data-quality expectations before implementation creates catalog storage or import behavior.
- **Status:** Proposed

### IP-008 — Defer future multi-congregation support

- **Type:** Open question
- **Goal:** Keep multi-congregation support as a future product question rather than current implementation scope.
- **Source / traceability:** Product vision scope boundaries; Domain Analysis open questions; Domain Model open modeling questions; Roadmap Open Roadmap Questions; architecture system context.
- **Acceptance direction:** Future multi-congregation needs may be explored and decided later, but current backlog and implementation preparation do not decompose multi-congregation implementation work.
- **Status:** Open

### IP-009 — Compare future authentication providers

- **Type:** Product backlog item
- **Goal:** Compare authentication provider options without selecting a concrete provider or login method.
- **Source / traceability:** `docs/auth-account-role-model.md`; `docs/deployment-assumptions.md`; Architecture Roles and Permissions module; ADR authorization boundary.
- **Acceptance direction:** Future comparison evaluates how options support direct access for priest, organist, admin, and congregation member roles while keeping provider selection out of current implementation tasks.
- **Status:** Proposed

### IP-010 — Design future account/person/actor schema

- **Type:** Product backlog item
- **Goal:** Design the future logical-to-technical representation of people, accounts, actors, roles, role assignments, and historical person references.
- **Source / traceability:** `docs/auth-account-role-model.md`; `docs/target-domain-persistence-model.md`; `docs/legacy-to-domain-mapping.md`; Architecture Data and Persistence note.
- **Acceptance direction:** Future schema design preserves the distinction between person, account, actor, role assignment, and historical person reference, and does not treat legacy people records as authenticated users by default.
- **Status:** Proposed

### IP-011 — Map first-slice authorization checks to actor-role subset

- **Type:** Product backlog item
- **Goal:** Map Planning Lifecycle First authorization checks to the minimal Person / Actor / RoleAssignment or equivalent actor-role subset before implementation design.
- **Source / traceability:** `docs/auth-account-role-model.md`; `docs/planning-lifecycle-first-schema-subset.md`; REQ-012; Architecture Roles and Permissions module; ADR authorization boundary.
- **Acceptance direction:** Future authorization design identifies how priest, organist, admin, and congregation member checks are resolved at state-changing boundaries without selecting an auth provider or treating UI hiding as sufficient enforcement.
- **Status:** Proposed

### IP-012 — Design legacy people mapping from `Kazatele` and `Varhanici`

- **Type:** Product backlog item
- **Goal:** Decide how legacy preacher and organist records can inform future people, historical references, and role-assignment candidates.
- **Source / traceability:** `docs/auth-account-role-model.md`; `docs/legacy-to-domain-mapping.md`; `docs/domain-model.md`; Legacy data boundary in architecture.
- **Acceptance direction:** Future mapping treats `Kazatele` and `Varhanici` as source knowledge only and does not automatically create login accounts, authenticated actors, or active role assignments.
- **Status:** Proposed

### IP-013 — Design congregation-member preference access

- **Type:** Product backlog item
- **Goal:** Design future direct congregation-member access for entering own preference votes without granting planning permissions.
- **Source / traceability:** `docs/auth-account-role-model.md`; `docs/deployment-assumptions.md`; REQ-013; Preferences and Roles and Permissions modules.
- **Acceptance direction:** Future design supports congregation member own preference entry and preserves the boundary that congregation member access does not include planning, repertoire, or shared-knowledge administration.
- **Status:** Proposed

### IP-014 — Review Planning Lifecycle First schema subset before physical schema design

- **Type:** Product backlog item
- **Goal:** Review `docs/planning-lifecycle-first-schema-subset.md` as the storage-neutral subset of the target technical schema draft needed for Planning Lifecycle First.
- **Source / traceability:** `docs/planning-lifecycle-first-schema-subset.md`; `docs/target-technical-schema-draft.md`; `docs/implementation-preparation.md`; `docs/adr-planning-lifecycle-stack-storage-auth.md`; Planning Lifecycle backlog items.
- **Acceptance direction:** Future design confirms the subset before physical schema design, without creating implementation tasks, database schema, migrations, SQL, or technology selections.
- **Status:** Proposed

### IP-015 — Review first-slice physical schema draft before tooling decisions

- **Type:** Product backlog item
- **Goal:** Review `docs/first-slice-physical-schema-draft.md` before schema, provider, ORM/query, migration, local development, and backup/export/restore decisions.
- **Source / traceability:** `docs/first-slice-physical-schema-draft.md`; `docs/first-slice-schema-open-questions-resolution.md`; `docs/adr-first-slice-storage.md`; `docs/planning-lifecycle-first-schema-subset.md`; `docs/implementation-preparation.md`; `docs/architecture.md`.
- **Acceptance direction:** Future design treats the draft as documentation-only input, applies/reviews accepted design-level schema resolutions before physical schema/tooling decisions, and keeps review outcomes in design/ADR work rather than current implementation tasks.
- **Status:** Proposed

### IP-016 — Keep legacy SQL Server import/reference boundary explicit

- **Type:** Product backlog item
- **Goal:** Preserve the boundary that legacy SQL Server remains source knowledge, import evidence, and reference material only, not the runtime app database.
- **Source / traceability:** `docs/adr-first-slice-storage.md`; `docs/legacy-to-domain-mapping.md`; `docs/first-slice-storage-decision-preparation.md`; `docs/architecture.md`; Legacy data boundary in architecture.
- **Acceptance direction:** Future storage, schema, and import design states how legacy meaning will be transformed into accepted target concepts and avoids copying the `VarhanniDoprovody` table shape into runtime architecture.
- **Status:** Proposed

### IP-017 — Decide priest/organist enforcement location

- **Type:** Product backlog item
- **Goal:** Decide the exact enforcement location for the accepted priest and organist requirement on persisted planning/completed contexts.
- **Source / traceability:** `docs/first-slice-schema-open-questions-resolution.md`; `docs/first-slice-physical-schema-draft.md`; `docs/auth-account-role-model.md`; Planning Lifecycle backlog items.
- **Acceptance direction:** Future design decides the database constraint versus application/domain validation split without creating implementation tasks, schema files, SQL, migrations, or provider-specific choices.
- **Status:** Proposed

### IP-018 — Decide `source_service_set_id` final schema treatment

- **Type:** Product backlog item
- **Goal:** Decide whether `source_service_set_id` is kept as nullable trace/reference or omitted from the final physical schema.
- **Source / traceability:** `docs/first-slice-schema-open-questions-resolution.md`; `docs/first-slice-physical-schema-draft.md`; `docs/adr-first-slice-storage.md`; History module.
- **Acceptance direction:** Future design preserves completed-service records as self-contained copied history and does not make business behavior depend on dereferencing the source set.
- **Status:** Proposed

### IP-019 — Decide first-slice seed/setup mechanism

- **Type:** Product backlog item
- **Goal:** Decide how minimal first-slice seed/setup data will be established for admin, priest, organist, and required role assignments.
- **Source / traceability:** `docs/first-slice-schema-open-questions-resolution.md`; `docs/first-slice-physical-schema-draft.md`; `docs/auth-account-role-model.md`; `docs/deployment-assumptions.md`.
- **Acceptance direction:** Future design identifies a seed/setup mechanism without requiring legacy SQL Server import and without creating scripts, migrations, schema files, SQL, or implementation tasks in this backlog item.
- **Status:** Proposed

### IP-020 — Define schema file layout for accepted tooling direction

- **Type:** Product backlog item
- **Goal:** Define where first-slice typed schema definitions would live for the accepted tooling direction without creating schema files.
- **Source / traceability:** `docs/adr-first-slice-tooling.md`; `docs/first-slice-physical-schema-draft.md`; `docs/first-slice-schema-open-questions-resolution.md`; `docs/architecture.md`.
- **Acceptance direction:** Future design identifies schema file layout and ownership while preserving the boundary that schema definitions are not the domain model and without creating schema files, migrations, SQL, or implementation tasks.
- **Status:** Proposed

### IP-021 — Define migration workflow and review process

- **Type:** Product backlog item
- **Goal:** Define how first-slice migrations will be generated or authored, reviewed before execution, and applied in local and hosted environments.
- **Source / traceability:** `docs/adr-first-slice-tooling.md`; `docs/adr-first-slice-storage.md`; `docs/deployment-assumptions.md`; `docs/first-slice-physical-schema-draft.md`.
- **Acceptance direction:** Future design specifies migration review and execution expectations without creating migrations, SQL, scripts, package installation, or implementation tasks.
- **Status:** Proposed

### IP-022 — Define lifecycle transaction approach

- **Type:** Product backlog item
- **Goal:** Define transaction boundaries for save working set, finalize set, delete working/final set, reorder rows, and complete final set.
- **Source / traceability:** `docs/adr-first-slice-tooling.md`; `docs/first-slice-schema-open-questions-resolution.md`; Planning Lifecycle backlog items; Architecture Planning and History modules.
- **Acceptance direction:** Future design keeps transaction reasoning at design/ADR level and preserves explicit application/domain lifecycle validation before any repository or database implementation work starts.
- **Status:** Proposed

### IP-023 — Preserve application/domain validation boundary during implementation design

- **Type:** Product backlog item
- **Goal:** Define review criteria that prevent typed schema definitions, generated models, database constraints, or repository helpers from replacing explicit domain/application lifecycle validation.
- **Source / traceability:** `docs/adr-first-slice-tooling.md`; `docs/architecture.md`; `docs/implementation-preparation.md`; `docs/first-slice-tooling-decision-preparation.md`.
- **Acceptance direction:** Future design documents how lifecycle operations and planning permissions remain explicit in application/domain services without creating code, tests, schema files, migrations, or implementation tickets.
- **Status:** Proposed

## Not Backlog Yet

The following areas must not be decomposed from this backlog yet:

- database schema;
- API endpoints;
- UI components;
- authentication infrastructure;
- deployment;
- tests;
- migration scripts;
- multi-congregation implementation;
- automatic completion implementation details.
