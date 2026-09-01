# Demo Stage D0 safety contract

Status: approved foundation contract. Stage D0 only.

## Scope

Stage D0 creates safety primitives and regression acceptance only.

It does **not** create:
- a Demo route,
- Demo UI,
- a Demo Vercel project,
- a Demo authenticated user or actor,
- a new PlanningRole,
- a database migration,
- a Production API bypass,
- a Production runtime behavior change.

## Independent axes

The application keeps two independent concepts:

```text
DATA BACKEND
memory | db

EXPERIENCE
standard | demo
```

Production remains `db + standard`.

Future Demo is expected to be `memory + demo`, but Stage D0 does not select or expose that experience at runtime.

## Production boundary audit

### Root page

`app/page.tsx`:
- resolves DATA BACKEND through `resolveApplicationRuntimeMode()`;
- `memory` enters the existing deterministic development runtime;
- `db` resolves the protected Better Auth user with `resolveProtectedUser()`;
- protected-auth failure redirects to `/sign-in`.

Stage D0 must not import Demo safety code into this page.

### Protected APIs

The following existing Production APIs must continue to resolve the authenticated actor through `resolveProtectedActor()` before protected work:

- `/api/catalog`
- `/api/interaction`
- `/api/planning-lifecycle`

No Demo header, query parameter, client-supplied user id, fake Admin, anonymous branch, or experience bypass is permitted.

Important: Planning read/reconciliation operations are not safe Demo snapshot APIs. In the current DB runtime, `getWorkspaceSnapshot`, `listPlanningSets`, and `listCompletedRecords` can reconcile overdue Final plans to Completed records and write audit events. Future Demo therefore must not call these Production endpoints anonymously.

### Current write boundaries

Persistent mutation authority remains in the existing role/application services and protected routes, including:

- Planning lifecycle: save/finalize/reopen/complete/delete/update Completed.
- Catalog: person persistence and song activation.
- Interaction: preferences, repertoire, Melody Protection, Antiphon recommendation, Melody Edges/melody structure.
- Protected Accounts: Admin-only account/person administration.

Stage D0 does not alter any of these paths.

## Demo capability policy

`src/application/demo-safety.ts` defines the future Demo global capability ceiling.

Demo may support local draft editing, but it has:
- no protected Production API access;
- no persistent Planning writes;
- no Catalog writes;
- no preference writes;
- no repertoire writes;
- no Melody knowledge writes;
- no persistent Melody Protection writes;
- no account-administration writes;
- no Production Audit History access.

This global policy is intentionally separate from Priest/Organist/Admin role permissions.

## Fail-closed write boundary

Future Demo mutation adapters must use the D0 persistent-write boundary.

A Demo persistent mutation:
- throws `DemoWriteDeniedError`;
- uses stable code `demoReadOnly`;
- fails before its mutation callback executes;
- must never return a fake success/no-op success.

The normal `standard` experience remains pass-through so existing role/business authorization remains authoritative.

Stage D0 deliberately leaves this module unreferenced by Production pages and Production API routes.

## Stage D0 regression acceptance

D0 is acceptable only when exact-head validation proves:

1. DATA BACKEND remains exactly `memory | db`.
2. EXPERIENCE is independently `standard | demo`.
3. `PlanningRole` does not contain Demo.
4. `ActorIdentity` remains based on `PlanningRole`; Demo is not an authenticated actor.
5. Production root retains protected sign-in redirect behavior.
6. Anonymous Catalog, Interaction, and Planning Lifecycle requests are rejected.
7. Admin current persistent authorization still works.
8. Priest lifecycle authorization still works.
9. Organist persistent Melody Protection still works.
10. Demo write boundary fails before mutation execution.
11. Existing Production UI/API files do not import the Demo safety module.
12. Full existing CI/typecheck/tests/build remain green.
13. No schema migration is introduced by D0.
