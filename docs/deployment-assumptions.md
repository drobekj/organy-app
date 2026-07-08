# Deployment Assumptions

## 1. Purpose

This document records preliminary deployment assumptions that must be clarified before the project accepts storage, schema, authentication, authorization, hosting, backup, and recovery decisions.

The app is currently understood as a small, domain-specific liturgical music knowledge-management and planning-support tool for one local congregation. The first implementation slice is Planning Lifecycle First. The legacy SQL Server / SSMS database `VarhanniDoprovody` is a source of domain knowledge, not the target runtime architecture.

This document does not accept a deployment model. It frames candidate operating environments so later technical decisions can be made deliberately.

## 2. Non-goals

This document does not:

- select a hosting provider or hosting model;
- select SQLite, SQL Server, PostgreSQL, Prisma, Next.js, Auth.js, or any other concrete technology;
- select a storage option;
- select an authentication provider or account model;
- create a database schema, migration, Prisma schema, SQL, API endpoint, UI component, application code, or test;
- mark any ADR as accepted;
- define production operations in detail;
- require multi-congregation support for the first slice.

## 3. Why deployment assumptions matter

Deployment assumptions define how the app is actually operated: who can reach it, who can edit at the same time, who owns backups, how restore works, and how user roles are verified.

Those assumptions directly affect unresolved technical choices:

- **Storage:** local file-style persistence, server-backed persistence, and managed database approaches have different concurrency, backup, and hosting implications.
- **Authentication and authorization:** a local admin-operated app may need a different account model than a remotely accessible app used by priest, organist, admin, and congregation member roles.
- **Legacy import/refactoring:** import tooling and validation expectations depend on whether the app is initialized once by an admin, operated continuously by multiple users, or deployed repeatedly for more congregations.
- **Recovery:** the acceptable restore process depends on whether the app is a personal/local planning helper or shared production system.

Storage and authentication decisions should therefore depend on accepted deployment assumptions, not the other way around.

## 4. Candidate deployment scenarios

### Scenario A — local single-user / admin-operated app

The app runs locally for one primary operator, likely an admin or organist, who maintains knowledge and planning data on behalf of the congregation.

This may be operationally simple and inexpensive, but it may not support real priest/organist collaboration. Other roles might contribute information outside the app, or the operator might enter it manually.

### Scenario B — single hosted web app for one congregation

The app is hosted once for one congregation and is reachable by authorized users over the network. Priest, organist, admin, and possibly congregation members can use the same shared app instance.

This may fit the current one-congregation product scope while allowing actual collaboration. It would require clearer decisions about accounts, role assignment, backups, hosting operations, and remote access.

### Scenario C — hosted web app with multiple active roles

The app is hosted for one congregation, but the first production assumption explicitly expects multiple roles to be active and potentially editing or contributing near the same time.

This scenario emphasizes concurrent editing risk, permission enforcement, user attribution, conflict handling, and reliable shared storage. It may be more realistic once candidate selection, preferences, knowledge maintenance, and completed history are actively used by different roles.

### Scenario D — future multi-congregation deployment

The app can serve multiple congregations, potentially with separate datasets, role assignments, configuration, and operational ownership.

This remains future and out of scope for the current product direction. It should not drive the first implementation slice unless product scope changes, but it should remain visible as a later expansion risk.

## 5. Evaluation criteria

Candidate scenarios should be evaluated against these criteria:

- **Number of users:** How many people use the app directly during the first slice and later production use?
- **Remote access need:** Must priest, organist, admin, or congregation members access the app from different devices and locations?
- **Concurrent editing risk:** Can multiple users edit service plans, preferences, repertoire, or knowledge at the same time?
- **Authentication need:** Are individual accounts, shared access, invitation flows, or external identity providers required?
- **Backup ownership:** Who is responsible for backups: a local operator, congregation admin, hosting provider, or technical maintainer?
- **Restore expectations:** How quickly must data be restored, and who can perform a restore safely?
- **Operating cost:** What recurring cost is acceptable for one small congregation?
- **Maintenance burden:** Who applies updates, monitors failures, rotates secrets, and verifies backups?
- **Fit with small congregation use:** Does the scenario remain practical for a small domain-specific app?
- **Fit with future expansion:** Does the scenario leave reasonable room for later roles, richer knowledge, history, and possible multi-congregation support?

## 6. Scenario comparison

| Scenario | Strengths | Constraints / risks |
| --- | --- | --- |
| A — local single-user / admin-operated app | Simple operation; low cost; easier whole-dataset backup/export; may be enough for early data entry or demos. | Weak direct collaboration; role behavior may be simulated rather than real; remote access and concurrent edits are limited; backup depends heavily on one operator. |
| B — single hosted web app for one congregation | Fits current one-congregation scope; supports shared planning; makes priest/organist collaboration more realistic; can still remain small. | Requires account, role, backup, hosting, and maintenance decisions; has more operational responsibility than local-only use. |
| C — hosted web app with multiple active roles | Exercises accepted role model more fully; supports direct preferences and knowledge contributions; better preparation for real shared production use. | Higher concurrency, authorization, audit, and recovery expectations; may be too much for the first slice if not constrained. |
| D — future multi-congregation deployment | Leaves a path for broader use if product scope expands. | Out of current scope; risks premature tenancy, administration, and data-isolation complexity. |

## 7. First-slice deployment assumption candidates

For Planning Lifecycle First, the most useful candidate assumptions appear to be:

1. **Local/admin-operated first-slice candidate:** useful for proving service-set lifecycle behavior with minimal operations, but insufficient to validate real priest/organist collaboration.
2. **Single hosted one-congregation first-slice candidate:** plausibly closer to first production use because it allows shared access for priest, organist, and admin while staying within current scope.
3. **Multiple-active-role hosted candidate:** useful if the first slice must immediately prove role-specific collaboration, but likely requires stricter decisions about accounts, concurrency, attribution, and recovery.

None of these candidates is accepted here. The project should explicitly choose the first-slice deployment assumptions before accepting stack, storage, or authentication decisions.

## 8. Impact on storage choice

Deployment assumptions strongly shape storage evaluation:

- Local-only operation may favor simple local persistence and whole-dataset backup, but the project must still define file persistence, restore, and corruption handling.
- A hosted one-congregation app may favor storage that supports remote access, reliable server-side persistence, backups, and safe deployment updates.
- Multiple active roles increase the need to handle concurrent writes, lifecycle state transitions, and conflict-prone planning changes reliably.
- Future multi-congregation deployment would add data isolation, tenant configuration, and operational scaling concerns, but this should remain out of first-slice scope unless accepted separately.

No storage technology is selected by this analysis.

## 9. Impact on authentication/authorization

The accepted product roles are priest, organist, admin, and congregation member, but the account model remains unresolved.

Deployment assumptions must clarify:

- whether each person has an individual account;
- whether one person may hold multiple roles;
- who creates, disables, or changes accounts and roles;
- whether congregation members authenticate individually or contribute through a simplified mechanism;
- whether role enforcement needs auditability or attribution;
- whether remote access requires stronger authentication controls than local-only use.

Authorization rules must still be enforced in the application/domain layer. No authentication provider or framework is selected here.

## 10. Impact on backup/export/recovery

Backup and recovery expectations differ by scenario:

- Local/admin-operated use may rely on an operator-managed backup/export process, which must be simple and regularly verified.
- Hosted one-congregation use needs clear ownership for automated backups, manual exports, restore testing, and operational access.
- Multiple-active-role use raises the cost of data loss because planning state, preferences, repertoire, and knowledge may be updated by different people.
- Future multi-congregation use would require separate backup, restore, and export expectations per congregation.

Before production use, the project should define minimum backup frequency, restore ownership, restore testing, and export expectations.

## 11. Impact on legacy import/refactoring

The legacy database `VarhanniDoprovody` should inform future knowledge import and refactoring, not determine the runtime architecture.

Deployment assumptions affect import work because:

- local/admin-operated use may allow a one-time guided import by a trusted operator;
- hosted one-congregation use may need repeatable initialization, validation, and rollback steps;
- multiple active roles may require clearer cutover timing so users do not edit stale or partially imported knowledge;
- future multi-congregation use would require import processes that can be repeated safely for separate congregations.

Any import should transform legacy meaning into the target-domain model: canonical song catalog, melody equivalence, repertoire, preference votes, service planning, completed history, people/roles, and knowledge mappings.

## 12. Risks

- Choosing storage or authentication before deployment assumptions may create a mismatch between technology and real operating needs.
- Local-only operation may look simple but fail to support the collaboration expected between priest and organist.
- Hosted operation may introduce maintenance, cost, backup, and account-management responsibilities that exceed what a small congregation can sustain.
- Multi-role collaboration may require concurrency and attribution decisions that are not yet specified.
- Legacy SQL Server familiarity may bias storage decisions toward preserving legacy architecture instead of refactoring domain meaning.
- Multi-congregation concerns could prematurely complicate the first slice if not kept out of scope.

## 13. Open questions for product decision

- Who must directly use the first production version: priest, organist, admin, congregation members, or only a subset?
- Must users access the app remotely from different devices and locations?
- Is real priest/organist collaboration required for the first slice, or can one operator enter plans on behalf of others?
- How likely is simultaneous editing of the same service set during the first slice?
- Who owns backups, restore, updates, and operational troubleshooting?
- What data loss window is acceptable for a small congregation?
- Must user changes be attributable to individual people from the beginning?
- Are congregation member preferences collected inside the app in the first production direction, or later?
- Is future multi-congregation support a known product goal or only a possible later expansion?

## 14. Provisional conclusion

No deployment model is accepted yet.

Local-only operation may be operationally simple, but it may not support real priest/organist collaboration. A single hosted web app for one congregation may be a plausible first production direction because it fits the current scope while allowing shared planning, but this is only a candidate assumption, not an accepted decision.

Multi-congregation support remains future and out of scope for the first slice.

Before accepting the stack/storage/auth ADR, the project should explicitly choose first-slice deployment assumptions. Storage and authentication decisions should then be evaluated against those accepted assumptions.

## 15. Follow-up work before accepting stack/storage/auth ADR

Before the ADR can be accepted, the project should:

1. choose the first-slice deployment assumptions explicitly;
2. define first-slice direct users and role expectations;
3. decide whether remote access is required for the first production direction;
4. define minimum concurrency expectations for service-set planning;
5. define account ownership and role-assignment responsibilities;
6. define backup, export, and restore expectations;
7. confirm whether legacy import is one-time, repeatable, or deferred;
8. re-evaluate storage options against the accepted deployment assumptions;
9. re-evaluate authentication and authorization options against the accepted deployment assumptions;
10. update the ADR only after these assumptions are explicit.
