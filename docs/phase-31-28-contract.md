# Phase 31.28 — protected staff username/password authentication

Authority: Contract Gate #168. Baseline: main 10bec3d6488bd34a758ba2e8732766a5e50d5aea.

This phase implements protected admin/priest/organist username/password authentication for DB runtime. Public protected signup and email/password sign-in are disabled. Better Auth 1.6.25 uses an internal synthetic email only as a storage requirement; it is not requested, displayed, verified, used for login, or used for recovery. Authenticated sessions map one-to-one to an active app_users Actor, while app_user_roles remains the sole church-domain role authority. Client actor IDs are ignored for DB authorization; a requested role is only honored after the server verifies that it is currently assigned. Memory runtime keeps Change user for deterministic development and regression testing.

The slice includes login, logout, own password change, explicit initial bootstrap, admin-authorized server provisioning, auth schema/migration, and session-to-Actor authorization for Planning Lifecycle, interaction/knowledge, and catalog mutations. Congregation-member nickname voting, final admin-facing account/role administration UI, credential recovery/delivery policy, OAuth/passkeys/2FA, deployment, hosting, and security/audit expansion remain outside Phase 31.28.

Implementation status: protected staff authentication is implemented on the Phase 31.28 feature branch with Better Auth 1.6.25 / @better-auth/drizzle-adapter 1.6.25, Drizzle ORM 0.45.2 / drizzle-kit 0.31.10, migration 0018, real PostgreSQL session acceptance, username-only protected sign-in, logout, own-password change, bootstrap/server provisioning, and server-side current-role authorization. Final merge still requires exact-head gates, HUMAN PASS, and explicit MERGOVAT.

Never merge without exact user command MERGOVAT.
