# Target Domain Persistence Model

## 1. Purpose

This document describes a first refactored **logical target-domain persistence model** for the future application. It is derived from the accepted domain model and the legacy-to-domain mapping, with the explicit goal of showing how future persisted knowledge should differ from the legacy SQL Server database shape.

This is a persistence-oriented domain model, not an accepted physical schema. It does not choose a database, ORM, query style, migration tool, or storage engine. Terms such as "logical concept" and "future schema may represent this as" are intentional: the final technical schema design comes later.

The legacy SQL Server / SSMS database `VarhanniDoprovody` remains an important source of domain knowledge, but its table layout is not the target architecture. Future persistence must preserve useful meaning from the legacy data through accepted domain concepts rather than reproduce legacy tables one-for-one.

## 2. Non-goals

This document does not:

- select SQLite, SQL Server, PostgreSQL, Prisma, or any other concrete storage technology;
- create a database schema, migration, Prisma schema, SQL, API contract, UI component, or test plan;
- accept a final target schema;
- define migration execution or data-cleaning workflows;
- require a one-to-one mapping from legacy SQL Server tables to future persisted structures;
- finalize authentication, account, or user-profile modeling;
- design the full candidate-selection engine;
- finalize the complete set of song metadata fields.

## 3. Design principles

### Model accepted domain, not legacy tables

Future persistence should follow accepted domain concepts: songs identified by `(language, number)`, melody as equivalence between songs, explicit organist repertoire, concrete ordered service sets, completed-service records, role-weighted preferences, people/role references, and contextual knowledge mappings.

Legacy tables may provide source evidence, but their shape is not authoritative for the target architecture. In particular, separate Czech and Polish song tables, fixed service-song slots, and weak or implicit legacy relationships should not become target structures simply because they exist in SQL Server.

### Preserve meaning, not table shape

The important legacy content is the meaning it carries: known songs, partial melody-equivalence edges, organist playable repertoire, historical service usage, preacher and organist references, and possible contextual song knowledge.

Future persistence should transform that knowledge through the accepted domain model. For example, legacy song rows should inform a canonical song catalog, and legacy melody-link columns should inform melody-equivalence knowledge. They should not force separate Czech-song and Polish-song domain entities or a fixed four-song service representation.

### Separate stable metadata from user/role-specific knowledge

Stable or shared song catalog knowledge should remain separate from actor-specific, role-specific, or planning-specific knowledge.

Examples:

- song title, source hymnal, notes, themes, and similar catalog facts are different from preference votes;
- organist repertoire is different from general song metadata;
- aggregated preference score may be displayed, but it is derived from votes and is not stable song metadata;
- completed-service history is different from a future plan.

### Keep storage technology unresolved

This document intentionally stays above physical design. A future schema may represent these concepts with relational tables, documents, graph-like structures, application-managed projections, or another approach chosen later. The persistence model should therefore name logical concepts and relationships without accepting any concrete storage technology.

## 4. Logical data areas overview

The target persistence model can be viewed as a set of logical data areas:

```text
SongCatalog
  └─ concrete songs identified by (language, number)

MelodyEquivalence
  ├─ melody-equivalence knowledge between songs
  └─ derivable or materialized equivalence classes

Repertoire
  └─ organist-specific playable song knowledge

PreferenceVotes
  ├─ role-weighted votes on concrete songs
  └─ derived aggregate scores

ServicePlanning
  ├─ service context
  ├─ working/final service sets
  └─ flexible ordered service rows

CompletedHistory
  └─ historical completed-service records and historical rows

People/Roles
  ├─ real people or actor references
  └─ priest, organist, admin, congregation-member roles

KnowledgeMappings
  ├─ antiphon-to-song mappings
  └─ liturgical-season-to-song mappings
```

These are logical concepts, not yet physical tables. A future schema may combine, split, index, project, or materialize them differently.

## 5. Song catalog

The future application needs a canonical song catalog containing all songs from the Czech and Polish hymnal/chorálník. A song is identified by the compound identity:

```text
(language, number)
```

Examples:

```text
(Czech, 28)
(Polish, 613)
```

Number alone is not sufficient. All song references in repertoire, preferences, service rows, antiphon mappings, liturgical-season mappings, history, and melody-equivalence knowledge must be able to point to a concrete song identity that includes both language and number.

The target model should prefer one unified conceptual `SongCatalog` over separate Czech-song and Polish-song domain entities. The legacy `CeskePisne` and `PolskePisne` tables may inform initial Czech and Polish catalog entries, but their separation should not dictate the future model.

Final song metadata remains open. Possible metadata may include:

- title;
- source hymnal or source collection;
- optional web link;
- number of verses;
- themes or tags;
- notes;
- other future fields accepted by later product/domain decisions.

Catalog metadata should be stable shared knowledge. It should not include user preferences, organist-specific repertoire state, candidate aggregate scores, or service-specific planning decisions.

## 6. Melody-equivalence persistence

Melody is an equivalence relation on songs, not currently a separately named domain entity. The target persistence model must support the fact that each song belongs to one melody-equivalence class at a given point in domain knowledge, including singleton classes for songs with no known related songs.

Legacy `CeskePisne`, `PolskePisne`, and `CeskePolskePisne` provide partial melody-equivalence edges:

- Czech-to-Czech edges from `CeskePisne`;
- Polish-to-Polish edges from `PolskePisne`;
- Czech-to-Polish edges from `CeskePolskePisne`.

Future persistence must support either melody-equivalence classes directly or enough stored relationship evidence to derive those classes reliably.

Two logical approaches remain open:

1. **Store melody links and derive classes.** A future schema may persist explicit equivalence edges between concrete songs and derive connected components as melody-equivalence classes. This preserves source-like evidence and may make review or correction of individual links clearer.
2. **Materialize melody-equivalence classes.** A future schema may persist an explicit class identity and membership for each concrete song. This may simplify candidate selection and non-repetition checks, but requires clear behavior for merging, splitting, and correcting classes.

This document does not choose between those approaches. The important target-domain requirement is that persistence can answer class-level questions for repertoire eligibility, non-repetition, and candidate display without treating melody as a property of one language-specific legacy table.

## 7. Organist repertoire

Repertoire is organist-specific knowledge about concrete songs the organist can play. The logical concept should connect:

```text
organist reference + concrete song identity + repertoire meaning/state
```

Legacy `VarhaniciPisne` is the source of organist repertoire knowledge. The accepted repertoire meanings are:

- `připravená` — the organist can play the song or melody, but it has not yet sounded in a service;
- `hraná` — the song or melody has already sounded in a service;
- `doporučená` — should not be migrated as a future repertoire state and should be replaced by preference votes.

The future model should preserve the conceptual behavior that when a prepared song or melody is used in completed service history, it becomes already sounded: `připravená → hraná`. The precise representation of this state or historical signal remains a later schema-design question.

Repertoire belongs to an organist and a concrete song identity, but candidate eligibility can spread through melody-equivalence classes. A candidate song may be eligible because its melody-equivalence class contains at least one song explicitly present in the selected/default organist's repertoire. The explicit repertoire song must remain visible for display behavior even when it is not the same concrete song as the candidate.

Repertoire should remain separate from stable song metadata and separate from preference votes.

## 8. Preference votes

Preferences belong to concrete songs, not melody-equivalence classes. A vote for `(Czech, 28)` does not automatically transfer to `(Polish, 613)` even if the two songs share a melody.

Preference votes are separate from stable song metadata. Aggregated preference scores may be displayed and used by candidate filtering, but those aggregates are derived from preference votes and should not be treated as catalog facts.

Accepted role-weighted scoring is:

- priest: `0–3`;
- organist: `0–2`;
- congregation member: `0–1`;
- admin: no own preference.

The logical persistence model should be able to distinguish the actor or role source of a preference, the concrete song identity, and the score. It should also support admin-managed congregation preferences without giving admin an own preference vote.

Legacy `VarhaniciPisne.Stav = doporučená` should not become a future repertoire state. If legacy recommendation knowledge is retained after validation, it should be transformed into preference-vote knowledge only through an accepted product/domain decision.

## 9. Services, service sets, and service rows

The primary planning artifact is a concrete ordered service set for one service. The standard case has four song slots, but target persistence must support flexible rows rather than reproduce the old fixed four-song legacy structure.

A logical service context may include planning facts such as:

- service date;
- service language;
- informational service time;
- priest reference;
- organist reference;
- manually entered antiphon number;
- manually selected liturgical season;
- preference threshold or other planning context when accepted later.

A service set may exist as a working set or a final set while it is non-completed. Its rows are ordered and flexible:

- a row may contain a concrete song identity;
- a row may represent an instrumental contribution, external choir contribution, another free-form item, or another non-song note;
- a row without a song must contain textual note content;
- rows can be added, removed, and reordered while a working set is editable.

Lifecycle states are domain states, not legacy slot structures:

```text
no set exists → working set → final set → completed-service record
```

Direct finalization from no set to final set is also possible when required information is present and the actor is authorized. A final set is not directly edited; if it must change, it is deleted and recreated. Deleting a saved working or final set returns the service to `no set exists`.

## 10. Completed-service records and history

Completed-service records are historical. They are not non-completed plans and should not be treated as editable working or final sets.

The logical persistence model must preserve enough completed-service history to support:

- historical service context;
- ordered historical rows;
- concrete song identities used in those rows;
- ignoring non-song rows for melody non-repetition checks;
- backward non-repetition checks against completed-service records within the configured period before a planned service date;
- conceptual repertoire behavior where use in completed history can turn prepared repertoire into already sounded repertoire.

Legacy `Bohosluzby` and `BohosluzbyPisne` may inform completed-service history if their rows are validated as historical. The legacy fixed four-song representation must not become the target model. Historical records should preserve what happened while still fitting the flexible service-row concept.

Completed-service records are also distinct from saved future working/final sets. Completed history supplies backward non-repetition input; saved future non-completed plans supply forward protection and conflict context.

## 11. People, roles, and actor references

The accepted roles are:

- priest;
- organist;
- admin;
- congregation member.

A real person can hold multiple roles. Future persistence therefore needs logical support for people or actor references and role assignments without assuming one role equals one person or one authenticated account.

Legacy `Kazatele` and `Varhanici` may inform priest/preacher and organist person references, historical names, or role references. They must not be assumed to equal authenticated users. The authentication and account model remains unresolved.

The target model should be able to reference actors in planning, repertoire, preferences, and permissions while leaving the following for later design:

- whether a person record is separate from an account;
- how login identity maps to person or actor identity;
- whether historical service records preserve names, references, or both;
- how multiple roles are assigned and changed over time.

## 12. Antiphon and liturgical-season knowledge

Antiphon and liturgical-season knowledge belongs to shared contextual mappings, not to hard candidate eligibility.

The target model should support:

- antiphon mappings from `(language, antiphon number)` to a concrete song identity for highlighting;
- liturgical-season mappings from `(language, liturgical season)` to concrete songs for highlighting;
- manual antiphon number entry on service planning context;
- manual liturgical-season selection on service planning context, including none/empty.

Antiphon and liturgical season are applied after hard filters. They should highlight candidates that are already eligible; they must not restore candidates removed by repertoire, service language, melody non-repetition, or preference-threshold filters.

Legacy `CeskaTemata` may inform future themes, tags, or contextual knowledge, but its exact target meaning remains open and requires domain review.

## 13. Candidate-selection readiness

This document does not design the full candidate engine. It identifies the persisted logical concepts the engine will need later.

Future candidate selection should be able to use:

- selected/default organist references from service planning context;
- explicit organist repertoire entries;
- concrete song identities and service language;
- melody-equivalence classes or derivable class membership;
- preference votes and derived aggregate scores;
- completed-service records for backward non-repetition checks;
- saved future working/final sets for forward non-repetition checks;
- ordered rows containing concrete songs, with non-song rows ignored for repetition checks;
- antiphon mappings and liturgical-season mappings for highlighting after hard filters;
- configurable melody non-repetition period.

The persistence model must therefore avoid designs that only store individual song numbers, only store four fixed service-song positions, or make melody equivalence unavailable at class level.

## 14. Legacy mapping implications

The legacy database should inform target persistence as source knowledge, not as target architecture.

Key implications:

- `CeskePisne` and `PolskePisne` inform a unified canonical song catalog and same-language melody edges; they should not force separate future Czech-song and Polish-song domain entities.
- `CeskePolskePisne` informs cross-language melody-equivalence edges; it should not create a combined Czech/Polish song identity.
- `VarhaniciPisne` informs organist repertoire; `doporučená` should be replaced by preference votes rather than migrated as a repertoire state.
- `Bohosluzby` and `BohosluzbyPisne` may inform service context and completed-service history, but the fixed four-song structure should become flexible ordered rows.
- `Kazatele` and `Varhanici` may inform people or role references, but they are not automatically authenticated users.
- `KazatelePisne` has no intended role in the future system unless a later accepted decision changes that direction.
- `CeskaTemata` requires later interpretation before it becomes catalog metadata, tags, highlighting knowledge, or another concept.

No 1:1 migration from the legacy SQL Server tables should be assumed. Any future import or transformation should pass through accepted domain concepts and validation rules.

## 15. Open persistence questions

The following questions remain unresolved and should be answered before final technical schema design:

- Which storage technology and persistence style will be used?
- Will melody equivalence be represented primarily as stored links with derived classes, materialized class membership, or a hybrid?
- What final song metadata belongs in the canonical catalog?
- How should repertoire `připravená` and `hraná` be represented: as current state, derived history, audit-like fact, or another concept?
- How should legacy `doporučená` data, if retained at all, be transformed into preference votes without inventing unsupported voter identity?
- How should people, accounts, authenticated users, and role assignments relate?
- How much historical attribution or audit/change history is required?
- How should legacy service records be classified when it is unclear whether they are completed history, future plans, or mixed records?
- How should non-repetition period configuration be persisted and validated against saved non-completed plans?
- How should `CeskaTemata` and possible future themes/tags relate to song metadata or contextual highlighting?

## 16. What this enables for later technical schema design

This model provides a domain-aligned target for later schema design by clarifying that future persistence should support:

- unified song identity by `(language, number)`;
- a canonical Czech and Polish song catalog;
- melody-equivalence knowledge usable at class level;
- organist-specific repertoire and prepared/already-sounded meaning;
- role-weighted preference votes on concrete songs;
- flexible service sets and ordered rows rather than fixed legacy slots;
- completed-service history distinct from non-completed plans;
- people and role references without prematurely deciding authentication;
- antiphon and liturgical-season mappings as post-filter highlighting knowledge;
- candidate-selection inputs for future repertoire, language, non-repetition, preference, and highlighting behavior.

The next technical design step can use this document to compare concrete storage options and schema shapes. That later step should still make an explicit decision and should not treat this document as an accepted physical schema.
