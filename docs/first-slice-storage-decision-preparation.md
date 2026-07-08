# First-Slice Storage Decision Preparation

## 1. Purpose

This document prepares the storage decision for the first implementation slice, **Planning Lifecycle First**, by evaluating storage directions against `docs/planning-lifecycle-first-schema-subset.md`.

It narrows the decision space for first-slice persistence, but it does not select storage. The next accepted storage ADR must explicitly choose storage and justify that choice against the first-slice subset and the accepted single hosted one-congregation deployment assumption.

## 2. Non-goals

This document does not:

- choose SQLite, SQL Server, PostgreSQL, Prisma, Auth.js, Next.js, or any concrete technology;
- choose an authentication provider, account model, hosting provider, ORM, migration tool, or schema language;
- create a physical schema, database schema file, migration, Prisma schema, SQL, test, UI component, API endpoint, or application code;
- mark any ADR as accepted;
- create an implementation plan;
- design full candidate selection, repertoire, preference, melody non-repetition, catalog import, or legacy migration behavior;
- treat the legacy SQL Server database as the target runtime architecture.

## 3. Inputs

Primary inputs:

- `docs/planning-lifecycle-first-schema-subset.md`
- `docs/storage-options-comparison.md`
- `docs/target-technical-schema-draft.md`
- `docs/target-domain-persistence-model.md`
- `docs/deployment-assumptions.md`
- `docs/auth-account-role-model.md`
- `docs/adr-planning-lifecycle-stack-storage-auth.md`
- `docs/implementation-preparation.md`
- `docs/architecture.md`
- `docs/backlog.md`
- `docs/legacy-to-domain-mapping.md`
- `docs/technical-design-planning-lifecycle.md`
- `docs/domain-model.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/decisions.md`

Relevant accepted context:

- The first implementation slice is Planning Lifecycle First.
- The accepted deployment assumption is a single hosted web app for one congregation.
- Direct access roles are priest, organist, admin, and congregation member.
- Multi-congregation support is out of scope.
- Storage and auth provider remain unresolved.
- The legacy source is the SQL Server / SSMS database `VarhanniDoprovody`.
- The legacy database is source knowledge, not target runtime architecture.
- Direct one-to-one migration from the legacy schema is inappropriate.

## 4. First-slice storage needs

The first slice needs enough persistence to survive hosted shared access while preserving the storage-neutral subset:

- minimal actor-role representation for permission checks;
- minimal song reference by `(language, number)`;
- `ServiceContext`;
- `ServiceSet`;
- `ServiceSetRow`;
- `CompletedServiceRecord`;
- `CompletedServiceRow`;
- lifecycle states: no set exists, working set, final set, and completed-service record;
- ordered flexible rows rather than fixed four-song slots;
- row content that can be a song reference or textual note;
- validation that a row without a song has a textual note;
- final sets are not directly edited;
- deleting a working or final set returns to no set exists;
- manual conversion from final set to completed-service record;
- persistence appropriate for a shared hosted app used by the accepted roles.

## 5. Evaluation criteria

Each storage direction is evaluated for:

- fit with the first-slice subset;
- fit with the accepted single hosted one-congregation deployment assumption;
- local development impact;
- hosted deployment impact;
- concurrency and shared access implications;
- backup, export, and restore implications;
- migration and refactoring implications from legacy SQL Server;
- risk of overengineering;
- risk of underengineering;
- verification needed before acceptance.

## 6. Option A — SQLite-like local relational storage for first slice

A SQLite-like direction means lightweight local relational storage close to the app runtime. This may be attractive for local simplicity, but it must be checked against hosted shared access, backup, and concurrency expectations before acceptance.

- **Fit with first-slice subset:** The subset is small and relationally shaped. Service contexts, non-completed sets, ordered rows, completed records, completed rows, minimal actor-role references, and `(language, number)` song references can likely be represented cleanly.
- **Fit with deployment assumption:** The accepted deployment is hosted shared access, not local-only operation. A file-style database may still work for a single hosted instance, but only if the host provides durable writable storage and the app does not require multi-instance writes.
- **Local development impact:** Likely the simplest option for developers because it may avoid a separate database service.
- **Hosted deployment impact:** Hosting details become decisive: file persistence, write permissions, deployment replacement behavior, and operational backup access must be known.
- **Concurrency and shared access implications:** First-slice edits are modest, but priest, organist, and admin may still perform state-changing actions. The option must support safe writes for lifecycle transitions, row reordering, deletion, and completion in the expected hosted setup.
- **Backup/export/restore implications:** Whole-file backup and export may be simple, but reliable backup timing, restore testing, and corruption recovery cannot be assumed.
- **Migration/refactoring implications from legacy SQL Server:** Import would require explicit extraction and transformation from `VarhanniDoprovody` into the future app database. This separation may help avoid copying legacy table shapes.
- **Risk of overengineering:** Low if the deployment model supports it; the tool may be proportionate to the small first slice.
- **Risk of underengineering:** Meaningful if hosted persistence, concurrent writes, backup automation, or restore expectations exceed what a local file-style setup safely supports.
- **Verification before acceptance:** Confirm official hosting persistence behavior, concurrency limits, backup/restore procedure, migration tooling, deployment update behavior, and compatibility with the eventual runtime and auth approach.

## 7. Option B — SQL Server-backed persistence for first slice

A SQL Server-backed direction means the future app uses SQL Server as its primary app database. This has legacy continuity, but it risks preserving legacy assumptions and may be operationally heavy for a one-congregation first slice.

- **Fit with first-slice subset:** The relational subset should be straightforward to model. The schema would still need flexible ordered rows and explicit lifecycle concepts rather than the legacy fixed service-song slots.
- **Fit with deployment assumption:** It can support a hosted shared app if the chosen host can provision and operate SQL Server appropriately.
- **Local development impact:** Development may require a local SQL Server instance, container, or shared development database, making setup heavier than embedded storage.
- **Hosted deployment impact:** Managed or self-hosted SQL Server introduces provisioning, access configuration, secrets, backups, monitoring, and cost considerations.
- **Concurrency and shared access implications:** Server-backed relational storage should be capable of handling first-slice shared writes, but transaction boundaries and conflict behavior still need design.
- **Backup/export/restore implications:** SQL Server has mature backup and restore patterns, but the project must identify who operates them and how restore is tested for a small congregation.
- **Migration/refactoring implications from legacy SQL Server:** Same-family continuity may simplify extraction, validation, and operator familiarity. It also increases the risk of recreating `VarhanniDoprovody` instead of designing the storage-neutral target subset.
- **Risk of overengineering:** Potentially high if SQL Server operations are disproportionate to the small hosted one-congregation app and first-slice lifecycle needs.
- **Risk of underengineering:** Lower for concurrency and durability, but underengineering remains possible if the schema copies legacy assumptions or skips explicit lifecycle constraints.
- **Verification before acceptance:** Confirm hosting availability and cost, local development workflow, backup ownership, restore procedure, migration/refactoring path, driver/tooling support, and safeguards against legacy-schema preservation.

## 8. Option C — PostgreSQL-like relational storage for first slice

A PostgreSQL-like direction means server-based relational storage commonly used with hosted web apps. It may fit hosted web app patterns, but it could be more infrastructure than needed for the first slice.

- **Fit with first-slice subset:** The subset is compatible with relational modeling: actor-role references, service contexts, set status, ordered rows, song references, and completed history are all structured concepts.
- **Fit with deployment assumption:** This direction may align well with a single hosted web app where managed relational databases are available.
- **Local development impact:** Developers would likely need a local service, container, or remote development database. This is common, but not as simple as local file-style storage.
- **Hosted deployment impact:** The app would need database provisioning, connection management, secrets, migrations later, backups, and restore procedures.
- **Concurrency and shared access implications:** Server-backed relational storage should fit shared hosted access and lifecycle transitions, provided the eventual schema and application services define transaction and conflict behavior.
- **Backup/export/restore implications:** Managed backup and restore options may be available, but actual operational responsibility, export format, and restore testing must be accepted explicitly.
- **Migration/refactoring implications from legacy SQL Server:** Cross-database import/refactoring would be required. This reinforces separation from the legacy runtime architecture but adds transformation work.
- **Risk of overengineering:** Moderate if a managed database and associated operations exceed the needs of the small first slice.
- **Risk of underengineering:** Lower for hosted durability and concurrency than file-style storage, but possible if the project assumes managed hosting solves backups, authorization, or lifecycle correctness automatically.
- **Verification before acceptance:** Confirm hosted database availability, cost, local workflow, official runtime/tooling support, backup/export/restore process, import path from SQL Server, and transaction needs for first-slice lifecycle actions.

## 9. Option D — Legacy SQL Server as import/reference only plus separate app database

This direction keeps `VarhanniDoprovody` as source knowledge only and uses a separate future app database that is chosen later. It remains compatible with SQLite-like, SQL Server-backed, PostgreSQL-like, or another future app database.

- **Fit with first-slice subset:** Strong as an architectural boundary: the first-slice subset can be designed from accepted domain concepts rather than legacy tables.
- **Fit with deployment assumption:** Compatible with the hosted one-congregation assumption because the runtime app database would be separate from the legacy reference source.
- **Local development impact:** Developers may need sample/reference extraction data later, but day-to-day app persistence would not depend on a live legacy SQL Server connection.
- **Hosted deployment impact:** The hosted app would not rely on direct access to the legacy database. Import/reference processes, if any, can be separate operational activities.
- **Concurrency and shared access implications:** Runtime concurrency depends on the separately selected app database, not the legacy source.
- **Backup/export/restore implications:** Runtime backup/restore depends on the app database. Legacy backups remain source-data preservation, not production app recovery.
- **Migration/refactoring implications from legacy SQL Server:** This option explicitly supports refactoring from legacy knowledge into accepted target concepts and avoids direct one-to-one migration.
- **Risk of overengineering:** Low as a boundary decision, but import tooling can become overbuilt if it is pulled into the first slice prematurely.
- **Risk of underengineering:** Possible if the project postpones defining the actual app database while assuming the legacy boundary alone is enough to implement persistence.
- **Verification before acceptance:** Clarify whether any first-slice data must be seeded from legacy, what reference extracts are needed, how source evidence is preserved, and which separate app database will eventually be accepted.

## 10. Option E — Defer storage decision further

Deferring storage means continuing storage-neutral design without accepting a runtime persistence direction. This remains possible, but it blocks physical schema and implementation planning.

- **Fit with first-slice subset:** The subset can remain storage-neutral for analysis, but implementation cannot safely start without a selected persistence direction.
- **Fit with deployment assumption:** Deferral does not contradict the hosted one-congregation assumption, but it leaves unresolved whether the eventual storage can meet shared access, backup, and restore needs.
- **Local development impact:** No immediate database setup is needed, but developers cannot create realistic persistence, migrations, or data access boundaries.
- **Hosted deployment impact:** Hosting and recovery planning remain blocked because storage persistence, durability, and operations are unknown.
- **Concurrency and shared access implications:** No concrete concurrency model can be accepted while storage is unresolved.
- **Backup/export/restore implications:** Backup and restore expectations cannot be tested or assigned.
- **Migration/refactoring implications from legacy SQL Server:** Refactoring principles can continue, but no target import shape can be implemented.
- **Risk of overengineering:** Low in the short term because no technology is chosen prematurely.
- **Risk of underengineering:** High if deferral continues into implementation, because lifecycle persistence, permissions, backup, restore, and hosted shared access remain unproven.
- **Verification before acceptance:** Define the remaining decision blockers, the evidence needed to choose storage, and the deadline by which the storage ADR must be accepted before physical schema work begins.

## 11. Cross-option first-slice comparison table

| Direction | First-slice fit | Hosted one-congregation fit | Main strength | Main risk | Verification focus |
| --- | --- | --- | --- | --- | --- |
| Option A — SQLite-like local relational storage | Likely good for the small relational subset | Possible only if hosted file persistence, single-instance writes, backups, and restore are acceptable | Local simplicity and small operational footprint | Underengineering hosted shared access, backup, or concurrency | Hosting persistence, backup/restore, concurrency, deployment updates |
| Option B — SQL Server-backed persistence | Technically good if schema is refactored | Good where SQL Server hosting is practical | Legacy continuity and mature relational operations | Preserving legacy assumptions; operational weight | Hosting/cost, local setup, backup ownership, anti-copying safeguards |
| Option C — PostgreSQL-like relational storage | Technically good | Often aligned with hosted web app patterns | Standard managed relational deployment path | More infrastructure than first slice may need | Managed hosting, local workflow, backup/restore, SQL Server import |
| Option D — Legacy SQL Server as import/reference only plus separate app database | Good boundary for target subset | Compatible with any accepted future app database | Prevents runtime dependence on legacy schema | Does not itself choose runtime storage | Import/reference needs and eventual app DB decision |
| Option E — Defer storage decision further | Good for continued analysis only | Leaves hosted operations unresolved | Avoids premature selection | Blocks physical schema and implementation planning | Remaining evidence, decision deadline, ADR scope |

## 12. Decision pressure and tradeoffs

The first-slice subset is small enough that multiple relational directions could represent it. The pressure comes less from data volume and more from deployment reality: a shared hosted app needs durable persistence, safe lifecycle writes, backup/export/restore procedures, and a local development workflow the maintainers can actually use.

SQLite-like storage emphasizes simplicity but must prove it is safe enough for hosted shared access. SQL Server emphasizes continuity with the source database but must avoid turning legacy convenience into target architecture. PostgreSQL-like storage emphasizes common hosted relational patterns but may introduce more infrastructure than the first slice requires. Keeping the legacy database as import/reference only is compatible with all separate app database choices, but it does not resolve the runtime storage decision. Deferring storage further preserves neutrality, but it blocks physical schema and implementation planning.

## 13. Questions that must be answered before accepting storage

1. What hosted environment is expected, and does it provide durable writable storage or a managed database service?
2. Will the first production deployment run as one app instance or could multiple instances write concurrently?
3. What level of concurrent planning edits must be handled in the first slice?
4. Who owns backup, export, restore, and restore testing for one congregation?
5. What restore time and data-loss tolerance are acceptable?
6. What local development setup is realistic for maintainers?
7. Is any first-slice seed data required from `VarhanniDoprovody`, or can the first slice start with manually entered data?
8. How will the chosen storage support minimal actor-role permission checks while auth remains unresolved?
9. What later migration path is acceptable if the first-slice storage choice must be replaced?
10. What evidence is required to prove the option does not copy legacy fixed-slot or language-split table assumptions?

## 14. Provisional direction candidates

No option is accepted or preferred here. The plausible candidates to carry into the storage ADR are:

- SQLite-like local relational storage, if hosted persistence, backup, restore, and concurrency expectations prove sufficient for a single hosted one-congregation app.
- SQL Server-backed persistence, if legacy continuity and operational capability justify the added weight without preserving legacy schema assumptions.
- PostgreSQL-like relational storage, if managed hosted relational operations are acceptable and not disproportionate to the first slice.
- Legacy SQL Server as import/reference only plus a separate app database, as a boundary that should remain compatible with any future app database selection.

Deferring storage remains possible only as a short-term analysis choice; it should not continue past the point where physical schema and implementation planning are needed.

## 15. What an eventual storage ADR must decide

The eventual storage ADR must explicitly decide:

- the runtime storage direction for the first implementation slice;
- why that direction fits `docs/planning-lifecycle-first-schema-subset.md`;
- why that direction fits the accepted single hosted one-congregation deployment assumption;
- how hosted shared access, lifecycle transitions, and basic concurrency will be handled;
- how backup, export, restore, and restore testing will work;
- how local development will work;
- how the legacy SQL Server database will be treated as source knowledge without becoming target runtime architecture;
- what migration/refactoring risks are accepted;
- what remains intentionally deferred beyond Planning Lifecycle First.
