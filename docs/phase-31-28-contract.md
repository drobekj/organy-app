# Phase 31.28 — Protected username/password authentication slice

Authority: Contract Gate #170 and merged Phase 31.27.

- DB runtime protected staff authentication is username + password.
- Better Auth 1.6.25 and @better-auth/drizzle-adapter 1.6.25 are pinned for this slice.
- Better Auth's required email is a server-generated internal synthetic value only; it is never requested from or displayed to staff and is not a login identifier.
- No public privileged signup exists.
- Protected auth user maps one-to-one to an active app_users Actor; app_user_roles remains the only church-domain role authority.
- DB protected authorization resolves server-side session → linked Actor → current roles. Client user IDs are not authority; a requested role is accepted only when currently assigned to that Actor.
- Memory runtime retains deterministic Change user. DB runtime does not.
- Staff can sign out and change their own password.
- Initial/local protected accounts are created by an explicit server-side bootstrap using externally supplied passwords.
- Congregation nickname voting, admin account-management UI, password reset, forced first change, OAuth/passkeys/2FA, deployment and security logging are outside this phase.
