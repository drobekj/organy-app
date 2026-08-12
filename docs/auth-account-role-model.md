# Authentication, Account, Actor, and Role Model

## 1. Purpose

This document defines the logical authentication, account, actor, and role model for the app and records the production authentication direction accepted in Phase 31.27.

The first production authentication direction is Better Auth with the existing PostgreSQL/Drizzle direction, database-backed sessions, and passwordless email magic-link sign-in. Account creation is invitation-only.

The document keeps authentication identity separate from the application's Person, Actor, and RoleAssignment concepts so that authentication technology does not become the domain model.

## 2. Non-goals

This document does not:

- install or pin an auth package version;
- define physical auth tables, migrations, SQL, API routes, UI components, or email templates;
- select a transactional-email vendor, hosting provider, or production database provider;
- introduce password login, social OAuth, passkeys, 2FA, anonymous accounts, or public self-registration;
- introduce multi-congregation identity/tenancy behavior;
- equate legacy people records with authenticated users;
- define security telemetry, failed-login logging, or account/role audit persistence.

Those implementation and operations details require later accepted work.

## 3. Accepted deployment and authentication context

The accepted first production-oriented deployment assumption remains a single hosted web app for one congregation. The app supports direct access for:

- priest;
- organist;
- admin;
- congregation member / sborovník.

Phase 31.27 resolves the first production authentication direction:

- Better Auth provides authentication identity and session handling;
- the existing PostgreSQL direction is used through the Better Auth Drizzle adapter;
- sessions are database-backed;
- sign-in is passwordless email magic link;
- account creation is invitation-only and admin-owned;
- the concrete email-delivery provider remains a deployment/operations decision.

Congregation member access is needed for own preference voting and does not imply planning permissions. One Actor may have multiple accepted application roles. Multi-congregation behavior remains out of scope.

## 4. Core logical concepts

### Person

A Person is a real-world individual or named participant relevant to the congregation, planning process, preferences, repertoire, service history, or legacy records.

The current implementation concept is `catalog_persons`. A Person may remain meaningful historically even when they have no login account.

### Account

An Account is the login-capable authentication identity. In the first production direction, Better Auth `user/account/session` data supplies this layer.

An Account proves control of an invited email through passwordless magic-link authentication and owns authentication/session state. It does not itself define church-domain permissions.

### Actor

An Actor is the application identity used when enforcing permissions and attributing actions. The current implementation concept is `app_users`.

A production login-capable Account maps to exactly one active Actor. The exact physical reference is a later schema decision.

### Role

A Role is a domain-level authorization responsibility. The accepted roles remain:

- priest;
- organist;
- admin;
- congregation member.

### Role assignment

A RoleAssignment connects an Actor to one or more accepted Roles. The current implementation concept is `app_user_roles`.

`app_user_roles` remains the sole source of truth for church-domain authorization roles. Better Auth must not become a parallel role source.

Current authorization uses current RoleAssignments. Time-versioned role storage is not required by the first production auth slice; any historical review/audit of account or role administration requires a later explicit decision.

### Permission

A Permission is an allowed application action derived from the active Actor's current RoleAssignments and the accepted permission model.

Permissions are enforced server-side at protected behavior boundaries; UI visibility alone is not authorization.

### Historical person reference

A historical Person reference preserves a name or identity needed to understand past services, repertoire, or imported legacy knowledge even when that Person has no active Account or current RoleAssignment.

## 5. Person vs Account vs Actor

These concepts remain distinct:

- a Person may exist without any Account;
- a production login-capable Account maps to one application Actor;
- an Actor may hold multiple Roles;
- a historical Person may appear in service history or legacy-derived data without being login-capable;
- authorization uses the authenticated Account only to resolve the active Actor, then uses current authoritative `app_user_roles`;
- authentication identity must not be inferred from a Person name or legacy record.

The first production slice does not need multiple Accounts for one Actor or multiple Actors for one Account. Such generalization requires a later accepted decision.

## 6. Role model

The accepted logical roles are:

- **priest** — participates in planning, final-set decisions, completed-service conversion, and own preference voting;
- **organist** — participates in working-set planning, repertoire management, and own preference voting;
- **admin** — manages shared knowledge/configuration and congregation preferences, participates in planning where accepted, and has no own preference vote;
- **congregation member** — enters own preference votes and has no planning permissions.

An Actor may hold multiple roles. Admin does not automatically imply priest or organist permissions.

Priest/organist authorization roles and `catalog_persons.priest` / `catalog_persons.organist` planning-selector eligibility are intentionally distinct. Assigning an application role does not silently rewrite Person catalog eligibility. Person-bound priest/organist workflows require a suitable linked Person.

## 7. Permission model summary

### Planning permissions

- priest, organist, and admin may create, edit, and delete a working set;
- priest and admin may save or delete a final set;
- priest, admin, or the accepted system process may convert eligible final sets to completed-service records;
- congregation members have no planning permissions.

### Knowledge-management permissions

Admin manages shared knowledge and configuration, including melody equivalence, base song catalog knowledge, Antiphon/Topic mappings where administration exists, and non-repetition configuration.

### Repertoire permissions

Organist and admin may manage repertoire according to accepted repertoire rules. Person linkage remains necessary where repertoire is tied to an organist Person.

### Preference permissions

Priest, organist, and congregation member may manage their own song preferences. Admin may manage congregation preferences but has no own preference vote.

### Completed-service permissions

Completed-service records are historical records. Manual completion remains priest/admin behavior and automatic completion remains the accepted system behavior from Phase 31.25.

## 8. Invitation and sign-in model

### Invitation-only provisioning

There is no public production signup.

Admin owns account provisioning:

1. admin creates a pending invitation for a specific email and intended initial application roles;
2. the invited person proves control of that email through a single-use magic link;
3. unknown-email account creation is accepted only when a valid invitation exists;
4. successful acceptance idempotently creates or links the authentication Account to one Actor and applies the accepted initial RoleAssignments;
5. the invitation is consumed and cannot provision another relationship.

Invitation table shape, expiry policy, email transport, and UI are later implementation details.

### Existing-account sign-in

An existing allowed Account requests a magic link for its email and follows the valid single-use link to create an authenticated session.

The login response should not expose account existence unnecessarily. Production authorization still checks the linked Actor's current active state and roles after authentication.

### Account recovery

There is no password to recover in the first production slice. Normal access recovery is continued control of the account email. Loss/change of that email requires an explicit admin-controlled account recovery/re-provisioning procedure in later implementation/operations work; no hidden fallback credential is introduced.

## 9. Admin account and role administration

Admin owns:

- invitation creation/revocation;
- application role assignment/removal;
- later account activation/deactivation operations.

Normal administration must not be able to remove or deactivate the **last active admin**.

There is no default production credential, seeded production demo account, or permanent bootstrap backdoor. The first admin is established through an explicit one-off bootstrap procedure in the implementation phase.

Account deactivation causes the linked Actor to fail server authorization even if the browser still holds an otherwise valid session. Later implementation may additionally revoke stored sessions immediately.

## 10. Legacy people mapping

Legacy `Kazatele` and `Varhanici` records may inform Person records and historical references but do not automatically create Accounts, Actors, or current RoleAssignments.

Historical service/person data remains meaningful without forcing every legacy participant to become login-capable.

## 11. Authorization enforcement

Production authorization is derived server-side.

For a protected state-changing action the server must:

1. validate the authenticated session;
2. resolve the authenticated Account to the linked `app_users` Actor;
3. reject missing or inactive Actors;
4. read current authoritative roles from `app_user_roles`;
5. enforce the accepted permission rule for the requested action.

Client-supplied Actor IDs, role names, or permission claims are not authorization authority in production.

UI hiding remains convenience only. Route handlers, server actions, command handlers, or equivalent mutation boundaries perform their own authorization checks close to the application/data boundary.

Because roles are read from current application state, role changes apply to subsequent protected operations without relying on a long-lived client role selector.

## 12. Attribution, audit, and security boundary

Phase 31.26 resolved business audit/change-history policy for its accepted business domains. This auth model preserves stable Actor identity needed for attribution.

Phase 31.27 does not silently widen that business-audit scope. Whether invitations, account activation/deactivation, RoleAssignment changes, sign-in failures, rate-limit events, or similar identity/security events belong in business audit history, a security log, or both remains a later explicit identity/security decision.

## 13. Development and production runtime boundary

Development/test memory runtime may keep seeded fake Actors and the `Change user` selector for deterministic local and HUMAN acceptance testing.

Production/database-backed operation must not treat that selector as authentication. Production Actor identity comes from the authenticated server session.

No production demo account is seeded by this model.

## 14. Resolved and remaining questions

Resolved by Phase 31.27:

- authentication/session library direction — Better Auth;
- login method — passwordless email magic link;
- signup model — invitation-only, no public self-registration;
- account provisioning ownership — admin;
- domain-role authority — `app_user_roles`, not the auth library;
- production authorization source — server session → active Actor → current RoleAssignments;
- first-admin safety — explicit bootstrap plus last-active-admin protection;
- historical people without Accounts remain valid.

Still deferred:

- exact Better Auth package version and physical schema/migration;
- transactional-email vendor and delivery operations;
- invitation persistence shape and expiry duration;
- login/invitation/account-administration UI;
- production hosting/secrets/backup design;
- identity/security audit and telemetry policy;
- account email-change/recovery operational procedure;
- any future OAuth, passkey, 2FA, password, or multi-congregation expansion.

## 15. What this enables next

The next auth implementation phase can now design and implement a bounded slice around:

- Better Auth package/configuration and Drizzle/PostgreSQL auth schema;
- Account ↔ `app_users` linkage;
- invitation persistence and bootstrap;
- magic-link login route/UI and email callback;
- server-side Actor resolution/authorization;
- removing `Change user` as a production/database authentication mechanism while preserving memory test mode;
- tests for invitation gating, inactive Actors, current roles, and last-admin protection.

That implementation still requires its own Contract Gate and exact-head acceptance before merge.
