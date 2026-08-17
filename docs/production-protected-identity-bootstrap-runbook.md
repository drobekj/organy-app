# Production protected identity bootstrap

Contract Gate #196 — Phase 31.41.

## Purpose

This runbook covers the one-time protected Production identity bootstrap after the accepted Phase 31.40 deployment. It is not part of normal deployment and it is not a demo seed.

The Production database is expected to begin this phase with the accepted Reference/configuration snapshot and no protected operational identity rows. The command below has **no demo/default identity fallback**. Every Actor, username, role and optional Person linkage must be supplied explicitly by the authorized operator.

The first required identity is the initial protected admin. The same reviewed mechanism can then establish the current priest and organist identities before normal administrative handoff. A priest or organist role requires an explicit matching Person linkage and eligibility declaration; the bootstrap never invents a Person.

## Secret boundary

Real passwords, database credentials and `BETTER_AUTH_SECRET` must never be committed, copied into an issue/PR, or pasted into chat. Keep them only in the authorized operator shell/environment for the duration of the operation.

Use the Neon **direct/unpooled** Production connection as `DATABASE_URL_UNPOOLED`. Do not substitute the ordinary pooled request-runtime URL. The bootstrap internally points its Better Auth provisioning connection at the same reviewed direct target for this one operator process only.

The operator also supplies the already accepted stable Production `BETTER_AUTH_URL` and the existing Production `BETTER_AUTH_SECRET`. Neither value is printed by the command.

## Explicit non-secret identity inputs

For each protected identity provide:

- `ORGANY_BOOTSTRAP_ACTOR_ID` — explicit stable application Actor id;
- `ORGANY_BOOTSTRAP_DISPLAY_NAME` — Actor display name;
- `ORGANY_BOOTSTRAP_USERNAME` — protected username;
- `ORGANY_BOOTSTRAP_ROLES` — comma-separated subset of `admin,priest,organist`.

Only when the identity needs priest/organist planning eligibility, also provide all of:

- `ORGANY_BOOTSTRAP_PERSON_ID`;
- `ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME`;
- `ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY` — comma-separated subset of `priest,organist`.

A requested `priest` role requires `priest` Person eligibility. A requested `organist` role requires `organist` Person eligibility. An admin-only identity does not require a Person and the bootstrap must not invent one.

## Password input

`ORGANY_BOOTSTRAP_PASSWORD` is required only for the authorized `--apply` execution. It must contain 8–128 characters. Do not place a real example value in documentation, shell history shared with others, Git, chat, screenshots, or provider environment variables.

## Mandatory dry-run

With all required non-secret identity inputs supplied, first run:

```text
npx tsx scripts/production-protected-identity-bootstrap.ts
```

The dry-run is read-only. It must print `Protected Production identity bootstrap preflight: PASS` before any write is authorized.

The preflight rejects:

- a schema other than the reviewed 32-table Production schema;
- Neon Auth/Data API state;
- a Reference/configuration snapshot different from the accepted Phase 31.40 state;
- unrelated operational data;
- partial/unlinked protected identity state;
- congregation nickname Actors in this protected bootstrap boundary;
- non-credential or ambiguous Better Auth account state;
- lingering auth sessions/verifications;
- conflicting Actor id, username or Person state;
- missing or implicit identity inputs.

If any of those checks fails, **STOP**. Do not repair Production ad hoc and do not replace the command with the local/demo `db:bootstrap:auth` script.

## Authorized apply

Only after the Phase 31.41 repository gates pass and the separate HUMAN Production identity checkpoint authorizes the real identity write, supply `ORGANY_BOOTSTRAP_PASSWORD` in the local operator environment and run:

```text
npx tsx scripts/production-protected-identity-bootstrap.ts --apply
```

The command creates exactly one requested protected identity per invocation:

1. optional explicitly supplied Person;
2. active application Actor;
3. authoritative `app_user_roles` assignments;
4. Better Auth credential user/account with an internal synthetic email;
5. one-to-one protected Account↔Actor link;
6. removal of the signup-created session.

No preference, repertoire, manual recommendation, congregation nickname voter, service/planning data, demo fixture or legacy import is created.

## Idempotence / rerun rule

A rerun is accepted only when the requested identity already matches exactly: Actor display name, active state, Person linkage/eligibility, username, protected roles, one-to-one link and one credential account.

In that exact state the bootstrap performs no identity mutation and **does not overwrite the existing password**, even if a different `ORGANY_BOOTSTRAP_PASSWORD` is present in the operator environment.

Any partial or conflicting state is a STOP condition rather than an implicit repair.

## Post-bootstrap verification

After the initial admin is created, Phase 31.41 acceptance must verify through the stable Production alias:

- username/password sign-in succeeds;
- server-side session resolution returns the intended active Actor;
- current authoritative role includes `admin`;
- synthetic internal email cannot become the staff login identifier;
- public protected signup remains disabled;
- sign-out succeeds and invalidates the session;
- unauthenticated protected access remains rejected.

Connected read-only Neon verification must additionally confirm that only the explicitly authorized protected identity rows were added and that the Phase 31.40 Reference/configuration snapshot is unchanged.

## Subsequent priest / organist bootstrap

Before handoff, repeat the same **dry-run → HUMAN-authorized `--apply` → verification** sequence separately for the current priest and organist, with their explicitly supplied Person linkage and eligibility. Do not batch unknown identities and do not infer a Person from a role or username.

Once the initial admin and required staff identities exist, ordinary account/role administration uses the accepted Phase 31.30 application workflow. This bootstrap is not a permanent administrative backdoor and is not rerun during deployment.

## Explicit exclusions

Phase 31.41 does not authorize congregation nickname voters, preferences, repertoire, manual melody/antiphon knowledge, Working/Final/Completed services, legacy imports, public signup/recovery, OAuth/passkeys/2FA, Git auto-deploy, provider-plan changes, custom DNS, monitoring/alerting, scheduled backup retention, or release automation.