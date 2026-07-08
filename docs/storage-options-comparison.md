# Storage Options Comparison

## 1. Purpose

This document compares preliminary storage directions for the future app at a product/architecture level. It is based on the logical target-domain persistence model, the legacy-to-domain mapping, and the current architecture and planning-lifecycle documents.

The comparison treats the legacy SQL Server / SSMS database `VarhanniDoprovody` as an important source of domain knowledge, not as the target architecture. The future persistence approach must support the refactored domain model: SongCatalog, MelodyEquivalence, Repertoire, PreferenceVotes, ServicePlanning, CompletedHistory, People/Roles, and KnowledgeMappings.

No storage option is selected here.

## 2. Non-goals

This document does not:

- choose SQLite, SQL Server, PostgreSQL, Prisma, or any other concrete technology;
- mark any ADR as accepted;
- create a database schema, migration, Prisma schema, SQL, API endpoint, UI component, application code, or test;
- define physical tables, indexes, constraints, or query plans;
- design the final technical schema;
- create a direct one-to-one migration from the legacy SQL Server schema;
- claim current product or library support without later verification against official documentation.

Prisma, if mentioned in later work, should be evaluated only as a possible ORM/query/migration layer, not as storage itself.

## 3. Inputs

Primary inputs:

- `docs/target-domain-persistence-model.md` — logical persistence areas and storage-neutral target concepts.
- `docs/target-technical-schema-draft.md` — storage-neutral draft candidate schema concepts for later evaluation, not an accepted physical schema.
- `docs/planning-lifecycle-first-schema-subset.md` — storage-neutral first-slice subset for future Planning Lifecycle First storage and schema evaluation.
- `docs/first-slice-storage-decision-preparation.md` — preparation input for future first-slice storage ADR work; it does not select storage.
- `docs/legacy-to-domain-mapping.md` — product/domain mapping from the legacy SQL Server database to accepted domain concepts.
- `docs/adr-planning-lifecycle-stack-storage-auth.md` — proposed decision boundary for stack, storage, and authentication/authorization.
- `docs/implementation-preparation.md` — readiness constraints and unresolved persistence decisions.
- `docs/architecture.md` — conceptual modules, data flow, legacy boundary, and persistence architecture note.
- `docs/backlog.md` — backlog item for comparing future storage options.
- `docs/technical-design-planning-lifecycle.md` — planning lifecycle storage boundary.
- `docs/domain-model.md`, `docs/requirements.md`, and `docs/workflows.md` — accepted domain behavior that storage must preserve.

Important input assumptions:

- The legacy source is SQL Server / SSMS database `VarhanniDoprovody`.
- The legacy schema is small and domain-specific, but not the target architecture.
- Direct one-to-one migration is inappropriate.
- The target-domain persistence model is logical only, not a physical schema.
- The target technical schema draft is an input for future storage comparisons, not a storage selection or accepted physical schema.
- Future storage comparisons should evaluate the first implementation slice against `docs/planning-lifecycle-first-schema-subset.md` and prepare first-slice storage choice through `docs/first-slice-storage-decision-preparation.md` without treating either document as a physical schema or storage selection.
- Storage technology remains unresolved.

## 4. Evaluation criteria

Each option is evaluated against these criteria:

- Fit with the target-domain persistence model.
- Fit with the storage-neutral target technical schema draft.
- Fit with a small domain-specific dataset.
- Local development simplicity.
- Deployment implications.
- Migration/refactoring implications from legacy SQL Server.
- Support for ordered service rows and lifecycle state.
- Support for melody-equivalence queries and class-level checks.
- Support for future candidate selection and non-repetition checks.
- Support for role-based preferences and People/Roles.
- Operational complexity.
- Backup, export, and recovery expectations.
- Risks and unknowns.

## 5. Option A — SQLite-like local relational storage

A SQLite-like direction means a lightweight local relational database embedded with, or close to, the app runtime. This option may be attractive if the future deployment remains small, local, and operationally simple.

### Fit with target-domain persistence model

A relational model can likely represent the target logical areas: songs, melody-equivalence evidence or memberships, repertoire entries, preference votes, planning sets, ordered rows, completed history, people/roles, and knowledge mappings. A later technical schema would still need to decide whether melody equivalence is stored as edges, materialized classes, or both.

### Fit with small domain-specific dataset

This direction appears well matched to a small single-congregation dataset. The expected data areas are structured, mostly relational, and modest in volume.

### Local development simplicity

Local setup could be simple because developers may not need to run a separate database server. This advantage must be verified later against the chosen runtime, framework, tooling, migration approach, backup process, and deployment target.

### Deployment implications

Deployment may be simple for a single-node app, but file placement, write permissions, concurrent access, backups, and hosting platform persistence rules would become important. This option may be less natural if the app later needs multi-instance web deployment, managed database operations, or remote collaboration.

### Migration/refactoring implications from legacy SQL Server

Legacy data would need an explicit import/refactoring path from SQL Server into the new target schema. The migration should transform meaning through the accepted domain model rather than copy legacy tables. SQL Server continuity would be lower than in Option B, but this may help avoid accidental preservation of legacy schema assumptions.

### Support for ordered service rows and lifecycle state

Ordered service rows and lifecycle state are straightforward relational concepts if the later schema models service context, set state, row order, concrete song references, and non-song notes explicitly.

### Support for melody-equivalence queries / class-level checks

Class-level checks are feasible, but the schema design matters. Materialized class membership may simplify candidate and non-repetition queries, while edge-derived classes may require application-managed connected-component logic or refreshed projections.

### Support for future candidate selection and non-repetition checks

Candidate filtering over catalog, repertoire, preferences, completed history, and saved future plans should be possible for a small dataset. The future design should prove that class-level non-repetition checks remain clear and reliable.

### Support for role-based preferences and people/roles

People, roles, own preferences, congregation preferences, and admin limitations can be represented relationally. Authorization behavior remains an application concern, not a storage decision alone.

### Operational complexity

Operational complexity may be low for one small deployment, but only if backup, restore, file locking, deployment persistence, and upgrade procedures are deliberately designed.

### Backup/export/recovery expectations

A local file-style database may make whole-database backup and export simple, but reliable backup timing, restore testing, and corruption/recovery expectations must be defined before acceptance.

### Risks and unknowns

- May not fit later multi-instance or hosted deployment assumptions.
- Backup and recovery can be deceptively easy unless procedures are tested.
- Concurrency and file persistence expectations depend on the eventual deployment platform.
- Current tooling/library support must be verified later against official documentation.

## 6. Option B — SQL Server-backed persistence

A SQL Server-backed direction means the future app uses SQL Server as its primary app database. This option has legacy continuity advantages, but those advantages must not be confused with acceptance of the legacy schema.

### Fit with target-domain persistence model

SQL Server can represent structured relational target concepts, but the future schema must be designed from the target-domain persistence model rather than copied from `VarhanniDoprovody`. The accepted model requires unified song identity, flexible service rows, explicit lifecycle states, class-level melody behavior, and clear People/Roles boundaries.

### Fit with small domain-specific dataset

The dataset appears small enough for SQL Server. The main question is not capacity, but whether operational overhead is justified for the app's scope and deployment environment.

### Local development simplicity

Local development may be heavier than a local embedded database because developers may need a SQL Server instance or container. This must be evaluated against the future team environment and official tooling support.

### Deployment implications

SQL Server may fit environments that already operate SQL Server. It may be less attractive if the app is deployed to a platform where SQL Server hosting is costly, unfamiliar, or operationally heavier than alternatives.

### Migration/refactoring implications from legacy SQL Server

This option has the strongest continuity with the legacy source, which may simplify extraction, validation, and operator familiarity. However, using the same database family could increase the risk of recreating legacy table shapes or weak constraints. The migration must remain refactoring-oriented, not one-to-one.

### Support for ordered service rows and lifecycle state

Relational representation of ordered rows, service context, working/final/completed state, and historical rows should be natural, assuming the future schema is designed around the accepted lifecycle rather than the old fixed-slot structure.

### Support for melody-equivalence queries / class-level checks

SQL Server can support class membership or edge-based representations. The later schema must make melody-equivalence class checks reliable for repertoire eligibility, candidate display, completed-history checks, and future-plan conflict checks.

### Support for future candidate selection and non-repetition checks

The candidate-selection workload is relational and should be technically feasible. The decisive design question is how to model or project melody-equivalence classes so non-repetition checks are easy to reason about and test.

### Support for role-based preferences and people/roles

Relational storage can represent role-scoped preferences, admin-managed congregation preferences, and person references. Authentication and authorization integration remain separate architecture decisions.

### Operational complexity

Operational complexity may be higher than embedded/local options because the app would depend on a managed or self-hosted database service, maintenance procedures, backups, access configuration, and environment setup.

### Backup/export/recovery expectations

SQL Server has mature backup/export patterns, but the project must define who operates them, where backups live, how restores are tested, and whether the expected deployment can support those procedures.

### Risks and unknowns

- Risk of choosing SQL Server merely because the old database used SQL Server.
- Risk of accidental legacy-schema preservation.
- Operational burden may be disproportionate for one local congregation.
- Current hosting, driver, ORM, and migration support must be verified later against official documentation.

## 7. Option C — PostgreSQL-like relational storage

A PostgreSQL-like direction means using a server-based open relational database commonly associated with modern web deployment patterns. This option may be attractive for standard web application hosting, but it is not accepted here.

### Fit with target-domain persistence model

A relational target schema can likely represent all logical data areas. As with other relational options, the key design decision is how to model melody-equivalence knowledge and lifecycle/history without copying legacy structures.

### Fit with small domain-specific dataset

The dataset is likely small enough that PostgreSQL-like storage would be more than sufficient. The question is whether its deployment and operations model matches the app's actual expected use.

### Local development simplicity

Local development may require a running database service or container. This is common, but not as minimal as a single local file. Future claims about framework, ORM, migration, and hosting convenience need verification against official documentation.

### Deployment implications

This direction may align with common web deployment and managed database patterns. It may be less appropriate if the future app is intentionally local-only or if the maintainers prefer file-based backup and minimal infrastructure.

### Migration/refactoring implications from legacy SQL Server

Migrating from legacy SQL Server would require cross-database extraction and transformation. This reinforces the correct architectural posture: preserve domain meaning, not legacy table shape. It may add import tooling work compared with SQL Server continuity.

### Support for ordered service rows and lifecycle state

Ordered rows, flexible row content, service-set state, and completed historical records are natural relational modeling problems and should be feasible after technical schema design.

### Support for melody-equivalence queries / class-level checks

Class membership or edge-derived equivalence can be represented. The schema should support efficient enough class-level lookups for repertoire filtering, candidate display, backward history checks, and forward saved-plan checks.

### Support for future candidate selection and non-repetition checks

Candidate selection combines relational concepts: songs, class membership, repertoire, preferences, service language, mappings, history, and saved future plans. The later design must demonstrate readable queries or application services for this flow.

### Support for role-based preferences and people/roles

Role-specific preferences, person references, and role responsibilities are compatible with relational modeling. As with all options, storage does not replace authorization design.

### Operational complexity

Operational complexity is moderate: the project would need database provisioning, migrations, backup/restore, environment variables/secrets, and local development conventions.

### Backup/export/recovery expectations

Managed or self-hosted backup/export/recovery procedures would need to be selected and documented. Recovery expectations should be proven before production use.

### Risks and unknowns

- May add unnecessary infrastructure if the app remains local and very small.
- Migration from legacy SQL Server needs explicit import/refactoring tooling.
- Current managed-hosting, driver, ORM, and migration support must be verified later against official documentation.

## 8. Option D — Other relational storage option

This placeholder covers another relational database option if later deployment, licensing, hosting, team familiarity, or operational constraints justify evaluating one.

### Fit with target-domain persistence model

Any other relational option should be judged by whether it can cleanly represent the same target logical areas without forcing legacy table shapes or weakening accepted domain rules.

### Fit with small domain-specific dataset

The small dataset may make many relational options technically viable. Viability alone is not enough; the option must improve deployment, operations, cost, reliability, or maintainability compared with Options A through C.

### Local development simplicity

Local development may range from very simple to server-dependent. This must be evaluated concretely only after a specific candidate is named.

### Deployment implications

Deployment implications are unknown until a concrete option is proposed. Any later proposal should explain hosting availability, persistence guarantees, backup facilities, maintenance needs, and fit with the app's expected operating environment.

### Migration/refactoring implications from legacy SQL Server

As with PostgreSQL-like storage, a non-SQL-Server option requires explicit extraction and transformation from the legacy database into a refactored target schema.

### Support for ordered service rows and lifecycle state

The option must support ordered child rows, service lifecycle state, saved future plans, completed history, and deletion/recreation behavior for final sets.

### Support for melody-equivalence queries / class-level checks

The option must support reliable equivalence-class membership or derivation. If this is awkward, it should not be accepted without a strong compensating reason.

### Support for future candidate selection and non-repetition checks

The option must support candidate-selection queries across catalog, repertoire, preferences, mappings, completed history, and saved future plans. It should not require a disproportionate amount of application-side workaround for basic relational relationships.

### Support for role-based preferences and people/roles

The option must support people/role references and role-scoped preference data clearly enough for future authorization and preference behavior.

### Operational complexity

Unknown until a concrete option is named. Any later evaluation should compare operational burden directly against SQLite-like, SQL Server-backed, and PostgreSQL-like directions.

### Backup/export/recovery expectations

Unknown until a concrete option is named. Later evaluation must define export format, backup frequency, restore procedure, and ownership.

### Risks and unknowns

- Could expand the decision space without a clear need.
- May have weaker ecosystem fit for the eventual app stack.
- Must not be accepted without official-documentation verification of current support, hosting, tooling, and maintenance expectations.

## 9. Option E — Legacy SQL Server as import/reference source only

This direction treats `VarhanniDoprovody` as a legacy source used for import, validation, and reference while the future app uses a separate app database chosen later. This is not a storage option by itself; it is a migration and data-boundary posture that can combine with Options A, C, D, or even a refactored SQL Server target.

### Fit with target-domain persistence model

This option aligns strongly with the documented principle that legacy data is a source of knowledge, not the target architecture. It allows the future app database to be designed around SongCatalog, MelodyEquivalence, Repertoire, PreferenceVotes, ServicePlanning, CompletedHistory, People/Roles, and KnowledgeMappings.

### Fit with small domain-specific dataset

The small dataset may make a controlled import/refactoring process practical. Manual validation may be feasible for ambiguous legacy relationships, especially where foreign keys are missing or semantics are uncertain.

### Local development simplicity

Day-to-day local development can remain focused on the future app database. Developers may only need access to legacy SQL Server exports or fixtures during import-tooling work, not for every app run.

### Deployment implications

Production deployment would not need to depend on the legacy SQL Server database after import, unless an explicit operational requirement is later accepted. This reduces coupling to legacy infrastructure.

### Migration/refactoring implications from legacy SQL Server

This option makes migration/refactoring explicit. Legacy songs, melody links, repertoire, completed history, and people references would be transformed into the future target model. Ambiguous legacy relationships would need validation before import.

### Support for ordered service rows and lifecycle state

Future storage can model flexible ordered service rows and lifecycle state independently from the old fixed four-song service model. Legacy service-history rows can be interpreted into completed-history records only where their meaning is validated.

### Support for melody-equivalence queries / class-level checks

Legacy Czech-to-Czech, Polish-to-Polish, and Czech-to-Polish melody links can be transformed into edge evidence or class memberships in the future app database. This direction supports later correction and review rather than treating legacy columns as final truth.

### Support for future candidate selection and non-repetition checks

Candidate selection and non-repetition should run against the future app database, not directly against the legacy schema. This avoids binding candidate logic to old table shapes and fixed slots.

### Support for role-based preferences and people/roles

Legacy preacher and organist references can inform People/Roles after validation. Legacy recommendation-like knowledge should not become repertoire state automatically; if retained, it needs an accepted transformation into preference-vote knowledge.

### Operational complexity

This option adds import/refactoring work, but can reduce long-term operational complexity by decoupling the new app from the legacy database. Complexity depends on data quality and the level of audit/review required.

### Backup/export/recovery expectations

The future app database needs its own backup/export/recovery plan. Legacy exports should be preserved as source evidence for auditability and repeatable import validation.

### Risks and unknowns

- Import rules may reveal ambiguous or inconsistent legacy data.
- Without careful traceability, transformed data may be hard to audit.
- The future app database still needs a separate storage decision.
- Legacy access, export format, and validation process remain unresolved.

## 10. Cross-option comparison table

| Criterion | Option A — SQLite-like local | Option B — SQL Server-backed | Option C — PostgreSQL-like | Option D — Other relational | Option E — Legacy import/reference only |
| --- | --- | --- | --- | --- | --- |
| Target-domain fit | Likely good if schema is designed around logical areas. | Likely good if not copied from legacy schema. | Likely good if schema is designed around logical areas. | Unknown until specific option is named. | Strong as migration posture; still needs app database choice. |
| Small dataset fit | Strong. | Technically strong; may be operationally heavy. | Technically strong; may be more infrastructure than needed. | Likely, but must be justified. | Strong for controlled import/refactoring. |
| Local development simplicity | Potentially strongest. | Potentially heavier due to server requirement. | Common but server/container-based. | Unknown. | Simple for normal app work if legacy access is isolated. |
| Deployment implications | Good for simple single-node deployment; less clear for multi-instance hosting. | Good where SQL Server operations already exist; heavier otherwise. | Good fit for many web deployment patterns; not accepted. | Unknown. | Decouples future app from legacy DB after import. |
| Legacy migration/refactoring | Requires SQL Server export/import transformation. | Easiest continuity, but highest risk of preserving legacy shape. | Requires cross-database transformation. | Requires cross-database transformation. | Makes transformation explicit and central. |
| Ordered service rows/lifecycle | Feasible. | Feasible. | Feasible. | Must prove feasible. | Future DB can model correctly; legacy fixed slots need interpretation. |
| Melody-equivalence checks | Feasible; design must handle classes clearly. | Feasible; avoid legacy-column thinking. | Feasible; design must handle classes clearly. | Must prove feasible. | Supports transforming legacy links into future class knowledge. |
| Candidate selection/non-repetition | Feasible for small data; prove design. | Feasible; prove class-level queries. | Feasible; prove class-level queries. | Must prove feasible. | Should run against future DB, not legacy schema. |
| Preferences and People/Roles | Feasible. | Feasible. | Feasible. | Must prove feasible. | Legacy people can inform validated future references. |
| Operational complexity | Low to moderate, depending on backup/deployment. | Moderate to high. | Moderate. | Unknown. | Adds import complexity; may reduce runtime legacy coupling. |
| Backup/export/recovery | Potentially simple but must be tested. | Mature patterns; operator burden must be defined. | Mature patterns; operator burden must be defined. | Unknown. | Preserve legacy source exports plus future DB backups. |
| Main risk | Underestimating deployment/concurrency/backup needs. | Choosing it because legacy used it. | Adding infrastructure without need. | Expanding options without justification. | Not a complete storage decision by itself. |

## 11. Key risks

- Treating the logical target-domain persistence model as a physical schema too early.
- Recreating the legacy SQL Server schema one-to-one because it already exists.
- Choosing a database before deployment assumptions are known.
- Choosing a database before target technical schema design proves how melody-equivalence classes, ordered service rows, lifecycle states, preferences, and history are represented.
- Confusing Prisma or another ORM/query/migration tool with the storage technology itself.
- Underestimating backup, export, restore, and data-audit needs for a small but important domain dataset.
- Making detailed claims about current database, hosting, ORM, or migration support without later verification against official documentation.

## 12. Questions before decision

- Will the app be local-only, single-node web, hosted web, or eventually multi-instance?
- Who will operate the database, backups, exports, restores, and upgrades?
- What restore objective is acceptable for one local congregation's planning data?
- Does the app need remote access by multiple roles at the same time?
- What authentication and authorization approach will be selected, and does it influence storage or hosting?
- Should melody equivalence be stored as edges, materialized classes, or both?
- What technical schema best supports candidate selection and non-repetition without overfitting to the legacy schema?
- What level of legacy import traceability is required from old rows to future domain records?
- Which current tooling, hosting, ORM, migration, and driver claims must be verified against official documentation before acceptance?

## 13. Provisional conclusion

No storage option is selected yet.

SQLite-like storage may be attractive for local simplicity, but it is not accepted. SQL Server has legacy continuity advantages, but it should not be chosen merely because the old DB used SQL Server. PostgreSQL-like storage may be attractive for standard web deployment patterns, but it is not accepted.

The decisive next step is target technical schema design plus deployment assumptions, with first-slice storage choice prepared through `docs/first-slice-storage-decision-preparation.md`. A future accepted ADR must explicitly choose storage and justify it.

## 14. Follow-up work before an ADR can be accepted

Before accepting a storage ADR, the project should:

1. Review `docs/planning-lifecycle-first-schema-subset.md` and `docs/first-slice-storage-decision-preparation.md` before physical schema design and evaluate first-slice storage needs against them, without creating migrations or implementation artifacts prematurely.
2. Define deployment assumptions: local-only, single hosted instance, managed hosting, multi-instance, backup ownership, and restore expectations.
3. Decide how melody-equivalence knowledge is represented for class-level queries and correction workflows.
4. Decide how ordered service rows, lifecycle states, completed history, and saved future plans are represented.
5. Define legacy import/refactoring strategy, validation rules, and traceability expectations.
6. Verify current official documentation for any proposed database, hosting platform, ORM/query layer, migration tool, and driver.
7. Write an ADR that explicitly selects storage, rejects alternatives with rationale, and states whether any ORM/query/migration layer is selected separately from storage.
