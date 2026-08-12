# Phase 31.27 — resolve production authentication and account/role model

Baseline: `main` `2a76dfcf8aedb72012e71491457e6484d7ab8bf2` after merged Phase 31.26. The two commits after the Phase 31.26 merge are an accidental placeholder create/delete pair with zero net tree diff.

Authority: Contract Gate #166; `docs/auth-account-role-model.md`; REQ-012; backlog RP-001/RP-002; current Account/Actor/Person/RoleAssignment separation; user correction on 2026-08-12.

## Scope

Phase 31.27 is documentation/technical-decision work only.

It selects the first production authentication and voter-identity direction as:

- login-capable protected accounts for admin, priest, and organist;
- classic username + password sign-in for those accounts;
- no public self-registration for admin/priest/organist;
- admin-owned provisioning of protected accounts, including username and initial password;
- logged-in protected-account users may change their own password;
- first production setup provisions the initial admin and the current priest/organist protected accounts before handoff;
- Better Auth remains the selected authentication/session candidate with PostgreSQL/Drizzle-backed database sessions, username support, password credentials, and public signup disabled, subject to implementation proof that its mandatory internal email field does not leak into the required user-facing login/provisioning flow;
- `app_users` remains the application Actor concept and `app_user_roles` remains the sole church-domain role source of truth;
- congregation-member voting uses a nickname-only lightweight Actor with the `congregation_member` role and **no login-capable Account, password, or identity verification**;
- entering a nickname creates or reuses that nickname voter profile; the system intentionally does not prevent one human from using multiple nicknames and does not prove ownership of a nickname;
- a nickname-only congregation Actor may mutate only that profile's own accepted preference votes and has no planning, repertoire, knowledge, or account-administration permissions;
- protected production mutations use server-side authenticated session → active Actor → current roles authorization;
- demo `Change user` remains only in memory development/test runtime.

## Explicit exclusions

No auth package installation/version pin, physical auth schema/migration, login/account-admin UI, exact first-admin bootstrap tooling, password-recovery/reset policy, nickname normalization/UI persistence details, deployment cutover, hosting choice, OAuth/passkey/2FA, security telemetry, or multi-congregation behavior is implemented.

Magic-link/email login, public privileged signup, and password-protected congregation-member accounts are explicitly **not** the selected first production behavior.

## Acceptance

- `docs/production-auth-decision.md` records the corrected username/password and nickname-only product direction;
- `docs/auth-account-role-model.md` distinguishes protected login-capable Accounts from nickname-only congregation Actors;
- architecture/implementation-preparation/roadmap no longer describe invitation/magic-link behavior as the selected direction;
- Account, Actor, Person and application RoleAssignment remain distinct;
- `app_user_roles` remains authoritative for church-domain roles, including the automatically assigned `congregation_member` role for nickname-only voter Actors;
- production protected authorization never trusts client role/actor claims;
- congregation-member nickname identity is explicitly non-authenticated and abuse-resistant identity proof is out of scope by design;
- documentation-only final diff;
- fresh review finds no blocking inconsistency.

Never merge without exact user command `MERGOVAT`.
