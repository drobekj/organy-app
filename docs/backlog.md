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

### IP-002 — Defer future multi-congregation support

- **Type:** Open question
- **Goal:** Keep multi-congregation support as a future product question rather than current implementation scope.
- **Source / traceability:** Product vision scope boundaries; Domain Analysis open questions; Domain Model open modeling questions; Roadmap Open Roadmap Questions; architecture system context.
- **Acceptance direction:** Future multi-congregation needs may be explored and decided later, but current backlog and implementation preparation do not decompose multi-congregation implementation work.
- **Status:** Open

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
