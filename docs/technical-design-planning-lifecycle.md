# Technical Design: Planning Lifecycle First

## Purpose and Scope

This document bridges the accepted product/domain documentation and later implementation for the selected first implementation slice: **Planning Lifecycle First**.

The first slice is intentionally narrow. It covers the manual lifecycle for one concrete ordered service set for one service in the current scope of **one local congregation**. It supports creating and editing working sets, saving final sets, deleting saved working or final sets back to `no set exists`, and manually converting final sets into completed-service records.

Automatic final-set completion remains open. This design allows later automatic completion, but does not define its timing, trigger, safeguards, or implementation behavior.

This document is not an implementation plan. It does not define tickets, database schema, migrations, API endpoints, UI components, tests, deployment, or framework choices.

## Source Documents

This design depends on the accepted repository documentation:

- `docs/product-vision.md`
- `docs/domain-analysis.md`
- `docs/domain-model.md`
- `docs/decisions.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/backlog.md`
- `docs/implementation-preparation.md`

If this document conflicts with those sources, the underlying source document should be clarified before implementation begins.

## Observed Repository Baseline

Repository inspection found a documentation-first baseline:

- The repository currently contains collaboration guidance, a README, and planning/product/domain documentation under `docs/`.
- No `package.json` is present.
- No framework configuration files were found.
- No existing application source folder was found.
- No existing database, migration, ORM, or storage configuration was found.
- No clear stack, storage, authentication, authorization, test, deployment, frontend, or backend setup is present in the repository.

Therefore, later implementation must not assume a selected technology stack or persistence/authentication approach based on the current repository contents.

## In-Scope Behavior

### Planning Artifact

The first slice centers on one **service set** for one **service**. A service set is a concrete ordered list of rows.

Rows are flexible:

- Rows may be added, removed, and reordered.
- A row may contain a concrete song reference.
- A row may omit a song only if it contains a textual note.
- The standard planning case may start with four song slots, but the design must not restrict the service set to exactly four rows.

### Row Content

A service row may be one of these conceptual forms:

1. **Song row** — contains a concrete song reference as `(language, number)`.
2. **Non-song row** — contains no song and therefore must contain textual note content describing the instrumental, choir, free-form, external contribution, or other non-song item.

### Lifecycle States

The first slice recognizes exactly these service planning states:

1. `no set exists`
2. `working set`
3. `final set`
4. `completed-service record`

A final set is not directly edited. If a final set must change, an authorized role deletes the final set, returning the service to `no set exists`, and then creates a replacement set through the normal lifecycle.

### Supported Manual Actions

Later implementation must support these product actions:

- Create a working set from `no set exists`.
- Edit an existing working set.
- Save a working set.
- Save a final set from a valid working set.
- Save a final set directly from `no set exists` when required information is present and the actor is authorized.
- Delete a saved working set and return the service to `no set exists`.
- Delete a saved final set and return the service to `no set exists`.
- Manually convert a final set to a completed-service record.

## Explicitly Out of Scope

The first slice does not include:

- full candidate selection engine;
- melody non-repetition engine;
- antiphon highlighting;
- liturgical-season highlighting;
- full preference system;
- legacy migration;
- multi-congregation support;
- automatic final-set completion details;
- final database schema beyond what is needed to reason about the first slice;
- application code, migrations, tests, UI components, or API endpoints as part of this documentation change.

## Conceptual State Model

### Allowed States

| State | Meaning |
| --- | --- |
| `no set exists` | No saved working or final set exists for the service. |
| `working set` | A saved non-final service set exists and can be edited by authorized roles. |
| `final set` | A saved final plan exists and is protected from direct editing. |
| `completed-service record` | Historical record created from a final set after the service. |

There is no separate deleted or cancelled state. Deleting a saved working or final set returns the service to `no set exists`.

### Allowed Transitions

| Transition | Required role boundary |
| --- | --- |
| `no set exists` → `working set` | Priest, organist, or admin may create a working set. |
| `working set` → `working set` | Priest, organist, or admin may edit and save the working set. |
| `working set` → `final set` | Priest or admin may save the final set. |
| `no set exists` → `final set` | Priest or admin may save a final set directly when required data is present. |
| `working set` → `no set exists` | Priest, organist, or admin may delete the working set. |
| `final set` → `no set exists` | Priest or admin may delete the final set. |
| `final set` → `completed-service record` | Priest or admin may manually complete the final set. |

### Blocked Transitions

| Blocked transition or action | Reason |
| --- | --- |
| Direct edit of `final set` | Final sets are protected; changes require deletion and recreation. |
| `completed-service record` → `working set` | A completed-service record is historical, not a non-completed plan. |
| `completed-service record` → `final set` | Historical records are not reopened as active final plans in this slice. |
| Delete `completed-service record` through planning lifecycle delete | Delete behavior in this slice applies only to saved non-completed working/final sets. |
| Create/edit/delete planning sets by congregation member | Congregation members have no planning lifecycle permissions. |
| Organist save/delete/complete final set | Finalization and completion are priest/admin responsibilities. |
| Automatic `final set` → `completed-service record` | Automatic completion remains open and is not designed in this slice. |

## Minimal Domain Objects for This Slice

This section describes conceptual information needed by the first slice. It is not a database schema.

### Service

A service represents the planned liturgical event for which one service set may exist. The first slice needs these conceptual fields:

- service date;
- service language;
- service time as informational only;
- priest reference;
- organist reference;
- antiphon number as a stored/manual field, not used for filtering in this slice;
- liturgical season as a stored/manual field, not used for filtering in this slice.

### Service Set

A service set is the ordered plan associated with one service. The first slice needs to preserve:

- association to one service;
- lifecycle state meaning: working, final, or completed historical record;
- ordered rows;
- enough metadata to distinguish an active non-completed plan from a completed-service record.

### Service Row

A service row is an ordered row in a service set. The first slice needs to preserve:

- row order;
- optional concrete song reference;
- textual note when no song is present.

### Concrete Song Reference

When a row contains a song, the row references the song as:

```text
(language, number)
```

This preserves the accepted rule that a number alone is not a valid song identity.

### Person References

The first slice needs priest and organist references for the service context. This document does not decide whether those references are users, profiles, free-standing people records, or another technical representation.

## Validation Rules

Later implementation must enforce these behavior rules at the domain/application boundary, not only through UI affordances:

- A row without a song must contain textual note content before the set can be saved or finalized.
- A final set cannot be edited directly.
- Deleting a saved working set returns the service to `no set exists`.
- Deleting a saved final set returns the service to `no set exists`.
- A completed-service record is historical.
- A completed-service record is not a non-completed plan.
- Completed-service records are not judged as conflicts in this slice.
- Service time is informational only and must not drive lifecycle behavior in this slice.
- Antiphon number and liturgical season may be stored/manual context fields, but must not drive filtering in this slice.

## Permission Boundaries

Current roles are:

- priest;
- organist;
- admin;
- congregation member.

Planning lifecycle permissions for this slice are:

| Action | Priest | Organist | Admin | Congregation member |
| --- | --- | --- | --- | --- |
| Create working set | yes | yes | yes | no |
| Edit working set | yes | yes | yes | no |
| Delete working set | yes | yes | yes | no |
| Save final set | yes | no | yes | no |
| Delete final set | yes | no | yes | no |
| Manually convert final set to completed-service record | yes | no | yes | no |
| Directly edit final set | no | no | no | no |

Permission enforcement is a technical decision still to be made, but the accepted role boundaries must be preserved regardless of UI design.

## Storage Design Boundary

This document does not create a final database schema.

For the first slice, storage must conceptually preserve enough information to reconstruct:

- a service and its date, language, informational time, priest reference, organist reference, antiphon number, and liturgical season;
- whether the service currently has no set, a working set, a final set, or a completed-service record;
- ordered service rows;
- row song references as `(language, number)` when present;
- required textual notes for rows without songs;
- completed-service records as historical records separate from active non-completed plans.

Open storage decisions before implementation include:

- Which persistence technology will be used?
- Whether service, service set, and completed-service record are represented as separate technical records or through another structure.
- How lifecycle state is represented without introducing deleted/cancelled states.
- How deletion of working/final sets preserves the accepted return to `no set exists`.
- How completed-service records are preserved historically and protected from active-plan behavior.
- How priest and organist references relate to authentication/user records.
- Whether minimal song references can be stored before a full song catalog exists, and what validation is possible in that interim state.

## API/UI Boundary

This document does not design endpoints, route structures, request/response shapes, screens, or components.

Later implementation must support product actions for:

- opening planning for a service and recognizing the current lifecycle state;
- creating a working set;
- editing and saving a working set;
- saving a final set from either `working set` or `no set exists` when valid and authorized;
- deleting a working set;
- deleting a final set;
- manually converting a final set to a completed-service record;
- showing enough lifecycle state and validation feedback for users to understand why an action is available or blocked.

UI and API design must preserve that final sets are not directly edited and congregation members have no planning lifecycle actions.

## Test Strategy Boundary

No tests are created by this document.

Later tests should cover high-level behavior including:

- allowed lifecycle transitions;
- blocked lifecycle transitions;
- role restrictions for each transition;
- row validation for non-song rows;
- direct final-set editing being unavailable/blocked;
- deleting working/final sets returning to `no set exists`;
- manual conversion from final set to completed-service record;
- completed-service records being historical and not treated as non-completed plans or conflicts in this slice;
- antiphon number, liturgical season, and service time not driving filtering or lifecycle behavior in this slice.

The test framework, test layers, fixtures, and acceptance-test format remain undecided.

## Open Technical Decisions Before Coding

Before coding this slice, the project should decide:

1. **Storage approach** — persistence technology and storage style.
2. **Authorization enforcement approach** — how roles are assigned and enforced in application/domain behavior.
3. **Repository stack sufficiency** — whether the current documentation-only repository should be extended with a selected app framework or whether a separate setup decision is needed first.
4. **Lifecycle state representation** — how to represent `no set exists`, `working set`, `final set`, and `completed-service record` technically without introducing deleted/cancelled states.
5. **Historical preservation** — how completed-service records are protected from active-plan mutation and preserved for future planning knowledge.
6. **Song catalog support for first slice** — how much song catalog validation is needed for rows containing `(language, number)` before the full knowledge foundation is implemented.
7. **Person/user representation** — how priest and organist references relate to authentication, authorization, and local congregation data.
8. **Automatic completion deferral** — how the manual completion implementation should avoid blocking or pre-deciding later automatic completion behavior.

## Recommended Next Step

Recommended next step: create a small ADR covering stack, storage, and authentication/authorization decisions for the Planning Lifecycle First slice.

After that ADR is accepted, a first implementation plan can be derived from this technical design without expanding into candidate selection, migrations, automatic completion, or multi-congregation support.
