# Phase 31.28 — protected staff username/password authentication

Authority: Contract Gate #168. Baseline: main 10bec3d6488bd34a758ba2e8732766a5e50d5aea.

This phase implements protected admin/priest/organist username/password authentication for DB runtime. Public protected signup is disabled. Better Auth 1.6.25 uses an internal synthetic email only as a storage requirement; it is not requested, displayed, verified, used for login, or used for recovery. Authenticated sessions map one-to-one to an active app_users Actor, while app_user_roles remains the sole church-domain role authority. Client actor IDs are ignored for DB authorization; a requested role is only honored after the server verifies that it is currently assigned. Memory runtime keeps Change user for deterministic development and regression testing.

The slice includes login, logout, own password change, explicit initial bootstrap, admin-authorized server provisioning, auth schema/migration, and session-to-Actor authorization for Planning Lifecycle, interaction/knowledge, and catalog mutations. Congregation-member nickname voting, recovery email, OAuth/passkeys/2FA, deployment, hosting, and security/audit expansion remain outside Phase 31.28.

Never merge without exact user command MERGOVAT.
