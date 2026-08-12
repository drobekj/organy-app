# Production Authentication Decision

Authority: Phase 31.27 Contract Gate #166; `docs/auth-account-role-model.md`; REQ-012; backlog RP-001/RP-002; current Next.js + Drizzle + PostgreSQL implementation direction; user correction on 2026-08-12.

## Decision

The first production access model has **two deliberately different levels**.

### Protected staff access

Admin, priest, and organist use login-capable protected Accounts.

The user-facing sign-in method is **username + password**. There is no public self-registration for these roles.

Admin provisions a protected Account, chooses its username, sets an initial password, links it to the appropriate application Actor/Person context, and assigns accepted church-domain roles. The credentials are handed to the user outside the application. Once signed in, the user may change their own password.

The first production handoff must already have the initial admin and current priest/organist protected Accounts provisioned. When a new priest or organist later needs access, an admin provisions that Account; the newcomer does not register themselves.

Better Auth remains the selected authentication/session candidate with the existing PostgreSQL direction through the Better Auth Drizzle adapter and database-backed sessions. The intended Better Auth capability set is username support over password credentials with public signup disabled. The exact package/configuration is reverified and pinned only in the implementation phase.

### Congregation-member voting access

A congregation member does **not** receive a login-capable Account.

To enter the voting interaction, the visitor supplies only a nickname. The application creates or reuses a lightweight application Actor associated with that nickname and the `congregation_member` role, then stores that Actor's own accepted song-preference votes.

This nickname is deliberately **not authenticated identity**:

- there is no password;
- there is no email verification;
- there is no privileged account signup;
- the system does not attempt to prove that the nickname belongs to one real person;
- the system does not attempt to prevent one real person from using multiple nicknames;
- if another person enters the same nickname, the system has no basis to distinguish them and treats the nickname as the same lightweight voter profile.

This is an accepted simplicity/trust trade-off for congregation preference voting. The nickname-only profile never grants planning, repertoire, knowledge, or account-administration permissions.

## Why this fits the current application

The application already separates:

- `catalog_persons` — real-world Person records;
- `app_users` — application Actors;
- `app_user_roles` — church-domain authorization role assignments.

The authentication library therefore supplies only the missing credential/session layer for protected Accounts. It does not replace the domain model.

A protected Account maps to exactly one active `app_user` Actor. A nickname-only congregation Actor has no login-capable Account at all.

`app_user_roles` remains the single church-domain role authority. Better Auth roles, if any exist internally for technical reasons, must not become the authority for priest/organist/admin/congregation-member application permissions.

## Protected sign-in flow

1. User opens the protected sign-in screen.
2. User enters username and password.
3. The authentication layer validates the password and creates the database-backed session.
4. The server resolves the authentication identity to exactly one active `app_user` Actor.
5. Current church-domain roles are read from `app_user_roles`.
6. Each protected action is authorized server-side from those current roles.

There is no email magic-link step and no public signup screen.

## Protected account provisioning

1. An authenticated application admin chooses the Person/Actor context and accepted initial roles.
2. Admin chooses a unique username and initial password.
3. The server provisions the credential Account and links it to exactly one application Actor.
4. Church-domain roles are persisted only in `app_user_roles`.
5. Admin communicates the username and initial password to the person outside the application.
6. After sign-in, the account owner may change their own password.

Exact password-generation policy, forced-first-change policy, forgotten-password/reset policy, and credential-delivery procedure are later implementation/operations details unless separately accepted.

## Congregation nickname flow

1. Visitor opens the preference-voting interaction.
2. If no nickname voter context is active, the UI asks only for a nickname.
3. The server creates or reuses the lightweight Actor for that nickname.
4. That Actor has only the `congregation_member` role.
5. The visitor may read/change only the accepted own preference votes for that nickname profile.
6. No authenticated Account or protected session is created by this flow.

Exact nickname normalization, collision presentation, and whether the browser remembers the last nickname for convenience are later UI/implementation details. Such convenience state must never become proof of real-world identity.

## Identity boundaries

### Person

`catalog_persons` remains the real-world participant/catalog concept. Historical persons may exist without Accounts.

### Account

A protected Account is the login-capable credential/session identity used by admin/priest/organist. It authenticates username + password and owns protected session state.

A congregation nickname profile is **not** an Account.

### Actor

`app_users` remains the application Actor used for role assignment and attribution.

- a protected login-capable Account maps to one active Actor;
- a nickname-only congregation voter is represented by a lightweight Actor without an Account.

### Role assignment

`app_user_roles` remains the single source of truth for church-domain roles. Multiple roles per protected Actor remain valid.

A newly created nickname voter Actor receives only `congregation_member`; that assignment may be system-created as part of the nickname flow and cannot be used to escalate to protected roles.

Priest/organist authorization roles do not silently mutate `catalog_persons.priest` or `catalog_persons.organist`. Person-catalog eligibility and account authorization remain distinct. Person-bound priest/organist workflows require a suitable linked Person.

## Account and role administration

Protected Account provisioning and privileged role administration are admin-owned.

Admin may later, through accepted administration UI/behavior:

- create protected Accounts for priest/organist/admin access;
- deactivate protected account-linked Actors;
- assign or remove accepted privileged application roles;
- set initial credentials and perform any separately accepted admin password-reset operation.

Normal administration must prevent removing or deactivating the **last active admin**.

There is no public privileged signup, seeded shared production password, or permanent bootstrap bypass. Initial deployment requires an explicit one-off setup that establishes the first admin and provisions the current priest/organist Accounts before production handoff.

Nickname-only congregation Actors are not provisioned by admin; they arise from nickname entry and remain constrained to congregation preference behavior.

## Password ownership

A signed-in protected account owner may change their own password by proving the current password through the authentication layer.

The product does not require the user to change their username. Username administration remains admin-owned unless a later decision changes it.

Forgotten-password recovery is not silently invented by this phase. It requires a later explicit implementation policy.

## Authorization boundary

Protected production authorization is server-authoritative.

For protected state-changing actions the server must:

1. validate the authenticated session;
2. resolve the session to the linked `app_user` Actor;
3. require that Actor to be active;
4. load current roles from authoritative `app_user_roles` state;
5. enforce the accepted application permission rule for the requested action.

Client-supplied actor IDs, role names, or permission claims are never authorization authority for protected operations.

For nickname-only congregation preference changes, the server accepts only the narrow preference-voting behavior for the nickname profile. Nickname possession is not elevated into protected authentication and cannot authorize planning, repertoire, knowledge, or account administration.

## Development/runtime boundary

`ORGANY_RUNTIME=memory` may retain seeded demo Actors and the development `Change user` selector for deterministic local/HUMAN acceptance testing.

Database-backed production operation must not expose that selector as protected authentication. Protected production identity comes from authenticated server sessions; congregation voting uses the separate nickname-only flow.

## Explicitly not selected

The first production access slice does not select or require:

- email magic-link sign-in;
- public self-registration for protected roles;
- congregation-member passwords or protected Accounts;
- social OAuth;
- passkeys;
- two-factor authentication;
- multi-congregation identity behavior;
- a hosting provider.

These may be revisited only by a later accepted decision.

## Better Auth implementation caveat

Current Better Auth documentation confirms username + password sign-in, disabling email/password signup, and changing the signed-in user's own password.

Better Auth also currently requires an email field on its auth user record even when username authentication is used. The product **does not** therefore gain an email-login or email-verification requirement. The implementation phase must prove a clean non-user-facing treatment of that library field. If Better Auth would force email into the admin/user workflow in a way that conflicts with this accepted username/password product model, the authentication library choice must be revisited rather than changing the product behavior to fit the library.

## Audit and security boundary

Phase 31.26 defines business audit history for its accepted business domains. This auth decision does not silently redefine that scope.

Whether protected account creation, role administration, password changes/failures, sign-in failures, or nickname-voter changes belong in business audit history, a security log, or both remains a later explicit identity/security decision.

## External technical basis checked 2026-08-12

The corrected direction was checked against current official Better Auth documentation for:

- username-based sign-in over password credentials;
- disabling public email/password signup;
- signed-in user password change;
- PostgreSQL/Drizzle-backed authentication/session direction;
- the current mandatory auth-user email field.

The exact library version is intentionally not frozen by this documentation-only phase and must be pinned and reverified in the implementation PR.
