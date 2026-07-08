# Planning Lifecycle First Schema Subset

## 1. Purpose

This document identifies the minimum storage-neutral candidate schema concepts needed to reason about the first implementation slice: **Planning Lifecycle First**.

It narrows `docs/target-technical-schema-draft.md` to the concepts needed for one service context, one concrete ordered service set, manual working/final lifecycle behavior, and completed-service history. It is a design input for later technical decisions, not an accepted physical schema or authorization implementation.

## 2. Non-goals

This document does not:

- define a physical schema, SQL, DDL, migrations, Prisma schema, API endpoints, UI components, tests, or application code;
- choose SQLite, SQL Server, PostgreSQL, Prisma, Auth.js, Next.js, or any other concrete technology;
- choose a storage technology, persistence style, authentication provider, hosting provider, or account implementation;
- mark any ADR as accepted;
- create an implementation plan or declare that coding can start;
- design the full candidate-selection engine, preference system, repertoire management, melody non-repetition engine, canonical catalog import, or legacy migration.

## 3. Inputs and accepted constraints

Primary inputs:

- `docs/target-technical-schema-draft.md`
- `docs/technical-design-planning-lifecycle.md`
- `docs/implementation-preparation.md`
- `docs/target-domain-persistence-model.md`
- `docs/auth-account-role-model.md`
- `docs/deployment-assumptions.md`
- `docs/adr-planning-lifecycle-stack-storage-auth.md`
- `docs/storage-options-comparison.md`
- `docs/legacy-to-domain-mapping.md`
- `docs/domain-model.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/backlog.md`

Accepted constraints for this subset:

- The first implementation slice is Planning Lifecycle First.
- The accepted deployment assumption is a single hosted web app for one congregation.
- Direct access roles are priest, organist, admin, and congregation member.
- Multi-congregation support is out of scope.
- Storage technology and auth provider remain unresolved.
- Full candidate selection, full preference UI, full repertoire management, full canonical song catalog import, full melody non-repetition, and full legacy migration are outside this slice.

## 4. Subset selection principles

1. **Include only lifecycle-supporting concepts.** Keep concepts needed to represent no set, working set, final set, completed-service record, ordered rows, minimal song references, and role-based permission checks.
2. **Keep the shape storage-neutral.** Names below are candidate concepts, not table names, ORM models, documents, or API resources.
3. **Represent concrete rows flexibly.** The subset must support the standard four-song case without hard-coding four physical slots.
4. **Preserve lifecycle meaning.** Non-completed working/final sets and completed-service records are conceptually distinct.
5. **Leave future knowledge areas attachable.** The subset should not block later song catalog, melody, repertoire, preference, mapping, and legacy-data work.

## 5. Included first-slice candidate concepts

The first slice should use only these minimum candidate concepts from the broader draft:

| Candidate concept | First-slice reason for inclusion |
| --- | --- |
| `Person` / `Actor` / `RoleAssignment` or equivalent actor-role representation | Needed to evaluate planning permissions and attribute lifecycle actions at a conceptual level. |
| `Account` | Optional unresolved production concern only if later auth design requires stored login accounts; not required by this subset as a chosen auth design. |
| `SongReference` | Minimal concrete song identity by `(language, number)` for service rows and completed-history rows. |
| `ServiceContext` | Represents the one service occurrence for which a set may or may not exist. |
| `ServiceSet` | Represents a saved non-completed working or final plan for one service context. |
| `ServiceSetRow` | Represents ordered flexible rows in a working/final plan. |
| `CompletedServiceRecord` | Represents historical completion for one service context. |
| `CompletedServiceRow` | Represents ordered historical rows preserved from completion. |

## 6. Minimally included people/actor/role concepts

The first slice needs an actor-role representation sufficient to enforce lifecycle permissions at state-changing boundaries:

- `Person` or equivalent real-world participant reference for priest and organist context when needed.
- `Actor` or equivalent authorization identity for the current state-changing action.
- `RoleAssignment` or equivalent way to determine whether the actor currently has priest, organist, admin, or congregation member responsibility.
- Optional attribution placeholders such as created by, updated by, finalized by, completed by, and deleted by may be considered later, but full audit/change-history is deferred.

`Account` remains an unresolved production concern. This subset does not decide whether accounts are stored locally, delegated to an external provider, derived from a provider session, or represented another way.

## 7. Minimally included song reference concept

The first slice needs a minimal `SongReference`, not the full canonical `Song` catalog.

A `SongReference` must include:

- `language`;
- `number`.

This supports minimal validation that a row's song reference is concrete. Number alone is not valid. Title, source hymnal, web link, themes, melody class, repertoire state, imported source evidence, and catalog curation metadata are outside this first-slice subset.

## 8. Included service planning concepts

### `ServiceContext`

Represents one service occurrence or planned service context. The first slice needs enough context to attach a non-completed service set or completed-service record for one service. Candidate service context information may include service date, service language, informational service time, priest reference, organist reference, antiphon number, and liturgical season when needed as manual context fields; antiphon and season do not drive candidate filtering in this slice.

### `ServiceSet`

Represents one saved non-completed set for a service context. A saved non-completed set is either:

- `working`; or
- `final`.

A working set may be created, edited, saved, and deleted by priest, organist, or admin. A final set may be saved or deleted by priest or admin and is not directly edited.

### `ServiceSetRow`

Represents one ordered row in a saved working or final set.

Each row needs:

- an order value or equivalent ordering representation;
- optional `SongReference` by `(language, number)`;
- optional textual note;
- validation that a row without a song has textual note content.

The row model must support adding, deleting, and reordering rows while the set is working. It must not use four fixed song slots as the physical design assumption.

## 9. Included completed-history concepts

### `CompletedServiceRecord`

Represents a historical record for a service context after a final set is manually converted by priest or admin. Later system automation for this conversion is deferred.

A completed-service record is historical. It is not a working set, not a final set, and not reopened through the first-slice planning lifecycle.

### `CompletedServiceRow`

Represents one ordered historical row stored with a completed-service record.

Each completed row preserves:

- historical row order;
- optional `SongReference` by `(language, number)`;
- optional textual note, required when no song reference exists.

Completed rows provide historical ordered content. Full melody non-repetition behavior using completed history is deferred.

## 10. First-slice candidate invariants

- A service context may have no saved non-completed set.
- A saved non-completed set is either working or final.
- A final set is not edited directly.
- Deleting a working or final set returns the service context to `no set exists`.
- A completed-service record is historical and is not a non-completed plan.
- Service rows and completed-service rows are ordered.
- A row must contain either a song reference or textual note.
- A row without a song requires textual note content.
- The schema subset must not assume fixed four-song physical slots.
- A song reference must include language and number.
- Congregation members have no planning permissions.
- Permission checks are based on actor roles, not only UI hiding.

## 11. Explicitly deferred candidate concepts

The following concepts from the broader candidate schema are deferred because they are not needed to support the first lifecycle slice:

- full `Song` catalog metadata;
- canonical song catalog sourcing/import;
- `MelodyClass`;
- `MelodyClassMembership`;
- `MelodyLinkEvidence`;
- full `RepertoireEntry` management;
- `PreferenceVote` UI and persistence beyond not excluding future congregation-member access;
- `AntiphonMapping`;
- `LiturgicalSeasonSongMapping`;
- full candidate-selection engine;
- full non-repetition engine;
- full legacy import/refactoring;
- `SourceReference` / `ImportNote`, unless minimal notes are later needed for data preparation;
- audit/change-history beyond minimal attribution placeholders;
- multi-congregation tenancy.

## 12. Deferred candidate behavior

The first-slice subset does not design or require:

- repertoire-based candidate eligibility;
- service-language candidate filtering beyond storing or referencing service language where needed;
- preference-threshold filtering;
- antiphon or liturgical-season highlighting;
- melody-class non-repetition checks against completed history or future plans;
- automatic final-set completion timing, triggers, safeguards, or exception behavior;
- congregation-member preference entry UI or persistence;
- admin-managed catalog, mapping, repertoire, preference, or melody maintenance workflows;
- legacy import, data cleaning, synchronization, or backfill workflows;
- conflict detection among non-completed plans beyond preserving the distinction between non-completed sets and historical completed records.

## 13. Relationship to legacy data

Legacy data remains a source of domain knowledge, not the target shape for this subset. In particular:

- fixed legacy service-song slots must not become fixed first-slice physical slots;
- separate Czech and Polish legacy song tables must not force separate first-slice song-reference concepts;
- legacy preacher, organist, service, and song references may inform later mapping, but this subset only needs minimal person/actor references, service context, ordered rows, and `(language, number)` song references;
- full legacy migration and refactoring remain deferred.

## 14. Relationship to future full schema

This subset is intended to be a small attachable core within the future full schema. Later design may extend it by connecting:

- minimal song references to a canonical song catalog;
- concrete song references to melody classes and melody evidence;
- service context and rows to candidate-selection, repertoire, preference, highlighting, and non-repetition behavior;
- completed-service history to backward non-repetition and repertoire state transitions;
- actor-role concepts to a chosen auth/account provider and account lifecycle;
- minimal attribution placeholders to accepted audit/change-history behavior if needed.

Future design may rename, combine, split, or physically represent these concepts differently after storage and auth decisions are made, provided the first-slice invariants remain preserved.

## 15. Open questions before physical schema design

Before creating a physical schema, later design must answer at least these questions:

1. What storage technology and persistence style will be used?
2. What authentication provider and account model will be used?
3. How will actors and role assignments be represented and resolved at permission-check time?
4. Which service-context fields are required for the first slice, and which are optional manual context fields?
5. How much attribution is required for create, edit, finalization, deletion, and manual completion before full audit/history is designed?
6. Should a completed-service record coexist with later new planning for the same service context, or is that outside the first slice?
7. What minimal validation is possible for `(language, number)` before the full canonical song catalog exists?
8. What automatic final-set completion behavior, if any, will be accepted later?

## 16. How this subset informs later storage/ADR decisions

This subset gives later storage, auth, and stack ADR work a practical minimum to evaluate without prematurely choosing technologies. A future ADR or physical schema design should be able to show how the chosen approach represents:

- one service context with no saved non-completed set, a working set, a final set, or completed history;
- ordered flexible rows without four fixed slots;
- minimal concrete song references by `(language, number)`;
- actor-role permission checks for priest, organist, admin, and congregation member boundaries;
- manual conversion from final set to completed-service record;
- deletion of saved non-completed sets back to `no set exists`.

If a proposed storage or auth design cannot preserve those behaviors without also forcing deferred concepts or concrete technology choices too early, it should be revised before implementation planning proceeds.
