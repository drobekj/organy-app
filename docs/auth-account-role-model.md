# Authentication, Account, Actor, and Role Model

## 1. Purpose

This document defines the logical authentication, account, actor, voter-identity, and role model for the app and records the production access direction corrected in Phase 31.27.

The first production model deliberately distinguishes protected staff access from low-friction congregation voting:

- admin, priest, and organist use admin-provisioned username/password Accounts;
- congregation members vote under an unverified nickname and do not receive login-capable Accounts.

Authentication identity remains separate from the application's Person, Actor, and RoleAssignment concepts so that authentication technology does not become the domain model.

## 2. Non-goals

This document does not:

- install or pin an auth package version;
- define physical auth tables, migrations, SQL, API routes, or final UI components;
- define exact password-generation, credential-delivery, forgotten-password, or forced-first-change policy;
- define exact nickname normalization or browser convenience persistence;
- select a hosting provider or production database provider;
- introduce email magic links, public privileged signup, social OAuth, passkeys, or 2FA;
- introduce multi-congregation identity/tenancy behavior;
- equate legacy people records with authenticated users;
- add anti-abuse identity proof for congregation nickname voting;
- define security telemetry or account/role audit persistence.

Those implementation and operations details require later accepted work.

## 3. Accepted access context

The accepted first production-oriented deployment assumption remains a single hosted web app for one congregation.

Protected login-capable access exists for:

- admin;
- priest;
- organist.

Congregation member access exists for own preference voting only, through a nickname-only voter profile rather than a protected Account.

One protected Actor may have multiple accepted application roles. Multi-congregation behavior remains out of scope.

## 4. Core logical concepts

### Person

A Person is a real-world individual or named participant relevant to the congregation, planning process, repertoire, service history, or legacy records.

The current implementation concept is `catalog_persons`. A Person may remain meaningful historically even when they have no login Account.

### Account

An Account is a login-capable protected authentication identity.

In the first production model, Accounts are used for admin/priest/organist access and authenticate with username + password. Account creation is admin-owned; there is no public self-registration for protected roles.

A congregation nickname voter has no Account.

### Actor

An Actor is the application identity used for role assignment and attribution. The current implementation concept is `app_users`.

Two Actor forms are accepted:

- **protected Actor** — linked to exactly one login-capable Account;
- **nickname voter Actor** — lightweight congregation Actor with no Account, identified only by an unverified nickname for preference voting.

### Role

A Role is a domain-level authorization responsibility. The accepted roles remain:

- priest;
- organist;
- admin;
- congregation member.

### Role assignment

A RoleAssignment connects an Actor to one or more accepted Roles. The current implementation concept is `app_user_roles`.

`app_user_roles` remains the sole source of truth for church-domain roles. Authentication-library roles must not become a parallel church-domain role source.

Protected privileged role assignments are admin-owned. A newly created nickname voter Actor receives exactly the `congregation_member` role from the system as part of the nickname flow; that flow cannot grant protected roles.

### Permission

A Permission is an allowed application action derived from an Actor's accepted current RoleAssignments and the accepted permission model.

Protected permissions are enforced server-side behind authenticated Account sessions. Nickname-only congregation Actors are restricted to the narrow own-preference behavior and cannot cross into protected permissions.

### Historical person reference

A historical Person reference preserves a name or identity needed to understand past services, repertoire, or imported legacy knowledge even when that Person has no active Account or current RoleAssignment.

## 5. Person vs Account vs Actor

These concepts remain distinct:

- a Person may exist without any Account;
- a protected Account maps to one active application Actor;
- a protected Actor may hold multiple Roles;
- a nickname voter Actor has no Account and only the congregation-member role;
- a historical Person may appear in service history or legacy-derived data without being login-capable;
- protected authorization uses the authenticated Account only to resolve the active Actor, then uses current authoritative `app_user_roles`;
- nickname voting does not authenticate a real-world Person and must not be promoted to protected Account identity;
- authentication identity must not be inferred from a Person name or legacy record.

The first production slice does not need multiple Accounts for one protected Actor or multiple protected Actors for one Account.

## 6. Role model

The accepted logical roles are:

- **priest** — participates in planning, final-set decisions, completed-service conversion, and own preference voting;
- **organist** — participates in working-set planning, repertoire management, and own preference voting;
- **admin** — manages shared knowledge/configuration and congregation preferences, participates in planning where accepted, and has no own preference vote;
- **congregation member** — enters own preference votes and has no planning permissions.

An authenticated protected Actor may hold multiple roles. Admin does not automatically imply priest or organist permissions.

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

Priest and organist may manage their authenticated own song preferences according to accepted score ranges. A nickname-only congregation Actor may manage only the own congregation preference profile stored under that nickname. Admin may manage congregation preferences but has no own preference vote.

### Completed-service permissions

Completed-service records are historical records. Manual completion remains priest/admin behavior and automatic completion remains the accepted system behavior from Phase 31.25.

## 8. Protected account provisioning and sign-in

### No public protected signup

There is no production signup flow that allows a visitor to become admin, priest, or organist.

Admin owns protected Account provisioning:

1. admin selects/creates the relevant application Actor/Person linkage;
2. admin chooses the username;
3. admin sets an initial password;
4. admin assigns the accepted church-domain roles in `app_user_roles`;
5. credentials are handed to the person outside the application;
6. the person signs in with username + password.

The first production setup must establish the initial admin and provision the current priest/organist protected Accounts before handoff.

When a new priest or organist later arrives, admin repeats this provisioning process. The new person does not self-register.

### Existing protected-account sign-in

An existing protected user enters username + password. Successful authentication creates the protected database-backed session. The server resolves that session to the active Actor and reads current roles from `app_user_roles`.

### Password change

A signed-in protected user may change their own password by providing the current password and a new password through the authentication layer.

Username changes are not a user self-service requirement in this phase. Forgotten-password/reset and forced-first-change behavior are later explicit decisions.

## 9. Congregation nickname voting

A congregation member does not create a protected Account and does not receive a password.

When the visitor enters the preference-voting interaction:

1. the UI asks for a nickname when no nickname voter context is active;
2. the server creates or reuses the lightweight Actor for that nickname;
3. that Actor has exactly the `congregation_member` role;
4. the visitor may add/change only that nickname profile's own accepted preference votes;
5. no protected authentication session is created.

The nickname model deliberately accepts weak identity:

- no email or identity verification;
- no password;
- no proof that one nickname belongs to one person;
- no prevention of one person using several nicknames;
- reuse of an existing nickname is treated as the same voter profile because the application intentionally has no stronger identity proof.

Exact nickname syntax/normalization and browser remembering of the nickname are implementation/UI details. They must not be mistaken for security boundaries.

## 10. Admin account and role administration

Admin owns protected Account provisioning and privileged role administration.

Normal administration must not be able to remove or deactivate the **last active admin**.

There is no public privileged signup, shared default production password, or permanent bootstrap backdoor. The first admin is established through an explicit one-off production setup procedure; that setup also provisions the current priest/organist protected Accounts before handoff.

Protected Account deactivation causes the linked Actor to fail server authorization even if the browser still holds an otherwise valid session.

Nickname-only congregation Actors are not admin-provisioned Accounts and remain outside protected account administration.

## 11. Legacy people mapping

Legacy `Kazatele` and `Varhanici` records may inform Person records and historical references but do not automatically create protected Accounts, Actors, or current RoleAssignments.

Historical service/person data remains meaningful without forcing every legacy participant to become login-capable.

## 12. Authorization enforcement

Protected production authorization is derived server-side.

For a protected state-changing action the server must:

1. validate the authenticated Account session;
2. resolve the Account to the linked `app_users` Actor;
3. reject missing or inactive Actors;
4. read current authoritative roles from `app_user_roles`;
5. enforce the accepted permission rule for the requested action.

Client-supplied Actor IDs, role names, or permission claims are not authorization authority for protected operations.

Nickname-only congregation preference operations use a separate narrow boundary: the nickname profile can affect only its own accepted congregation preference votes. Nickname identity cannot authorize planning, repertoire, shared knowledge, privileged role changes, or protected Account administration.

UI hiding remains convenience only for protected permissions. Server-side mutation boundaries perform their own authorization checks.

## 13. Attribution, audit, and security boundary

Phase 31.26 resolved business audit/change-history policy for its accepted business domains. This model preserves stable protected Actor identity for privileged attribution and a deliberately weak nickname Actor identity for congregation votes.

Phase 31.27 does not silently widen business-audit scope. Account provisioning, password administration, RoleAssignment changes, failed sign-ins, and nickname-voter changes remain later audit/security-policy questions unless already covered by accepted business audit behavior.

## 14. Development and production runtime boundary

Development/test memory runtime may keep seeded fake Actors and the `Change user` selector for deterministic local and HUMAN acceptance testing.

Production/database-backed operation must not treat that selector as protected authentication.

Protected production Actor identity comes from authenticated username/password sessions. Congregation preference identity comes from the separate nickname-only flow.

## 15. Better Auth technical boundary

Better Auth remains the selected implementation candidate because current official documentation supports username-based password sign-in, public signup disabling, password change, and database-backed operation.

Current Better Auth documentation also requires an email field on the auth user record. This is an implementation compatibility concern only. It does **not** change the accepted product behavior into email login, email verification, or magic links. The implementation phase must prove a clean non-user-facing handling of that field; otherwise the auth-library choice is revisited.

## 16. Resolved and remaining questions

Resolved by corrected Phase 31.27:

- protected user experience — username + password;
- protected signup model — none; admin provisions accounts;
- initial access — admin/current priest/current organist Accounts exist before production handoff;
- own password change — allowed for signed-in protected users;
- congregation-member access — nickname-only voter profile, no protected Account or password;
- nickname abuse prevention — intentionally not attempted;
- domain-role authority — `app_user_roles`, not the auth library;
- production protected authorization source — server session → active Actor → current RoleAssignments;
- first-admin safety — explicit bootstrap plus last-active-admin protection;
- historical people without Accounts remain valid.

Still deferred:

- exact Better Auth package version and proof/handling of its mandatory internal email field;
- physical auth schema/migration;
- exact login/account-admin UI;
- initial password generation/delivery, forgotten-password/reset, and forced-first-change policy;
- nickname normalization and convenience persistence;
- production hosting/secrets/backup design;
- identity/security audit and telemetry policy;
- any future OAuth, passkey, 2FA, or multi-congregation expansion.

## 17. What this enables next

The next auth implementation phase can design and implement a bounded slice around:

- username/password authentication package/configuration and PostgreSQL/Drizzle auth persistence;
- protected Account ↔ `app_users` linkage;
- first-admin and initial priest/organist provisioning;
- admin protected-account creation for later priest/organist access;
- protected username/password login and own-password-change UI;
- server-side Actor resolution/authorization;
- nickname-only congregation voter creation/reuse and own preference boundary;
- removing `Change user` as production protected authentication while preserving memory test mode;
- tests for no public privileged signup, inactive Actors, current roles, last-admin protection, password change, and nickname-only permission isolation.

That implementation still requires its own Contract Gate and exact-head acceptance before merge.
