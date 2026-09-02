# Demo Stage D5 — synthetic Audit, read-only Accounts and Reset

Stage D5 extends the isolated public Demo after HUMAN PASS D4.

## Visible scope

The Demo keeps:
- Planning
- Plans
- History
- Catalog
- About
- Guide
- Preview role: Admin / Priest / Organist

When the preview role is **Admin**, two additional Demo-only views appear:
- Accounts
- Audit

Development remains hidden.

## Synthetic Audit

D5 adds a deterministic synthetic Audit fixture only.

It demonstrates:
- Planning Working change;
- Planning Final → Completed lifecycle change;
- account-role change;
- system maintenance success event.

The Demo Audit view reuses the existing audit-event presentation helper and styles where practical.

It does not:
- query Production audit_events;
- call the protected /admin/audit-history route;
- call a DB API;
- authenticate an Admin actor.

## Read-only Accounts

D5 also includes a small synthetic protected-account snapshot for Admin preview.

It contains only invented Demo identities such as:
- demo.admin
- demo.priest
- demo.organist
- demo.staff

No Production account, username, password, auth-user ID, person link or credential is read.

Mutation controls are displayed only as disabled presentation:
- Edit roles
- Deactivate
- Reset password

There is no provision/deactivate/role/password API path in the Demo Accounts component.

## Reset Demo

The persistent Demo banner contains **Reset Demo**.

Reset performs a browser reload only:

```ts
window.location.reload()
```

This intentionally returns all client-local Demo state to the deterministic fixture:
- preview role → Priest;
- local Planning edits removed;
- opened synthetic records reset;
- Melody Protection local overrides reset;
- Catalog filters/detail reset;
- D5 Admin view closed.

Reset uses no:
- fetch/API call;
- cookie;
- localStorage;
- sessionStorage;
- database write.

## Admin-only presentation

Accounts and Audit are visible only while `DemoPresentationRole === "admin"`.

They are not added to core `Workspace`, `PlanningRole` or `ActorIdentity`.

If the visitor leaves Admin preview while a D5 Admin view is open, the Demo closes that view and returns to Planning.

The underlying Demo data actor remains the same fixed non-admin memory actor established in D4.

## Persistence boundary

All previous fail-closed boundaries remain authoritative:
- Planning lifecycle writes denied;
- Catalog/knowledge writes denied;
- no Production API calls;
- no fake in-memory domain persistence.

D5 adds no new write client.

## Production isolation

Stage D5 changes:
- no DB migration;
- no Production API route;
- no Production auth route;
- no core PlanningRole;
- no core Workspace;
- no Production Admin page behavior;
- no Production deployment.

Production /admin/accounts and /admin/audit-history continue to require DB runtime and protected authentication.

## Acceptance

Before merge:
- D0–D4 acceptance remains green;
- synthetic Accounts/Audit fixtures are deterministic and Demo-namespaced;
- Audit presentation renders service and generic events;
- D5 UI contains no DB/API/auth/storage path;
- Reset is browser reload only;
- Accounts/Audit are Admin-preview-only;
- leaving Admin preview closes D5 Admin view;
- core Workspace/PlanningRole stay unchanged;
- existing Production Admin routes remain protected;
- direct Planning/Catalog writes remain denied;
- standard Production build/auth is green;
- secret-free Demo build/boot contains Reset Demo;
- full exact-head CI is green.

After merge:
- deploy exact merge SHA only to `organy-app-demo`;
- verify READY/exact SHA/public root/runtime errors;
- verify Production `organy-app` remains unchanged;
- STOP at explicit HUMAN checkpoint D5.
