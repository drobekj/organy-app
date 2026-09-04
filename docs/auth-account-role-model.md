# Authentication, Account, Actor, and Role Model

> Update (Issue #431): congregation voters now use the stable, email-confirmed identity and opaque-session model in `docs/congregation-voter-identity.md`. The older nickname-only passages below remain historical provenance, not the current voter-identity contract.

## 1. Purpose

This document defines the logical authentication, account, actor, voter-identity, and role model for the app, records the production access direction corrected in Phase 31.27, records the protected staff implementation completed in Phase 31.28, the nickname-only congregation preference implementation completed in Phase 31.29, the admin protected Account/RoleAssignment management completed in Phase 31.30, the protected credential reset/recovery boundary implemented in Phase 31.31, the minimal production runtime configuration/preflight boundary implemented in Phase 31.32, and the PostgreSQL logical backup/restore recovery baseline implemented in Phase 31.33.

The first production model deliberately distinguishes protected staff access from low-friction congregation voting:

- admin, priest, and organist use admin-provisioned username/password Accounts;
- congregation members vote under an unverified nickname and do not receive login-capable Accounts.

Authentication identity remains separate from the application's Person, Actor, and RoleAssignment concepts so that authentication technology does not become the domain model.

## 2. Non-goals

This document does not:

- define the final production hosting/provider, scheduled/off-site backup retention, PITR, release, observability, or secrets-management operations beyond the implemented Phase 31.32 runtime preflight and Phase 31.33 logical recovery baseline;
- choose the real-world trusted channel used to hand an initial or replacement password to a protected user;
- introduce public forgotten-password/reset links, email/SMS credential delivery, or forced-first-password-change policy;
- define stronger nickname normalization, nickname recovery, or long-lived browser convenience persistence;
- select a hosting provider or production database provider;
- introduce email magic links, public privileged signup, social OAuth, passkeys, or 2FA;
- introduce multi-congregation identity/tenancy behavior;
- equate legacy people records with authenticated users;
- add anti-abuse identity proof for congregation nickname voting;
- define security telemetry or account/role audit persistence.

Those remaining implementation and operations details require later accepted work.

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

### Password change and reset

A signed-in protected user may change their own password by providing the current password and a new password through the authentication layer.

Phase 31.31 adds a separate admin-owned reset boundary for another protected Account. The authenticated admin supplies an explicit replacement password; the target Account's existing sessions are revoked; username, Actor linkage, Person linkage, active state, and `app_user_roles` remain unchanged. The normal admin boundary does not reset the currently signed-in admin's own password because that user already has the current-password self-service path.

An inactive protected Account may receive a replacement password but remains inactive until separately reactivated through protected Account administration. There is no public forgotten-password/reset-link flow and no email/SMS credential delivery. Initial and replacement passwords are handed to the person outside the application through a trusted congregation/operator channel.

If no authenticated admin can perform a reset, Phase 31.31 provides only an explicit server/operator break-glass procedure for an existing protected admin Account. It requires direct operational access, changes only the credential, revokes that Account's sessions, and does not create roles, reactivate an Actor, or establish a permanent bypass.

Username changes remain outside user self-service. Forced-first-change behavior remains a later explicit decision.

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

Phase 31.29 implements only trim-only nickname normalization: surrounding whitespace is removed and an empty result is rejected. The active browser voter context is carried separately from Better Auth by an HttpOnly same-site cookie containing only the lightweight congregation Actor id. That cookie is deliberately not proof of real-world nickname ownership, creates no Better Auth Account/session/link rows, and is never accepted by protected Planning/Interaction authorization. Entering the same nickname again intentionally recreates the same weak voter identity. Stronger normalization, nickname recovery, and longer-lived convenience persistence remain deferred.

## 10. Admin account and role administration

Admin owns protected Account provisioning and privileged role administration. Phase 31.30 implements the normal DB-runtime administration boundary and UI for listing protected Accounts, provisioning future protected staff Accounts for eligible existing Actors, maintaining `admin`/`priest`/`organist` RoleAssignments, and deactivating/reactivating protected Account-linked Actors.

Normal administration cannot remove the `admin` role from or deactivate the **last active protected admin**. Role changes are authoritative immediately because protected authorization reloads current `app_user_roles`. Deactivation revokes the target's existing sessions and prevents new usable protected sessions; reactivation restores sign-in with the same credential when at least one protected role remains.

There is no public privileged signup, shared default production password, or permanent bootstrap backdoor. The first admin is established through an explicit one-off production setup procedure; that setup also provisions the current priest/organist protected Accounts before handoff.

Nickname-only congregation Actors are excluded from protected Account provisioning and remain outside protected account administration.

Phase 31.31 adds admin reset of another protected Account's password without making password data part of account-list output or introducing a public recovery path.

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

Nickname-only congregation preference operations use a separate narrow boundary: the nickname profile can affect only its own accepted congregation preference votes. Nickname identity cannot authorize planning, repertoire, shared knowledge, privileged role changes, protected Account administration, or password reset.

UI hiding remains convenience only for protected permissions. Server-side mutation boundaries perform their own authorization checks.

## 13. Attribution, audit, and security boundary

Phase 31.26 resolved business audit/change-history policy for its accepted business domains. This model preserves stable protected Actor identity for privileged attribution and a deliberately weak nickname Actor identity for congregation votes.

Phases 31.30 and 31.31 do not silently widen business-audit scope. Account provisioning, account activation/deactivation, password administration, RoleAssignment changes, failed sign-ins, and nickname-voter changes remain later audit/security-policy questions unless already covered by accepted business audit behavior.

## 14. Development and production runtime boundary

Development/test memory runtime may keep seeded fake Actors and the `Change user` selector for deterministic local and HUMAN acceptance testing.

Production/database-backed operation must not treat that selector as protected authentication. Protected production Actor identity comes from authenticated username/password sessions. Congregation preference identity comes from the separate nickname-only flow.

Phase 31.32 makes the production DB/auth configuration boundary explicit. Before deployment/startup, the operator runs the vendor-neutral production preflight described in `docs/production-runtime-runbook.md`. It requires `ORGANY_RUNTIME=db`, a non-blank `DATABASE_URL`, a non-placeholder `BETTER_AUTH_SECRET` of at least 32 characters, and an absolute `BETTER_AUTH_URL`. Public/non-loopback auth URLs must use HTTPS; loopback HTTP remains permitted for local development/acceptance.

The same configuration contract is enforced before protected auth/session work when the application is running with `NODE_ENV=production`. Missing or unsafe configuration therefore fails closed instead of qualifying through module-construction localhost/default placeholders. The validator emits only variable names and reasons, not environment values, and no public debug/config endpoint is introduced.

## 15. Better Auth technical boundary

Phase 31.28 selects and implements Better Auth `1.6.25` with `@better-auth/drizzle-adapter` `1.6.25` and compatible Drizzle ORM `0.45.2` for the first protected staff slice. Username/password sign-in, database-backed sessions, sign-out, and own-password change are exercised by exact-head PostgreSQL acceptance.

Better Auth's required auth-user email field remains internal implementation data. Phase 31.28 generates a random synthetic `@organy.invalid` value during protected bootstrap; staff do not enter or see that value and do not authenticate with it. This preserves the accepted username/password-only staff experience.

Phase 31.29 does not extend Better Auth to congregation voters. Their lightweight Actor/profile and voter-context cookie remain outside Better Auth persistence and cannot authorize protected staff operations.

Phase 31.30 reuses the same Better Auth credential/session persistence for normal admin-owned future protected Account provisioning. Church-domain roles remain solely in `app_user_roles` rather than Better Auth admin-role fields.

Phase 31.31 reuses Better Auth's credential password hashing format for explicit replacement passwords, updates only the existing credential Account, and revokes existing target sessions. No reset token, recovery email, or public recovery endpoint is enabled.

Phase 31.32 does not change Better Auth identity semantics. It makes the runtime inputs around the existing Better Auth/PostgreSQL boundary explicit and fail-closed in production. Build/test compatibility placeholders may still exist for module construction, but they do not satisfy the production preflight or production protected-request guard.

Phase 31.33 does not change Account, Actor, RoleAssignment, password, or nickname semantics. A whole-database logical restore preserves protected Accounts, credential hashes, Account-to-Actor links, active state, Person links, and `app_user_roles`, but all restored `auth_sessions` are revoked before the recovered database may be treated as usable. Environment secrets remain outside the database backup.

## 16. Resolved and remaining questions

Resolved by corrected Phase 31.27 and implemented through Phase 31.33:

- protected user experience — username + password;
- protected signup model — none; admin provisions accounts;
- initial access — admin/current priest/current organist Accounts exist before production handoff;
- own password change — allowed for signed-in protected users;
- congregation-member access — nickname-only voter profile, no protected Account or password;
- congregation nickname-voter creation/reuse and own-preference boundary — implemented in Phase 31.29 with trim-only normalization and no protected authorization authority;
- nickname abuse prevention — intentionally not attempted;
- domain-role authority — `app_user_roles`, not the auth library;
- production protected authorization source — server session → active Actor → current RoleAssignments;
- future protected staff Account provisioning, protected role maintenance, deactivation/reactivation, and last-active-admin safety — implemented in Phase 31.30;
- admin reset of another protected Account password with session revocation — implemented in Phase 31.31;
- public forgotten-password recovery — intentionally not introduced;
- only-admin credential loss — operator-only break-glass reset of an existing protected admin, with no permanent bypass;
- credential handoff — outside the application through a trusted local/operator channel;
- minimal production runtime configuration contract and redacted operator preflight — implemented in Phase 31.32;
- whole-database logical backup, integrity verification, separate-empty-target restore, restored protected-session revocation, and recovery rehearsal baseline — implemented in Phase 31.33;
- historical people without Accounts remain valid.

Still deferred:

- forced-first-password-change policy or any future public/token-based recovery mechanism;
- stronger nickname normalization, nickname recovery, and long-lived convenience persistence;
- hosting/provider selection and managed production database choice;
- scheduled/off-site backups, retention, encryption/key management, PITR/WAL, RPO/RTO, provider-native recovery, and production cutover;
- release/rollback, secret-manager integration/rotation, and concrete credential-delivery operations;
- identity/security audit, monitoring, and telemetry policy;
- any future OAuth, passkey, 2FA, or multi-congregation expansion.

## 17. What this enables next

Phase 31.33 closes the minimal vendor-neutral PostgreSQL logical backup/restore and recovery-rehearsal baseline around the already implemented runtime and identity models. It does not claim that deployment or disaster-recovery operations are complete.

Remaining identity/access-adjacent production work can now focus on:

- production hosting/provider selection and cutover mechanics;
- scheduled/off-site backup operations, retention/encryption, PITR/WAL, and explicit recovery objectives;
- release/rollback and operational hardening;
- separately accepted identity/security audit, monitoring, or telemetry;
- only separately accepted future UX/security additions such as forced-first-change, stronger recovery, OAuth, passkeys, or 2FA.

Each remaining slice still requires its own Contract Gate and exact-head acceptance before merge.
