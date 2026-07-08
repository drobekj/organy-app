# First-Slice Schema Open Questions Resolution

## 1. Purpose

This document resolves the main first-slice schema questions raised by `docs/first-slice-physical-schema-draft.md` at documentation and design level.

The goal is to reduce ambiguity before later physical schema, tooling, and ADR work. These resolutions clarify intended schema behavior, but they are not SQL, Prisma, migrations, schema files, implementation tasks, or permission to start coding.

## 2. Non-goals

This document does not:

- create application code, database schema files, migrations, Prisma schema, SQL, tests, UI components, or API endpoints;
- select Prisma, any ORM, a query layer, migration tooling, database provider, hosting provider, authentication provider, or local development workflow;
- create an implementation plan;
- mark the whole stack/storage/auth ADR as accepted;
- resolve backup/export/restore implementation details;
- change the accepted scope that PostgreSQL-like relational storage is only the first-slice runtime storage direction.

## 3. Inputs

Primary inputs:

- `docs/first-slice-physical-schema-draft.md`
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

## 4. Status of these resolutions

These are accepted first-slice schema design resolutions for documentation purposes.

They do not accept SQL, Prisma, ORM/query tooling, migrations, provider, hosting, auth provider, or implementation.

## 5. Resolution summary table

| Topic | Resolution | Still deferred |
| --- | --- | --- |
| ID strategy | Use opaque stable identifiers that do not encode business meaning and do not depend on legacy SQL Server IDs. | Exact physical representation. |
| Timestamp strategy | Store create/update/finalize/complete lifecycle timestamps as stable operational event metadata. | Timezone, database type, precision, and generation responsibility. |
| Service context creation | Derive unsaved default service context in UI/application; persist only on explicit save or completion. | Exact application flow and persistence implementation. |
| Priest and organist references | Require priest and organist for persisted contexts with saved sets or completed records at application/domain validation level. | Exact database constraint versus application validation split. |
| Completed versus non-completed coexistence | A completed-service record and active saved non-completed set should not coexist for the same service context. | Reopening or re-planning completed services. |
| `source_service_set_id` | Completed records are self-contained; source reference is optional trace only. | Whether the field is kept or omitted in final schema. |
| Attribution | Use minimal lifecycle actor and timestamp attribution fields. | Full audit log, restore history, diff history, and change review. |
| Song reference validation | Validate language plus non-empty number, with Czech/Polish as concrete song languages and Mixed only as service language. | Canonical catalog, melody, repertoire, preference, antiphon, and season validation. |
| Seed data | First slice needs minimal actors, persons, and roles for admin, priest, and organist use. | Seed/setup mechanism. |
| Local development database workflow | Remains unresolved. | Local service, containers, remote dev DB, fixtures, seeds, and reset workflow. |
| Backup/export/restore | Keep completed history self-contained enough for future export/restore. | Frequency, ownership, restore testing, export format, and data-loss window. |

## 6. ID strategy resolution

Use opaque stable identifiers as the design-level ID strategy for first-slice records.

IDs must not encode business meaning. IDs must not depend on legacy SQL Server IDs from `VarhanniDoprovody`. The exact physical representation remains deferred to later schema and tooling work.

Rationale:

- Keeps future import or refactoring from `VarhanniDoprovody` clean.
- Avoids coupling runtime identity to legacy table shape.

## 7. Timestamp strategy resolution

Store lifecycle timestamps as stable event timestamps for create, update, finalize, and complete operations.

Timestamp fields are operational metadata, not a full audit history. Exact timezone handling, database type, precision, and generation responsibility remain deferred.

Rationale:

- First slice needs attribution and timing for lifecycle events.
- Full audit and change history are explicitly deferred.

## 8. Service context creation resolution

The UI/application may derive an unsaved default service context when the app is opened.

A persisted `service_contexts` record is created explicitly when a user saves a working or final set, or creates a completed-service record. Unsaved defaults are not historical data.

Rationale:

- Preserves accepted defaulting behavior without polluting persistence with unused generated service contexts.

## 9. Priest and organist reference resolution

For a persisted service context that has a saved working/final set or completed-service record, priest and organist references should be required at application/domain validation level.

The physical draft may keep `priest_person_id` and `organist_person_id` nullable until final schema/tooling design decides whether the requirement is enforced by database constraint, application validation, or both.

Incomplete service context may exist only as unsaved UI/preparation state unless later explicitly allowed.

Rationale:

- Product-level planning context requires priest and organist.
- Keeping physical nullability open avoids premature database constraint design.

## 10. Completed record versus non-completed set coexistence

In the first-slice lifecycle, a completed-service record and a saved non-completed service set should not coexist as active planning states for the same service context.

Manual completion converts the final set into historical completed-service content. After completion, the completed record is the authoritative historical state for that service context. Reopening or re-planning a completed service is deferred.

Rationale:

- Keeps lifecycle states simple: no set exists, working, final, completed history.
- Avoids ambiguous current-versus-historical state.

## 11. `source_service_set_id` resolution

Completed-service records must be self-contained through copied completed rows.

`source_service_set_id` may remain as optional trace/reference only. Business behavior must not depend on dereferencing `source_service_set_id`.

If future deletion or archival behavior makes this reference unsafe, the field may be omitted or kept nullable in final schema design.

Rationale:

- Completed history must remain valid even if the non-completed source set is removed or archived.
- Avoids tying historical records to mutable planning records.

## 12. Attribution resolution

First slice uses minimal attribution fields:

- `created_by_actor_id`;
- `updated_by_actor_id`;
- `finalized_by_actor_id`;
- `completed_by_actor_id`;
- `created_at`;
- `updated_at`;
- `finalized_at`;
- `completed_at`.

Full audit log, restore history, diff history, and change review are deferred.

Rationale:

- Supports accountability for lifecycle operations without designing full audit history prematurely.

## 13. Minimal song reference validation resolution

First slice validates only:

- song reference must include both language and number;
- song language must be a valid concrete song language, Czech or Polish;
- service language may be Czech, Polish, or Mixed;
- Mixed is not a concrete song language;
- song number must be non-empty.

Existence validation against a full canonical song catalog is deferred. Melody-class, repertoire, preference, antiphon, and liturgical-season validation are deferred.

Rationale:

- Full catalog is out of scope.
- The first slice must still avoid invalid number-only song references.

## 14. First-slice seed data resolution

First slice needs minimal seed/setup data for:

- at least one admin actor;
- priest actor/person;
- organist actor/person;
- role assignments needed for manual testing and first real use.

Legacy SQL Server import is not required for first-slice seed data. Seed/setup mechanism remains unresolved.

Rationale:

- Planning lifecycle cannot be exercised without actors and roles.
- Avoids making legacy import a blocker.

## 15. Local development database workflow boundary

Local development workflow remains unresolved.

This document does not select local database service, container, remote development database, fixtures, seed scripts, or reset workflow.

Later tooling/local-dev decision must respect the accepted PostgreSQL-like storage direction and the physical schema draft.

## 16. Backup/export/restore schema implications

Backup/export/restore implementation remains unresolved.

The schema design should keep completed-service records self-contained enough to support future export/restore. Exact backup frequency, ownership, restore test, export format, and acceptable data-loss window remain deferred.

## 17. Impact on `docs/first-slice-physical-schema-draft.md`

`docs/first-slice-physical-schema-draft.md` should later be updated or interpreted according to these resolutions.

This task does not update that file.

## 18. Remaining unresolved questions

The following questions remain unresolved:

- exact physical ID representation;
- exact physical timestamp representation;
- concrete database provider;
- ORM/query layer;
- migration tooling;
- local development workflow;
- backup/export/restore implementation;
- auth provider/account model;
- exact enforcement location for priest/organist requirement;
- whether `source_service_set_id` is kept or omitted in final physical schema;
- exact seed/setup mechanism.

## 19. What this enables next

These resolutions allow later documentation and decision work to proceed with fewer schema ambiguities, especially updates to the physical schema draft and follow-up ADR/tooling discussions.

Next work should remain within the unresolved boundaries above unless a separate decision explicitly accepts physical schema, tooling, provider, hosting, auth, or implementation scope.
