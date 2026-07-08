# Target Technical Schema Draft

## 1. Purpose

This document proposes a first storage-neutral technical schema shape for the future app. It translates the accepted logical target-domain persistence model and the authentication/account/role model into candidate entities, relationships, keys, and constraints without selecting a concrete storage technology.

This is a draft candidate schema, not an accepted final schema. It is intended to make later storage, ADR, and implementation discussions more concrete while preserving the accepted boundaries: the legacy SQL Server / SSMS database `VarhanniDoprovody` is a source of knowledge, not the target architecture, and the target schema must be derived from the accepted/refactored domain model.

## 2. Non-goals

This document does not:

- choose SQLite, SQL Server, PostgreSQL, Prisma, Auth.js, Next.js, or any concrete technology;
- define SQL, DDL, migrations, a Prisma schema, API endpoints, UI components, or tests;
- copy the legacy SQL Server schema one-to-one;
- define a migration or import execution plan;
- mark any ADR as accepted;
- create an implementation plan;
- finalize the target schema, query strategy, indexing strategy, account provider, or physical constraints;
- design the full candidate-selection engine.

Terms such as "candidate entity", "candidate relationship", "candidate key", "candidate constraint", and "future schema may represent" are intentional.

## 3. Inputs and accepted constraints

Primary inputs:

- `docs/target-domain-persistence-model.md` for logical persistence areas.
- `docs/legacy-to-domain-mapping.md` for legacy knowledge interpretation.
- `docs/auth-account-role-model.md` for person, account, actor, role, role-assignment, and historical-reference concepts.
- `docs/deployment-assumptions.md` for the accepted single hosted one-congregation deployment assumption.
- `docs/storage-options-comparison.md` and `docs/adr-planning-lifecycle-stack-storage-auth.md` for unresolved storage/auth boundaries.
- `docs/technical-design-planning-lifecycle.md` and `docs/implementation-preparation.md` for first-slice Planning Lifecycle First implications.
- `docs/domain-model.md`, `docs/requirements.md`, `docs/workflows.md`, `docs/architecture.md`, `docs/decisions.md`, and `docs/backlog.md` for accepted behavior and traceability.

Accepted constraints shaping this draft:

- The first implementation slice is Planning Lifecycle First.
- The accepted production-oriented deployment assumption is a single hosted web app for one congregation.
- Direct access roles are priest, organist, admin, and congregation member.
- Multi-congregation support is out of scope.
- Storage and auth provider remain unresolved.
- Song identity is `(language, number)`; number alone is not sufficient.
- Melody is an equivalence relation on songs.
- Service planning uses flexible ordered rows, not four fixed song slots.
- Non-completed working/final sets are plans; completed-service records are historical.
- Preferences attach to concrete songs, not melody classes.
- Legacy tables may provide evidence but must not dictate the target schema.

## 4. Draft design principles

1. **Model accepted domain concepts first.** Candidate entities should represent songs, melody equivalence, repertoire, preference votes, service sets, completed history, people/roles, and knowledge mappings rather than legacy table names.
2. **Stay storage-neutral.** The same candidate shape should be understandable whether later represented relationally, document-oriented, graph-like, or by another persistence approach.
3. **Separate facts by ownership and stability.** Stable song catalog metadata, role-specific preference votes, organist repertoire, planning rows, historical rows, and import traceability should remain conceptually distinct.
4. **Prefer concrete song references.** Repertoire entries, preference votes, service rows, mappings, and history should reference concrete song identity `(language, number)`, with melody-class behavior derived or projected where needed.
5. **Support lifecycle transitions explicitly.** The draft should make it possible to distinguish no set, working set, final set, and completed-service history without treating history as an editable plan.
6. **Leave room for review and correction.** Melody equivalence, legacy imports, and historical person references need enough traceability for later validation without requiring runtime dependency on legacy SQL Server.

## 5. Candidate schema overview diagram

```text
People / Access
  Person ── Account? ── Actor ── RoleAssignment ── Role
     │                         │
     └── HistoricalPersonReference

Song knowledge
  Song(language, number)
     ├── MelodyClassMembership ── MelodyClass
     │                              └── MelodyLinkEvidence? ── Song
     ├── RepertoireEntry ── Actor/Person with organist role
     ├── PreferenceVote ── Actor/Role source
     ├── AntiphonMapping
     └── LiturgicalSeasonSongMapping

Planning lifecycle
  ServiceContext
     ├── ServiceSet(status: working|final)
     │     └── ServiceSetRow(order, song? or note)
     └── CompletedServiceRecord
           └── CompletedServiceRow(order, song? or note)

Traceability
  SourceReference / ImportNote may attach to imported or reviewed candidate records.
```

Candidate entity summary:

| Candidate entity | Purpose | Key relationships |
| --- | --- | --- |
| `Song` | Canonical concrete song in the unified catalog. | Referenced by repertoire, preferences, service rows, history, mappings, and melody membership/evidence. |
| `MelodyClass` | Candidate class-level identity for songs sharing a melody. | Has many `MelodyClassMembership` records. |
| `MelodyClassMembership` | Candidate efficient lookup from song to melody class. | Links one concrete `Song` to one `MelodyClass`. |
| `MelodyLinkEvidence` | Optional reviewed/imported evidence for equivalence edges. | Links two concrete songs and optional source references. |
| `Person` | Real-world individual or named participant. | May connect to accounts, role assignments, repertoire ownership, or historical references. |
| `Account` | Login-capable identity if needed by the chosen auth design. | May connect to a person and actor. |
| `Actor` | Permission and attribution identity. | Has role assignments; may cast preferences or perform lifecycle actions. |
| `RoleAssignment` | Current or later time-bounded role relationship. | Links actor/person/account identity to priest, organist, admin, or congregation member role. |
| `HistoricalPersonReference` | Preserved name/reference for legacy or historical interpretation. | May be used by service context, completed history, or import notes. |
| `RepertoireEntry` | Organist-specific playable song knowledge. | Links organist identity to concrete `Song` and repertoire meaning/state. |
| `PreferenceVote` | Role-weighted vote on a concrete song. | Links voting actor/role source to concrete `Song`. |
| `ServiceContext` | One service occurrence or planned service context. | Owns at most one non-completed set and/or one completed historical record, depending on lifecycle. |
| `ServiceSet` | Saved non-completed working or final plan. | Belongs to one service context and has ordered rows. |
| `ServiceSetRow` | Flexible ordered plan row. | May reference a concrete song or contain a textual note. |
| `CompletedServiceRecord` | Historical record of what happened. | Converted from a final set or otherwise recorded as completed history. |
| `CompletedServiceRow` | Ordered historical row. | May reference a concrete song or contain a textual note. |
| `AntiphonMapping` | Highlighting knowledge from `(language, antiphon number)` to song. | References concrete `Song`. |
| `LiturgicalSeasonSongMapping` | Highlighting knowledge from `(language, season)` to songs. | References concrete `Song`. |
| `SourceReference` / `ImportNote` | Lightweight legacy/import/review traceability. | May attach to candidate records where useful. |

## 6. Song catalog candidate entities

### `Song`

Candidate purpose: represent one canonical catalog song across the unified Czech/Polish catalog.

Candidate key:

- stable internal identity if useful later;
- unique domain identity `(language, number)`.

Candidate attributes:

- `language`;
- `number`;
- optional `title`;
- optional `sourceHymnal` or source collection;
- optional `webLink`;
- optional `verseCount`;
- optional `themes` or tag references;
- optional notes;
- optional review/import status if needed.

Candidate relationships:

- one song may have melody-class membership;
- one song may appear in repertoire entries, preference votes, service rows, completed rows, antiphon mappings, and liturgical-season mappings.

Future metadata remains open. Preference scores, repertoire state, candidate score, and service usage should not be stored as stable song metadata.

## 7. Melody-equivalence candidate entities

Melody equivalence must support class-level access for candidate selection and non-repetition. The draft shape may use both efficient membership and optional evidence records, but this is not an accepted final design.

### `MelodyClass`

Candidate purpose: represent a candidate equivalence class of one or more songs sharing the same melody, including singleton classes.

Candidate key:

- internal melody-class identity, if materialized.

Candidate relationships:

- has many `MelodyClassMembership` records.

### `MelodyClassMembership`

Candidate purpose: provide efficient lookup from concrete song to melody-equivalence class.

Candidate key/constraint:

- candidate uniqueness by `song` so each song belongs to one current melody class;
- candidate uniqueness by `(melodyClass, song)` if represented as membership records.

Candidate relationships:

- links `Song` to `MelodyClass`.

### `MelodyLinkEvidence` optional concept

Candidate purpose: preserve reviewed or imported equivalence edges for traceability, correction, and review.

Candidate attributes:

- source song identity;
- target song identity;
- source/evidence type, such as legacy Czech-Czech, Polish-Polish, Czech-Polish, manual review, or later curated input;
- optional confidence/review status;
- optional notes/source reference.

Legacy `CeskePisne`, `PolskePisne`, and `CeskePolskePisne` may provide initial evidence edges. Future schema may derive classes from edges, materialize classes from reviewed edges, or maintain both; this draft does not choose.

## 8. People, accounts, actors, and roles candidate entities

### `Person`

Candidate purpose: represent a real-world individual or named participant relevant to planning, roles, repertoire, preferences, or history.

Candidate attributes may include display name, active/inactive flag, and notes. A person is not automatically login-capable.

### `Account`

Candidate purpose: represent a login-capable identity if the later auth design requires stored accounts.

Candidate relationships:

- may link to one person;
- may produce or correspond to an actor for authorization.

The draft does not choose account provider, credentials, login method, or account lifecycle.

### `Actor`

Candidate purpose: represent the permission and attribution identity for state-changing actions and own preference votes.

Candidate relationships:

- has role assignments;
- may be associated with an account and/or person depending on later auth design;
- may be referenced by created/updated/finalized/completed attribution fields where needed later.

### `Role` and `RoleAssignment`

Candidate role values:

- priest;
- organist;
- admin;
- congregation member.

Candidate purpose: link an actor/person/account-related identity to one or more accepted roles. A real person can hold multiple roles. Admin does not automatically mean priest or organist.

Role assignment time-versioning, ownership, and audit behavior remain open.

### `HistoricalPersonReference`

Candidate purpose: preserve a historical name/reference from legacy or completed-service context without requiring an active account or role assignment.

Legacy `Kazatele` and `Varhanici` may inform people or historical references but must not be treated as authenticated users automatically.

## 9. Repertoire candidate entities

### `RepertoireEntry`

Candidate purpose: represent organist-specific knowledge that an organist can play a concrete song or melody.

Candidate key:

- candidate uniqueness by `(organist identity, song)` for current repertoire entries.

Candidate attributes:

- organist reference, likely to actor/person with organist role;
- concrete song identity;
- repertoire meaning/state: `prepared` for `připravená`, `alreadySounded` for `hraná`;
- optional notes, source reference, and review status.

Excluded future state:

- `doporučená` is not a repertoire state. Recommendation-like meaning should be represented by preference votes only if an accepted later decision validates that transformation.

Candidate behavior:

- candidate eligibility can spread through the song's melody-equivalence class;
- display may still need to show which concrete song is explicitly in the selected/default organist's repertoire;
- when a prepared repertoire song or melody is used in completed service history, future behavior should preserve the conceptual transition to already sounded.

## 10. Preference-vote candidate entities

### `PreferenceVote`

Candidate purpose: store a role-weighted vote on a concrete song.

Candidate key:

- likely uniqueness by `(voter actor or managed preference source, role/source type, song)` depending on later preference ownership decisions.

Candidate attributes:

- concrete song identity;
- voter actor or managed congregation-preference source;
- role/source type: priest, organist, congregation member, or admin-managed congregation preference;
- score;
- optional attribution and notes.

Candidate constraints:

- priest score range: `0–3`;
- organist score range: `0–2`;
- congregation member score range: `0–1`;
- admin has no own preference vote;
- admin may manage congregation preferences;
- votes attach to concrete songs, not melody classes.

Aggregated preference score may be derived or projected for display/filtering, but it is not stable song metadata.

## 11. Service planning candidate entities

### `ServiceContext`

Candidate purpose: represent the service occurrence/context around which planning happens.

Candidate attributes may include:

- service date;
- service language;
- informational service time;
- priest reference or historical reference;
- organist reference or historical reference;
- manually entered antiphon number;
- manually selected liturgical season;
- later preference threshold or non-repetition configuration reference if accepted.

### `ServiceSet`

Candidate purpose: represent a saved non-completed plan for one service context.

Candidate attributes:

- lifecycle status: `working` or `final`;
- created/updated/finalized attribution fields if needed;
- timestamps or versioning if later storage design requires conflict handling.

Candidate relationships:

- belongs to one service context;
- has ordered `ServiceSetRow` records.

Lifecycle behavior:

- no set exists when no saved non-completed service set exists for a service context;
- working sets are editable by authorized roles;
- final sets are not directly edited;
- a final set is changed by deletion and recreation;
- deleting a saved working or final set returns the service to no set exists.

### `ServiceSetRow`

Candidate purpose: represent one flexible ordered row in a working or final plan.

Candidate attributes:

- row order/position;
- optional concrete song reference;
- optional textual note;
- optional row kind if later useful, such as song, instrumental, choir, external contribution, or other note.

Candidate constraints:

- a row may contain a song or non-song note;
- a row without a song requires textual note;
- standard case has four songs, but the schema must not hard-code four fixed song slots.

## 12. Completed history candidate entities

### `CompletedServiceRecord`

Candidate purpose: represent historical completed-service data, usually converted from a final set.

Candidate attributes:

- historical service context snapshot or relationship to `ServiceContext`;
- completion attribution if needed;
- completion timestamp/date if needed.

Candidate relationships:

- has ordered `CompletedServiceRow` records;
- may preserve priest/organist historical references without requiring current accounts.

Completed-service records are historical and should not be treated as editable plans.

### `CompletedServiceRow`

Candidate purpose: preserve one ordered historical row.

Candidate attributes and constraints mirror service rows where useful:

- row order/position;
- optional concrete song reference;
- optional textual note;
- row without song requires note.

Completed song rows provide backward non-repetition input by melody-equivalence class. Non-song rows are ignored for melody repetition checks.

## 13. Knowledge mapping candidate entities

### `AntiphonMapping`

Candidate purpose: map `(language, antiphon number)` to concrete song identity for highlighting.

Candidate key:

- candidate uniqueness by `(language, antiphon number, song)` or another reviewed mapping shape if multiple songs are valid.

Candidate behavior:

- used after hard filters;
- not a hard filter;
- references concrete songs.

### `LiturgicalSeasonSongMapping`

Candidate purpose: map `(language, liturgical season)` to concrete songs for highlighting.

Candidate key:

- candidate uniqueness by `(language, liturgical season, song)`.

Candidate behavior:

- used after hard filters;
- not a hard filter;
- references concrete songs.

Themes/tags may later become song metadata or separate mapping concepts, but that remains deferred.

## 14. Legacy traceability candidate concepts

This draft does not design a full migration system and does not require runtime dependency on legacy SQL Server.

Lightweight traceability may be useful for imported or reviewed records:

- `SourceReference`: optional source system, legacy table name, legacy record identifier, source field, and import/review batch label.
- `ImportNote`: optional human-readable note about interpretation, uncertainty, validation, or manual correction.
- `reviewStatus`: optional state such as imported, reviewed, corrected, ignored, or needs review.

Candidate attachment points include songs, melody-link evidence, repertoire entries, people/historical references, completed-service records, and knowledge mappings. Traceability should support validation and future correction without preserving legacy table shape as the target model.

## 15. Candidate constraints and invariants

Candidate invariants for later schema/design work:

- Song identity is unique by `(language, number)`.
- Number alone is never a sufficient song identity.
- Preferences attach to concrete songs, not melody classes.
- Melody non-repetition must operate on melody-equivalence class, not individual song only.
- A song should have one current melody-class membership if classes are materialized; singleton classes are allowed.
- Repertoire belongs to an organist and a concrete song identity.
- `prepared` and `alreadySounded` preserve `připravená` and `hraná` meaning.
- `doporučená` is not a future repertoire state.
- Preference scoring ranges are role-specific: priest `0–3`, organist `0–2`, congregation member `0–1`.
- Admin has no own preference vote.
- Admin may manage congregation preferences.
- Congregation member has no planning permissions.
- Admin does not automatically mean priest or organist.
- A real person can hold multiple roles.
- Legacy people records do not automatically create accounts or active users.
- A service row must contain either a song reference or textual note.
- A row without song requires textual note.
- Ordered service rows must not be represented as four fixed song slots.
- A saved non-completed service set is either working or final.
- Final set is not edited directly; it is deleted and recreated if changed.
- Deleting a saved working or final set returns the service to no set exists.
- Completed-service record is historical, not an editable working/final plan.
- Non-song rows are ignored for melody repetition checks.
- Saved future working/final sets provide forward non-repetition protection.
- Completed-service records provide backward non-repetition input.
- Antiphon and liturgical-season mappings are highlighting inputs after hard filters, not hard filters.

## 16. Candidate derived values / projections

The following values may be derived, projected, cached, or materialized later depending on storage technology and performance needs:

- melody-equivalence class for a song if classes are derived from evidence edges;
- aggregate preference score for a concrete song;
- candidate eligibility by organist repertoire through melody class;
- explicit repertoire-song display markers for a candidate melody class;
- backward non-repetition blocked melody classes from completed history;
- forward non-repetition blocked melody classes from saved future working/final plans;
- current planning lifecycle state for a service context: no set, working, final, or completed;
- imported/reviewed status summaries for catalog, melody, repertoire, and history records.

Derived values should not be mistaken for stable source facts unless later accepted as persisted projections with clear refresh/correction rules.

## 17. First-slice minimum subset

Planning Lifecycle First should require only the smallest candidate subset needed to validate the core planning artifact:

- enough `Person`, `Actor`, `Role`, and `RoleAssignment` representation to enforce priest, organist, admin, and congregation member permission checks;
- service context for one congregation, without multi-congregation tenancy;
- saved working/final `ServiceSet` for one service;
- ordered `ServiceSetRow` records that can hold a concrete song reference or textual note;
- minimal song reference validation by `(language, number)`;
- conversion from final service set to `CompletedServiceRecord` with ordered completed rows;
- lifecycle behavior for no set exists, working set, final set, completed-service record, and deletion of saved non-completed sets;
- final-set protection from direct edits.

Not needed in the first slice:

- full candidate-selection engine;
- full melody non-repetition engine;
- full preference UI;
- full catalog import;
- full repertoire management;
- full antiphon/liturgical-season highlighting;
- complete legacy import/refactoring pipeline;
- physical database schema, migrations, or ORM-specific model.

## 18. Explicitly deferred parts

Deferred schema/design topics:

- concrete storage technology and physical schema design;
- auth provider, account creation, invitation, recovery, and role-assignment ownership;
- whether melody classes are stored directly, derived from edges, or both;
- class merge/split/correction behavior;
- full song metadata and tag/theme model;
- full preference ownership model for congregation preferences;
- full candidate-selection and scoring engine;
- detailed non-repetition period configuration and conflict handling implementation;
- audit/change-history requirements;
- legacy import execution, validation workflow, and rollback strategy;
- backup/export/restore schema implications;
- multi-congregation tenancy.

## 19. Open schema questions

- Should melody equivalence be represented primarily as classes, edges, or both?
- How should melody-class corrections preserve historical interpretation of completed-service rows?
- Should completed-service records snapshot song titles/person names, or reference current catalog/person records plus historical references?
- What exact ownership model should congregation preference votes use?
- How should admin-managed congregation preferences be distinguished from admin's lack of own preference vote?
- Are role assignments current-only or time-versioned?
- How much attribution/audit data is needed in the first production slice?
- What minimal catalog validation is enough before full catalog import exists?
- Should repertoire state be stored as current state, derived from completed history, or both?
- How should concurrent edits to a working set be detected or resolved under the accepted hosted deployment assumption?
- What backup/export shape will later storage decisions require?

## 20. How this draft informs later storage/ADR decisions

This draft gives later storage and ADR work a domain-derived checklist without preselecting technology. A candidate storage option should be evaluated by whether it can represent and enforce, or allow the application to enforce, these schema concepts:

- unique concrete song identity by `(language, number)`;
- class-level melody access for repertoire eligibility and non-repetition;
- flexible ordered service rows with song-or-note constraints;
- lifecycle separation between working/final plans and completed history;
- role-aware permissions and preference scoring;
- historical person references distinct from accounts;
- lightweight legacy traceability without runtime dependency on SQL Server;
- derived/projection support for aggregate scores, candidate checks, and non-repetition readiness.

The draft should help future ADRs compare storage, auth, and schema approaches against accepted domain behavior while avoiding premature commitment to SQL, Prisma, migrations, or a specific database engine.
