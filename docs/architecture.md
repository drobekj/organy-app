# Architecture

## Purpose
This document describes the high-level conceptual application architecture for the liturgical music knowledge-management and planning-support system.

It defines logical modules, responsibilities, boundaries, and data flow only. It does not choose technologies, design a database schema, define frontend components, create implementation tasks, or replace the accepted product, domain, decision, requirement, and workflow documents.

## Architecture Principles

- Domain rules live in the application/domain layer, not only in UI.
- Decisions remain human; the system supports planning but does not choose final liturgical selections.
- Architecture should preserve knowledge once entered and reuse it across planning.
- No technical schema or implementation details are decided in this document.
- Future implementation should remain traceable to requirements and decisions.

## System Context and Scope

The application serves one local congregation. The current architecture should therefore model one congregation clearly instead of introducing premature multi-congregation abstractions.

Primary users are priest, organist, admin, and congregation member. They interact with the system to maintain knowledge, express preferences, manage repertoire, and prepare concrete ordered service sets. The system stores and reuses planning knowledge, applies accepted domain rules, and presents candidate context, but the final liturgical selection remains a human decision.

## Conceptual Module Overview

The system is organized around these logical modules:

- **Planning module** — manages concrete service-set lifecycle and ordered service rows.
- **Knowledge module** — maintains shared song, melody, antiphon, and liturgical-season knowledge.
- **Repertoire module** — maintains explicit organist repertoire and exposes melody-class eligibility information.
- **Candidate selection module** — combines knowledge, repertoire, history, preferences, and planning context to produce eligible candidate displays.
- **Non-repetition / conflict module** — applies melody-class non-repetition and validates conflicts among non-completed plans.
- **Preferences module** — manages role-weighted preferences on concrete songs and exposes total scores.
- **Roles and permissions module** — authorizes planning, knowledge, repertoire, preference, and administration actions, using `docs/auth-account-role-model.md` as the logical source for person/account/actor/role concepts.
- **History module** — preserves completed-service records and provides backward non-repetition input.
- **Legacy data boundary** — acknowledges legacy data as an input or constraint without deciding migration strategy.

These modules are conceptual boundaries. They may later be implemented as separate services, application-layer components, packages, or other structures, but this document does not decide that implementation form.

## Planning Module

The Planning module manages service planning as concrete ordered service sets for one service.

Responsibilities:

- Represent service-set lifecycle states:
  - no set exists;
  - working set;
  - final set;
  - completed-service record.
- Support the normal lifecycle:
  - `no set exists → working set → final set → completed-service record`.
- Support direct finalization from `no set exists` to `final set` when required information is present and the actor is authorized.
- Allow saved working sets to be edited by authorized roles.
- Treat final sets as not directly editable; required changes happen by deletion and recreation by an authorized role.
- Return a service to `no set exists` when a saved working or final set is deleted.
- Manage flexible ordered rows, including adding, removing, and reordering rows.
- Support rows containing concrete songs and rows representing instrumental, choir, free-form, or other non-song contributions.
- Enforce that a row without a concrete song must contain textual note content before the set can be saved or finalized.
- Provide planning context to candidate selection, including service date, selected/default organist, service language, antiphon number, liturgical season, and preference threshold.

Boundaries:

- The Planning module owns service-set state and row validity.
- It does not own song catalog knowledge, melody equivalence, repertoire, preference scores, or highlighting mappings.
- It asks the Candidate selection module for eligible candidates and display context.
- It asks the Non-repetition / conflict module to evaluate melody conflicts for planned song rows.

## Knowledge Module

The Knowledge module manages shared domain knowledge reused across planning.

Responsibilities:

- Manage the song catalog.
- Treat song identity as the tuple `(language, number)`; a number alone is not a unique song identity.
- Manage melody equivalence between songs as equivalence-class knowledge.
- Ensure every song belongs to one melody-equivalence class, including singleton classes when no related songs are known.
- Allow melody-equivalence classes to be extended or merged as knowledge is discovered.
- Manage antiphon-to-song mappings from `(language, antiphon number)` to concrete songs.
- Manage liturgical-season-to-song mappings from `(language, liturgical season)` to songs.
- Expose knowledge to candidate selection, planning display, repertoire eligibility, and non-repetition checks.

Boundaries:

- The Knowledge module preserves shared knowledge; it does not choose final service selections.
- Antiphon and liturgical-season mappings provide highlighting signals only. They do not grant candidate eligibility and do not override hard filters.
- The module does not define a database structure for songs, mappings, or equivalence classes.

## Repertoire Module

The Repertoire module manages practical playable repertoire for organists.

Responsibilities:

- Store explicit repertoire entries for organists as concrete songs identified by `(language, number)`.
- Keep repertoire management separate from shared knowledge management.
- Provide explicit repertoire information for candidate display.
- Determine repertoire eligibility at the melody-equivalence class level: a candidate melody is repertoire-eligible when its melody-equivalence class contains at least one song explicitly present in the selected/default organist's repertoire.

Boundaries:

- Repertoire entries do not themselves create or modify melody equivalence.
- Repertoire eligibility can include candidates whose concrete displayed song is not itself explicitly in repertoire, when another song in the same melody-equivalence class is explicitly in repertoire.
- Candidate display must still make the explicit repertoire song visible, including bold visibility where required by accepted rules.

## Candidate Selection Module

The Candidate selection module produces planning candidates from planning context and preserved knowledge.

Responsibilities:

- Start from known concrete songs and their melody-equivalence classes.
- Apply hard filters before any antiphon or liturgical-season highlighting:
  1. selected/default organist repertoire;
  2. service language;
  3. melody non-repetition rule;
  4. preference threshold, default `x = 0`.
- Use the Repertoire module to determine melody-class eligibility for the selected/default organist.
- Apply service language to concrete song display:
  - Czech service shows Czech songs;
  - Polish service shows Polish songs;
  - mixed service shows Czech and Polish songs.
- Use the Non-repetition / conflict module to exclude melody-equivalence classes blocked by history or saved future plans.
- Use total preference scores from the Preferences module and keep concrete songs whose score is at least threshold `x`.
- Apply antiphon highlighting only after hard filters have already produced eligible candidates.
- Apply liturgical-season highlighting only after hard filters have already produced eligible candidates.
- Never restore a candidate removed by a hard filter because of antiphon or liturgical-season mapping.
- Display candidate records with melody-equivalence class context.
- Make explicit repertoire songs visible in bold.
- For Czech or Polish services, add exactly one arbitrary opposite-language repertoire song from the same melody class when the language-filtered display would otherwise hide every explicit repertoire song; mark that repertoire song in bold.
- Avoid the opposite-language exception for mixed services, because both Czech and Polish songs are already displayed.

Boundaries:

- The Candidate selection module supports human selection; it does not choose the final set.
- Candidate selection is a read/evaluation boundary over planning context, knowledge, repertoire, history, and preferences.
- Highlighting is presentation context over already-eligible candidates, not eligibility logic.

## Non-Repetition / Conflict Module

The Non-repetition / conflict module protects planning against melody repetition and validates conflicts among non-completed plans.

Responsibilities:

- Apply melody non-repetition to melody-equivalence classes, not only to individual concrete songs.
- Treat use of the same melody under a different song number or language as repetition when the songs belong to the same melody-equivalence class.
- Perform backward checks against completed-service records within the configured non-repetition period before the planned service date.
- Perform forward protection against saved future working sets and final sets within the configured non-repetition period after the planned service date.
- Ignore rows without concrete songs.
- Treat conflicts as existing only among non-completed plans.
- Treat working sets and final sets as non-completed plans.
- Exclude completed-service records from mutual conflict judgment; historical records inform backward filtering but are not judged as conflicts with each other.
- Validate admin changes of the non-repetition period.
- Block a non-repetition period change if it would create a conflict between currently saved non-completed plans, even when attempted by admin.
- Require conflicting saved sets to be deleted before a blocked period change can be retried successfully.

Boundaries:

- The module exposes eligibility and conflict results to Planning and Candidate selection.
- It does not create knowledge mappings or preferences.
- It does not apply forward antiphon protection.

## Preferences Module

The Preferences module manages role-weighted preferences attached to concrete songs.

Responsibilities:

- Store preferences on concrete songs identified by `(language, song number)`.
- Keep preferences from automatically transferring across melody-equivalence classes.
- Support priest own preference scores from `0` to `3`.
- Support organist own preference scores from `0` to `2`.
- Support congregation member own preference scores from `0` to `1`.
- Ensure admin has no own preference score.
- Support admin administration of congregation preferences.
- Provide total preference score as the sum of role-weighted preferences for a concrete song.
- Provide total scores to Candidate selection for the preference threshold filter.

Boundaries:

- Preferences influence eligibility only through the candidate preference threshold.
- Preferences are decision support; they do not choose final selections.

## Roles and Permissions Module

The Roles and permissions module separates responsibilities for service planning, knowledge management, repertoire management, own preferences, and congregation preference administration. `docs/auth-account-role-model.md` is the logical source for future person, account, actor, role, role assignment, and historical person reference concepts.

Responsibilities:

- Support the roles priest, organist, admin, and congregation member.
- Authorize service planning actions:
  - priest, organist, and admin may create, edit, and delete working sets;
  - priest and admin may save final sets;
  - priest and admin may delete final sets;
  - priest and admin may convert final sets to completed-service records;
  - no role has a direct edit final set action.
- Authorize repertoire management for organist and admin.
- Authorize own preference management for priest, organist, and congregation member.
- Ensure admin has no own song preference.
- Authorize congregation preference administration only for admin.
- Authorize shared knowledge management only for admin, including song catalog, melody equivalence, antiphon mappings, liturgical-season mappings, and non-repetition period.
- Prevent congregation members from administering service sets, repertoire, or shared knowledge.

Boundaries:

- Person, account, actor, role, role assignment, and historical person reference are distinct concepts for later account modeling and schema design.
- Legacy `Kazatele` and `Varhanici` records may inform historical person references or future people records, but they are not automatically authenticated users.
- UI hiding is not sufficient authorization enforcement.
- Permissions for state-changing actions must be enforced in application/domain behavior, not only by hiding UI controls.
- This document does not choose an authentication provider, account technology, authentication mechanism, account model, or security infrastructure.

## History Module

The History module preserves completed-service records as historical planning knowledge.

Responsibilities:

- Create or preserve completed-service records from final sets when a service is completed.
- Keep completed-service records historical rather than treating them as editable non-completed plans.
- Preserve concrete songs and ordered service rows that represent what was finalized for the service.
- Provide completed-service records to the Non-repetition / conflict module for backward melody non-repetition filtering.
- Ensure completed-service records are not judged as conflicts; they only provide backward non-repetition input.

Boundaries:

- History informs future planning but does not reopen or automatically revise past human decisions.
- Automatic conversion from final set to completed-service record is allowed by product direction but remains insufficiently specified for detailed architecture.

## Conceptual Data Flow

Planning data flow:

1. An authorized planner opens a service planning context.
2. The Planning module provides service context: date, language, selected/default organist, antiphon number, liturgical season, current rows, and preference threshold.
3. The Candidate selection module requests shared song and melody knowledge from the Knowledge module.
4. The Candidate selection module requests explicit repertoire and melody-class eligibility from the Repertoire module.
5. The Candidate selection module requests melody non-repetition eligibility from the Non-repetition / conflict module.
6. The Non-repetition / conflict module evaluates completed-service records from History and saved future working/final sets from Planning.
7. The Candidate selection module requests total concrete-song preference scores from the Preferences module.
8. The Candidate selection module applies hard filters, then adds antiphon and liturgical-season highlighting for candidates that remain eligible.
9. The planner uses candidate context to make human selections and saves a working or final set through the Planning module.
10. When a final set becomes completed, the History module preserves it as a completed-service record for future backward non-repetition filtering.

Knowledge data flow:

1. Admin maintains shared song catalog, melody equivalence, antiphon mappings, liturgical-season mappings, and non-repetition configuration.
2. Organist or admin maintains explicit repertoire.
3. Priest, organist, and congregation members maintain allowed own preferences; admin may administer congregation preferences.
4. Entered knowledge remains available for later planning rather than being tied only to one service.

## Legacy Data Boundary

Legacy data exists, including an existing legacy database of approximately ten tables. This is a known boundary and constraint for future implementation.

Migration strategy remains unresolved unless specified by accepted product, domain, decision, requirement, or workflow documents. This architecture therefore does not invent a migration plan, target schema, import process, synchronization approach, or data-cleaning workflow.

Future implementation should evaluate legacy data against accepted domain concepts before deciding whether to migrate, transform, replace, or partially reuse it.

## Data and Persistence Architecture Note

Future persistence and technical schema design must be derived from `docs/target-domain-persistence-model.md`, `docs/auth-account-role-model.md`, `docs/target-technical-schema-draft.md`, `docs/planning-lifecycle-first-schema-subset.md`, and `docs/legacy-to-domain-mapping.md`, not copied from the legacy SQL Server schema. The target-domain persistence model identifies the logical data areas SongCatalog, MelodyEquivalence, Repertoire, PreferenceVotes, ServicePlanning, CompletedHistory, People/Roles, and KnowledgeMappings as concepts for future architecture and schema design.

The technical schema draft adds storage-neutral candidate concepts for later evaluation: Song; MelodyClass / MelodyClassMembership / MelodyLinkEvidence; Person / Account / Actor / RoleAssignment; RepertoireEntry; PreferenceVote; ServiceContext / ServiceSet / ServiceSetRow; CompletedServiceRecord / CompletedServiceRow; AntiphonMapping / LiturgicalSeasonSongMapping; and SourceReference / ImportNote. For Planning Lifecycle First, future architecture and storage evaluation should use only the first-slice subset: minimal Person / Actor / RoleAssignment or equivalent actor-role representation; minimal SongReference by `(language, number)`; ServiceContext; ServiceSet; ServiceSetRow; CompletedServiceRecord; and CompletedServiceRow. These are candidate concepts, not accepted physical tables, SQL, Prisma schema, or implementation tasks. Storage technology remains unresolved.

## Technology Choices

No languages, frameworks, storage systems, infrastructure services, or deployment platforms are selected in this document.

Technology choices should be made later only when they can be traced to accepted requirements, decisions, constraints, and implementation goals.

## Cross-Cutting Concerns

The following concerns must be addressed in future architecture and implementation work, but are not technically designed here:

- authorization enforcement for accepted role permissions;
- validation of domain rules in the application/domain layer;
- preservation and auditability of shared planning knowledge;
- safe handling of historical completed-service records;
- configuration management for the non-repetition period;
- traceability from implementation behavior to requirements and decisions.

## Deployment and Operations

Deployment environments, operational processes, backup strategy, observability, and runbooks are not selected yet.

Operational decisions should respect the current one-local-congregation scope and avoid introducing multi-congregation complexity before it is accepted as product scope.

## Open Architecture Questions

- How should final sets be converted to completed-service records automatically, if automatic conversion is implemented?
- How should legacy data be assessed and migrated, if migration is chosen?
- What application and storage technologies should implement these conceptual modules?
- What audit or change-history behavior is needed for knowledge changes, repertoire changes, preferences, and planning state transitions?
