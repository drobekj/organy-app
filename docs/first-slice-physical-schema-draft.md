# First-Slice Physical Schema Draft

## 1. Purpose

This document drafts a first-slice physical relational schema shape for **Planning Lifecycle First** using the accepted PostgreSQL-like relational storage direction.

It is a documentation-only draft. It uses relational table, field, constraint, and index language to clarify likely storage structure, but it is not SQL DDL, not Prisma syntax, not a migration, and not authorization or implementation design.

The draft focuses on the minimum schema candidates needed to distinguish:

- no saved non-completed set;
- working set;
- final set;
- completed-service historical record.

## 2. Non-goals

This document does not:

- create SQL, database schema files, migrations, Prisma schema, tests, UI components, API endpoints, or application code;
- select Prisma, an ORM, a query layer, a migration tool, a database provider, a hosting provider, an auth provider, or an account implementation;
- imply that coding can start;
- design the full candidate-selection engine, canonical song catalog import, melody equivalence, repertoire management, preference system, antiphon highlighting, liturgical-season highlighting, non-repetition engine, full audit history, or multi-congregation tenancy;
- make the legacy SQL Server `VarhanniDoprovody` database the runtime storage model.

## 3. Inputs

Primary inputs:

- `docs/adr-first-slice-storage.md`
- `docs/planning-lifecycle-first-schema-subset.md`
- `docs/first-slice-storage-decision-preparation.md`
- `docs/target-technical-schema-draft.md`
- `docs/target-domain-persistence-model.md`
- `docs/auth-account-role-model.md`
- `docs/deployment-assumptions.md`
- `docs/legacy-to-domain-mapping.md`
- `docs/adr-planning-lifecycle-stack-storage-auth.md`
- `docs/implementation-preparation.md`
- `docs/architecture.md`
- `docs/backlog.md`
- `docs/technical-design-planning-lifecycle.md`
- `docs/domain-model.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/decisions.md`

## 4. Accepted storage direction

The accepted first-slice runtime storage direction is PostgreSQL-like relational storage for a single hosted web app serving one congregation.

This direction is accepted only at the storage-direction level. Physical schema, schema files, migration approach, ORM/query tooling, concrete database provider, hosting provider, auth provider, and account model remain unresolved.

## 5. First-slice schema scope

The first-slice schema candidates cover only:

- minimal people, actor, and role representation;
- minimal service context;
- saved non-completed working/final service set;
- ordered flexible service rows;
- completed-service historical record;
- ordered completed-service rows;
- minimal song references by `(language, number)`.

## 6. Proposed relational tables

Candidate tables:

1. `persons`
2. `actors`
3. `role_assignments`
4. `service_contexts`
5. `service_sets`
6. `service_set_rows`
7. `completed_service_records`
8. `completed_service_rows`

The names are draft physical table candidates for discussion only.

## 7. Table draft: `persons`

Purpose: represents real-world people such as priests, organists, admins, and congregation members. A person must not be assumed to have a login account.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the person. | Exact id strategy is unresolved. |
| display_name | Yes | short text | Human-readable person name. | May need later naming structure, but first slice keeps one display name. |
| notes | No | text | Optional administrative notes. | Not intended for sensitive authentication data. |
| is_active | Yes | boolean | Indicates whether the person remains active for selection/use. | Deactivation behavior is not fully designed. |
| created_at | Yes | timestamp | Records when the person row was created. | Exact timestamp strategy is unresolved. |
| updated_at | Yes | timestamp | Records when the person row was last updated. | Exact timestamp strategy is unresolved. |

## 8. Table draft: `actors`

Purpose: represents the current acting identity for permission checks. The auth provider and account model remain unresolved.

First-slice simplification: an actor may reference a person, but this draft does not assume actor and person are always identical in future designs.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the actor used in permission checks and attribution. | Exact id strategy is unresolved. |
| person_id | No | nullable reference | Links the actor to a real-world person when known. | Does not design login accounts or auth-provider identities. |
| display_name | Yes | short text | Human-readable actor label. | May duplicate or differ from person display name in future cases. |
| is_active | Yes | boolean | Indicates whether the actor can currently be used for app actions. | Relationship to provider account status is deferred. |
| created_at | Yes | timestamp | Records when the actor row was created. | Exact timestamp strategy is unresolved. |
| updated_at | Yes | timestamp | Records when the actor row was last updated. | Exact timestamp strategy is unresolved. |

## 9. Table draft: `role_assignments`

Purpose: stores role-bearing capability for actor-based permission checks.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the role assignment. | Exact id strategy is unresolved. |
| actor_id | Yes | required reference | References the actor receiving the role. | Active assignments drive permission checks. |
| role | Yes | enum / controlled value | Assigned role. | Candidate values: `priest`, `organist`, `admin`, `congregation_member`. |
| is_active | Yes | boolean | Indicates whether the role assignment currently grants capability. | Historical role changes beyond this flag are deferred. |
| created_at | Yes | timestamp | Records when the assignment was created. | Exact timestamp strategy is unresolved. |
| updated_at | Yes | timestamp | Records when the assignment was last updated. | Exact timestamp strategy is unresolved. |

Multiple active or inactive role assignments may exist for one actor, and planning permissions must be checked from active role assignments. UI hiding is not sufficient authorization.

## 10. Table draft: `service_contexts`

Purpose: represents one planned service occurrence. A service context may exist without a saved non-completed set.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the service context. | Exact id strategy is unresolved. |
| service_date | Yes | date | Date of the planned service occurrence. | Used for date-based lookup and lifecycle context. |
| service_language | Yes | enum / controlled value | Service language context. | Must support Czech, Polish, and Mixed. |
| informational_time | No | informational time | Optional service time shown as information. | Informational only; no scheduling logic is implied. |
| priest_person_id | No | nullable reference | Optional priest person for the service. | Person may not have login/account. |
| organist_person_id | No | nullable reference | Optional organist person for the service. | Person may not have login/account. |
| antiphon_number | No | short text | Manually entered antiphon number. | Empty is allowed; no derivation from date. |
| liturgical_season | No | enum / controlled value | Manually selected liturgical season. | Empty is allowed; no derivation from antiphon or date. |
| note | No | text | Optional service-context note. | Does not replace ordered service rows. |
| created_at | Yes | timestamp | Records when the context was created. | Exact timestamp strategy is unresolved. |
| updated_at | Yes | timestamp | Records when the context was last updated. | Exact timestamp strategy is unresolved. |

## 11. Table draft: `service_sets`

Purpose: represents the saved non-completed working/final plan for one service context.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the saved non-completed service set. | Exact id strategy is unresolved. |
| service_context_id | Yes | required reference | References the service context being planned. | There should be at most one saved non-completed set per service context. |
| status | Yes | enum / controlled value | Non-completed set status. | Candidate values: `working`, `final`; no `deleted` status. |
| created_by_actor_id | Yes | required reference | Actor who created the saved set. | Account/provider design remains deferred. |
| updated_by_actor_id | No | nullable reference | Actor who last updated the saved set. | Full audit/change history is deferred. |
| finalized_by_actor_id | No | nullable reference | Actor who finalized the set. | Required only when status is `final`, subject to final constraint design. |
| created_at | Yes | timestamp | Records when the set was created. | Exact timestamp strategy is unresolved. |
| updated_at | Yes | timestamp | Records when the set was last updated. | Exact timestamp strategy is unresolved. |
| finalized_at | No | timestamp | Records when the set became final. | Required only when status is `final`, subject to final constraint design. |

Final sets are not directly edited. Deleting a saved working/final set removes the non-completed set and returns the service context to `no set exists`.

## 12. Table draft: `service_set_rows`

Purpose: ordered flexible rows for a working/final service set.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the service-set row. | Exact id strategy is unresolved. |
| service_set_id | Yes | required reference | References the parent service set. | Rows are part of a saved non-completed plan. |
| row_order | Yes | integer order | Determines row order within the parent set. | Must be stable enough for reorder operations. |
| song_language | No | enum / controlled value | Language part of minimal song reference. | Required when `song_number` is present. |
| song_number | No | short text | Number part of minimal song reference. | Required when `song_language` is present. |
| note | No | text | Optional row note or standalone textual row content. | Required when no song reference is present. |
| created_at | Yes | timestamp | Records when the row was created. | Exact timestamp strategy is unresolved. |
| updated_at | Yes | timestamp | Records when the row was last updated. | Exact timestamp strategy is unresolved. |

Rows are not fixed to four song slots. Each row must contain at least one content value: a complete song reference, textual note, or both. A row without a complete song reference requires a textual note; the rule is not exclusive either/or.

## 13. Table draft: `completed_service_records`

Purpose: historical record created by manual conversion from a final set.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the completed-service record. | Exact id strategy is unresolved. |
| service_context_id | Yes | required reference | References the completed service context. | Relationship to any remaining non-completed set needs clarification. |
| source_service_set_id | No | nullable reference | References the final service set used as completion source. | Open question: should this remain after deleting or archiving the original service set? |
| completed_by_actor_id | Yes | required reference | Actor who manually completed the service. | Automatic completion is deferred for this schema draft. |
| completed_at | Yes | timestamp | Records when completion occurred. | Exact timestamp strategy is unresolved. |
| created_at | Yes | timestamp | Records when the historical record was created. | May be the same moment as `completed_at`; exact strategy is unresolved. |

A completed-service record is historical, not a non-completed plan, and is not reopened through the first-slice planning lifecycle.

## 14. Table draft: `completed_service_rows`

Purpose: ordered historical rows copied or preserved at completion time.

| Field | Required? | Draft type category | Meaning | Notes / unresolved issues |
| --- | --- | --- | --- | --- |
| id | Yes | stable identifier | Identifies the completed-service row. | Exact id strategy is unresolved. |
| completed_service_record_id | Yes | required reference | References the parent completed-service record. | Rows are historical content. |
| row_order | Yes | integer order | Preserved row order at completion time. | Later reorder of non-completed rows must not alter history. |
| song_language | No | enum / controlled value | Language part of preserved minimal song reference. | Required when `song_number` is present. |
| song_number | No | short text | Number part of preserved minimal song reference. | Required when `song_language` is present. |
| note | No | text | Preserved row note or standalone textual row content. | Required when no song reference is present. |
| created_at | Yes | timestamp | Records when the historical row was created. | Exact timestamp strategy is unresolved. |

Completed rows preserve historical row order, song reference, and note content. Each completed row must contain at least one content value: a complete song reference, textual note, or both. A completed row without a complete song reference requires a textual note; the rule is not exclusive either/or. Later backward non-repetition can use completed history, but that behavior is deferred.

## 15. Minimal song reference representation

The first slice represents a song reference inline as `(song_language, song_number)` on service rows and completed-service rows.

Candidate rules:

- number alone is not a valid song reference;
- language alone is not a valid song reference;
- `song_language` must support at least Czech and Polish song identity;
- Mixed is a service language, not necessarily a valid concrete song language;
- title, source hymnal, melody class, repertoire state, preference data, imported source evidence, and catalog metadata are deferred.

## 16. Candidate enums / controlled values

Candidate controlled values:

- `role`: `priest`, `organist`, `admin`, `congregation_member`.
- `service_language`: Czech, Polish, Mixed.
- `song_language`: Czech, Polish, with exact value names unresolved.
- `service_sets.status`: `working`, `final`.
- `liturgical_season`: manually selected controlled value or empty; exact list is unresolved.

These are draft value sets, not code constants or database enum selections.

## 17. Candidate constraints and invariants

Candidate constraints and invariants:

- A service context may have zero saved non-completed service sets.
- A service context should have at most one saved non-completed service set.
- Service set status is either `working` or `final`.
- There is no `deleted` service-set status.
- A final service set is not edited directly.
- Deleting a working/final set removes the saved non-completed set and returns the service context to `no set exists`.
- A completed-service record is historical and not a non-completed plan.
- Service rows and completed rows are ordered within their parent records.
- The design must not use fixed four-song slots.
- A service row or completed row contains at least one of a complete song reference or textual note.
- A service row or completed row may contain both a complete song reference and a note.
- A service row or completed row without a complete song reference requires a note.
- A song reference requires both language and number.
- A congregation member has no planning permissions.
- Active role assignments drive permission checks.

## 18. Candidate indexes and lookup needs

Candidate lookup needs:

- service contexts by `service_date`;
- service set by `service_context_id`;
- service-set rows by parent id and `row_order`;
- completed-service rows by parent id and `row_order`;
- completed records by `service_context_id`;
- role assignments by `actor_id` and `role`;
- optional lookup by `song_language` and `song_number` for future validation.

These are index candidates only; concrete index definitions and syntax are deferred.

## 19. Lifecycle transition implications

Schema-level lifecycle implications:

- `no set exists` means a `service_contexts` row may exist without a related `service_sets` row.
- Creating a working set creates a saved `service_sets` row with status `working` and ordered `service_set_rows` as needed.
- Editing applies to working sets; final sets are not directly edited.
- Finalizing changes the non-completed set to status `final` and records finalization attribution/timing.
- Deleting a working or final set removes the saved non-completed set rather than marking it deleted.
- Completing a final set creates a `completed_service_records` row and copied `completed_service_rows` for historical preservation.
- Completed records are not reopened as working/final sets in the first-slice lifecycle.

## 20. Authorization data implications

Authorization-relevant data is intentionally minimal:

- `actors` represent the acting identity for permission checks;
- `role_assignments` hold active role-bearing capability;
- multiple roles per actor are supported;
- planning write permissions must be evaluated from active role assignments, not from hidden UI controls;
- congregation members have direct access but no planning permissions;
- login accounts, auth-provider identities, sessions, and provider-specific claims are deferred.

## 21. Legacy SQL Server boundary

The legacy SQL Server `VarhanniDoprovody` database remains source, reference, and potential import evidence only. It is not runtime storage for this first slice.

This draft should be shaped from accepted target concepts rather than copied from legacy SQL Server tables. Any future import work must transform legacy meaning into the target model.

## 22. Explicitly deferred tables

Explicitly deferred tables include:

- canonical songs catalog;
- melody classes;
- melody class memberships;
- melody link evidence;
- repertoire entries;
- preference votes;
- antiphon mappings;
- liturgical season mappings;
- source/import reference tables;
- audit/change history tables beyond minimal actor/timestamp fields;
- login account/provider tables;
- multi-congregation tenancy tables.

## 23. Open schema questions

Open questions:

- What exact id strategy should be used?
- What exact timestamp strategy should be used?
- Are service contexts created lazily or explicitly?
- Should saved service contexts require priest and organist references, or may incomplete service contexts with nullable `priest_person_id` and `organist_person_id` be saved during draft/preparation? Later workflow and schema validation must decide.
- Should `source_service_set_id` remain after deleting or archiving the original service set?
- May a completed record and non-completed set coexist for the same service context?
- How much attribution is needed before full audit design?
- Can minimal song references be validated before a full song catalog exists?
- How will first-slice seed data be entered?
- How will the local development database be set up?
- How do backup, export, and restore expectations affect schema design?

## 24. What this draft enables next

This draft enables review of the first-slice relational storage shape before implementation decisions. It can support later decisions about physical schema details, tooling, local development workflow, provider selection, backup/export/restore design, and authorization/account design.

It does not authorize coding, schema-file creation, migrations, ORM/query selection, provider selection, or application implementation.
