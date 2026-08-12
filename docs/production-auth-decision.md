# Production Authentication Decision

Authority: Phase 31.27 Contract Gate #166; `docs/auth-account-role-model.md`; REQ-012; backlog RP-001/RP-002; current Next.js + Drizzle + PostgreSQL implementation direction.

## Decision

The first production authentication model uses **Better Auth** with the existing PostgreSQL direction through the Better Auth Drizzle adapter and database-backed sessions.

The first supported sign-in method is **passwordless email magic link**.

Account creation is **invitation-only**. There is no public self-registration in the first production scope.

This decision selects the authentication/session direction only. Exact package versions, physical auth tables, migrations, email provider, deployment secrets, login UI and invitation-management UI belong to the later implementation phase.

## Why this fits the current application

The application already separates:

- `catalog_persons` — real-world Person records;
- `app_users` — application Actors;
- `app_user_roles` — application authorization role assignments.

Better Auth therefore supplies the missing Account/session layer rather than replacing the domain model.

The application roles `priest`, `organist`, `admin`, and `congregation_member` remain authoritative in `app_user_roles`. Better Auth must not become a parallel source of church-domain roles.

## Authentication flow

### Existing account

1. User enters their email on the login screen.
2. The server accepts the request without disclosing whether the email exists.
3. If the email belongs to an allowed active account, a single-use magic link is sent.
4. Following the valid link creates the authenticated database session.
5. The server resolves that authentication identity to exactly one active `app_user` Actor.
6. Current application roles are read from `app_user_roles` for authorization.

### First account activation

1. Admin creates a pending invitation for a specific email and intended initial application roles.
2. The invited person requests or receives a magic link.
3. Unknown-email account creation is accepted only while a valid pending invitation exists.
4. Successful invitation acceptance idempotently creates or links the authentication account to one application Actor and applies the accepted initial role assignments.
5. The invitation becomes consumed and cannot create another Actor/account relationship.

Invitation persistence shape, expiry details and email-delivery transport are later implementation decisions. The implementation must preserve single-use/idempotent behavior.

## Identity boundaries

### Person

`catalog_persons` remains the real-world participant/catalog concept. Historical persons may exist without accounts.

### Account

Better Auth `user/account/session` data represents authentication identity and session state.

### Actor

`app_users` remains the application Actor used for authorization and attribution. A production login-capable account maps to exactly one active Actor.

### Role assignment

`app_user_roles` remains the single source of truth for church-domain authorization roles. Multiple roles per Actor remain valid.

Priest/organist authorization roles do not silently mutate `catalog_persons.priest` or `catalog_persons.organist`. Person-catalog eligibility and account authorization remain distinct. Person-bound priest/organist workflows require a suitable linked Person.

## Account and role administration

Account provisioning and role administration are admin-owned.

Admin may:

- create or revoke pending invitations;
- activate/deactivate account-linked Actors according to later implementation rules;
- assign or remove accepted application roles.

The application must prevent an operation that would remove or deactivate the **last active admin**.

There is no seeded production demo account, shared default password or permanent bootstrap bypass. The first production admin is established by an explicit one-off bootstrap procedure that is removed or becomes inert after successful initialization.

## Authorization boundary

Production authorization is server-authoritative.

For protected state-changing actions the server must:

1. validate the authenticated session;
2. resolve the session to the linked `app_user` Actor;
3. require that Actor to be active;
4. load current roles from authoritative `app_user_roles` state;
5. enforce the accepted application permission rule for the requested action.

Client-supplied actor IDs, role names, or permission claims are never authorization authority in production.

UI visibility remains a convenience layer only. Route handlers, server actions, command handlers or equivalent server-side mutation boundaries perform their own authorization checks.

Role changes therefore affect subsequent protected operations without relying on a long-lived client-side role selector.

A deactivated Actor is rejected even when the browser still holds an otherwise valid session cookie. Immediate stored-session revocation may also be added by the implementation.

## Development/runtime boundary

`ORGANY_RUNTIME=memory` may retain seeded demo Actors and the development `Change user` selector for deterministic local/HUMAN acceptance testing.

Database-backed production operation must not expose that selector as an authentication mechanism. Production identity comes from the authenticated server session.

## Explicitly not selected

The first production auth slice does not select or require:

- password authentication;
- public self-registration;
- Google/GitHub/other social OAuth;
- passkeys;
- two-factor authentication;
- anonymous accounts;
- Better Auth Organization/multi-tenant behavior;
- a concrete transactional-email vendor;
- a hosting provider;
- multi-congregation identity behavior.

These may be revisited only by a later accepted decision.

## Audit and security boundary

Phase 31.26 defines business audit history for its accepted business domains. This auth decision does not silently redefine that scope.

Whether account invitations, role administration, sign-in failures, rate-limit events or other identity/security events belong in business audit history, a security log, or both remains a later explicit identity/security decision.

## External technical basis checked 2026-08-12

The decision was checked against current official documentation for:

- Next.js authentication and server-side authorization guidance;
- Better Auth Next.js support;
- Better Auth Drizzle adapter for PostgreSQL-backed data;
- Better Auth database-backed session management;
- Better Auth magic-link authentication including signup disabling/gating behavior.

The exact library version is intentionally not frozen by this documentation-only phase and must be pinned and reverified in the implementation PR.
