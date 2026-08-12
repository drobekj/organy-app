# Phase 31.27 — resolve production authentication and account/role model

Baseline: `main` `2a76dfcf8aedb72012e71491457e6484d7ab8bf2` after merged Phase 31.26. The two commits after the Phase 31.26 merge are an accidental placeholder create/delete pair with zero net tree diff.

Authority: Contract Gate #166; `docs/auth-account-role-model.md`; REQ-012; backlog RP-001/RP-002; current Account/Actor/Person/RoleAssignment separation; user approval on 2026-08-12.

## Scope

Phase 31.27 is documentation/technical-decision work only.

It selects the first production authentication direction as:

- Better Auth;
- existing PostgreSQL direction through Better Auth Drizzle adapter;
- database-backed sessions;
- passwordless email magic-link sign-in;
- invitation-only account creation;
- `app_users` as application Actor and `app_user_roles` as the sole church-domain role source of truth;
- admin-owned invitations and role administration with a last-active-admin safeguard;
- server-side session → active Actor → current roles authorization for production mutations;
- demo `Change user` retained only in memory development/test runtime.

## Explicit exclusions

No auth package installation, version pin, physical auth schema, migration, login UI, invitation UI, email sending, concrete email vendor, hosting decision, OAuth/password/passkey/2FA implementation, security telemetry, production cutover, or multi-congregation behavior is implemented.

## Acceptance

- `docs/production-auth-decision.md` records the accepted technical/product direction;
- `docs/auth-account-role-model.md` no longer leaves provider/login/account creation/role ownership unresolved;
- architecture/implementation-preparation/roadmap stop describing production auth approach as wholly undecided while still deferring implementation mechanics;
- Account, Actor, Person and application RoleAssignment remain distinct;
- `app_user_roles` remains authoritative for priest/organist/admin/congregation_member roles;
- production authorization never trusts client role/actor claims;
- documentation-only final diff;
- fresh review finds no blocking inconsistency.

Never merge without exact user command `MERGOVAT`.
