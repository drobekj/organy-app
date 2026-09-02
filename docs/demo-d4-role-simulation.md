# Demo Stage D4 — presentation-only role simulation

Stage D4 extends the isolated public Demo after HUMAN PASS D3.

## Presentation roles

The public Demo now offers three local preview roles:
- Admin
- Priest
- Organist

The selected role is represented by the dedicated `DemoPresentationRole` type.

It is not added to:
- `PlanningRole`;
- `ActorIdentity`;
- authentication/session state;
- active-role cookies;
- API request identities.

The underlying Demo data actor stays pinned to the existing non-admin `demo-priest-user` memory identity.

Refreshing the browser resets the preview role to Priest.

## Visible role semantics

The preview role changes only presentation/editor behavior.

### Admin
- Working editor is available.
- Completed records use Admin local editor semantics.
- Edit Final Plan is shown where the standard Admin view would show it.
- Demo Melody Protection allows any temporary value 0–12 for the selected Organist.

### Priest
- Working editor is available.
- Final lifecycle capability presentation follows the normal Priest permission set.
- Demo Melody Protection uses the selected Organist minimum and disables lower values.

### Organist
- Working editor is available.
- Finalize/Store capability remains unavailable according to the normal Organist permission set.
- Demo Melody Protection behaves as a simulated own setting and is freely adjustable 0–12 locally.

## Persistence remains impossible

Role preview never changes the D0 capability policy.

All lifecycle controls that would persist data remain disabled in Demo.

Direct Planning and Catalog mutation clients still throw `DemoWriteDeniedError` / `demoReadOnly` before any mutation callback.

The D4 Melody Protection panel is Demo-only and contains no API client, cookie, localStorage or persistence path.

## D3 compatibility

Catalog remains visible for Demo exploration regardless of preview role and stays `readOnlyDemo=true`.

Development stays hidden.

Guide and contextual role-sensitive presentation may follow the selected preview role.

## Production isolation

Stage D4 adds:
- no migration;
- no Production API route;
- no auth change;
- no Production role change;
- no Production deployment.

Standard Production keeps its authenticated `PlanningRole` and `ActorIdentity` flow unchanged.

## Acceptance

Before merge:
- D0–D3 acceptance remains green;
- D4 role policy matches Admin/Priest/Organist behavior;
- Demo role switch does not change the underlying actor;
- no Demo preview role reaches cookies/auth/API identity;
- Demo role switch resets on refresh;
- direct Planning/Catalog writes remain denied for every preview role;
- local Demo Melody Protection has no API/persistence path;
- standard Production build/auth and all regressions are green;
- secret-free Demo build/boot shows the role simulator;
- full exact-head CI is green.

After merge:
- deploy exact merge SHA only to `organy-app-demo`;
- verify public runtime and zero errors;
- verify `organy-app` Production remains unchanged;
- STOP at explicit HUMAN checkpoint D4 with exact test instructions.
