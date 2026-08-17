# Production protected staff handoff

Phase 31.42 continues the Production identity handoff after the initial admin/organist established by Phase 31.41.

## Purpose

The accepted production access model requires the initial admin and the current priest/organist protected Accounts to exist before normal production handoff. Phase 31.41 established the first real protected Production identity and verified the reusable Production-safe bootstrap boundary. Phase 31.42 uses that already reviewed mechanism to establish the current priest as a separate protected identity without changing application code, schema, provider configuration, Reference data, or unrelated operational data.

The Production identity write remains a separate HUMAN checkpoint. Real identity values are never inferred from role names or historical data, and real passwords/database credentials are never committed or pasted into chat.

## Accepted starting state

Before the Phase 31.42 HUMAN write, connected read-only verification must confirm:

- exactly one existing protected Production identity from Phase 31.41;
- that Actor remains active with the already accepted `admin` and `organist` roles;
- exactly one protected credential Account and one Account↔Actor link;
- no active auth session or verification row;
- exact accepted Reference/configuration snapshot;
- no service/planning/history, preferences, repertoire, nickname voter, or manual recommendation data;
- no Neon Auth/Data API state;
- the stable Vercel Production alias remains healthy and no merge-triggered deployment has appeared.

Any unexpected identity, role, session, operational row, provider change, or Reference drift is a STOP condition.

## Current priest identity inputs

The operator must explicitly accept all non-secret identity values before the dry-run:

- stable Actor id;
- display name;
- protected username;
- role exactly `priest` unless another protected role is separately justified and accepted;
- stable Person id;
- Person display name;
- Person eligibility including `priest`.

The bootstrap must not infer or invent the current priest from legacy people, names, usernames, or role vocabulary.

## Repository acceptance before HUMAN write

The implementation PR remains Draft while repository acceptance runs. Exact-head checks must prove that the existing Production-safe bootstrap supports a second protected identity beside an existing admin identity, including:

- read-only dry-run creates no second identity;
- `--apply` creates exactly one separately supplied priest Person/Actor/credential/link;
- existing admin/organist identity and roles remain unchanged;
- priest Person eligibility is explicit and authoritative for the Person linkage;
- bootstrap-created signup session is removed;
- exact rerun is a no-op and does not overwrite the established priest password;
- Reference/configuration data remain unchanged;
- unrelated operational data remain empty;
- Phase 31.41 and earlier relevant regressions, typecheck, tests, and production build remain green.

## HUMAN Production checkpoint

After repository/provider/Review gates pass, the operator supplies the real priest identity values and chooses the initial application password outside Git and chat.

Use the same secret-safe direct/unpooled Neon CLI flow already accepted in Phase 31.41. The connection string must be acquired directly into the local process environment and must not be copied through the clipboard or printed. The isolated local bootstrap process uses a fresh temporary `BETTER_AUTH_SECRET`; the deployed Vercel Production `BETTER_AUTH_SECRET` remains unchanged.

Required sequence:

1. set the accepted priest identity values in the local operator environment;
2. obtain the Neon direct/unpooled Production URL without displaying it;
3. run `npx tsx scripts/production-protected-identity-bootstrap.ts` and require preflight PASS;
4. obtain a separate explicit HUMAN authorization for the Production identity write;
5. type the new Organy priest password locally; never paste it into chat;
6. run the same script with `--apply`;
7. immediately clear all temporary connection/password/bootstrap environment values.

No provider plan, deployment, Vercel environment value, database schema, Reference data, or other business data is changed by this identity operation.

## Post-HUMAN acceptance

Connected Neon read-only verification must confirm:

- exactly two protected Production Actors in total: the existing Phase 31.41 identity plus the newly accepted priest identity;
- the existing admin/organist Actor, roles, Person linkage, username and credential/link cardinality are unchanged;
- the new priest Actor is active, linked one-to-one to exactly one credential Account, and has exactly the accepted protected role set;
- the new priest Person linkage is explicit and `priest=true` with no invented organist eligibility;
- no bootstrap-created auth session or verification row remains;
- exact Reference/configuration snapshot remains unchanged;
- unrelated operational tables remain empty.

The current priest then signs in through the stable Production alias using username + password. While signed in, connected verification must resolve the session to the intended priest Actor and current authoritative `priest` role. After sign-out, the session count returns to zero and unauthenticated protected access remains rejected.

## Handoff boundary

After the initial admin/organist and current priest protected identities are accepted, normal future protected Account/RoleAssignment administration uses the already merged Phase 31.30 admin workflow. The Production bootstrap is not a permanent administration path and is not part of ordinary deployment.

Phase 31.42 does not create congregation nickname voters, preferences, repertoire, manual melody/antiphon knowledge, Working/Final/Completed services, legacy imports, public signup/recovery, OAuth/passkeys/2FA, Git auto-deploy, custom DNS, monitoring/alerting, scheduled backup retention, or release automation.
