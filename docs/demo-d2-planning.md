# Demo Stage D2 — interactive read-only Planning

Stage D2 is the first interactive Demo application surface. It extends the isolated D1 `memory + demo` runtime and does not change the normal Production runtime.

## Visible scope

D2 exposes:
- Planning
- Plans
- History
- About
- Guide

Catalog and Development stay hidden until later approved stages.

The Demo banner is persistent:

```text
Demo mode · Changes are temporary and are never saved.
```

## Synthetic Planning snapshot

The D2 read model contains representative synthetic data only:
- one Working plan;
- one Final plan;
- two Completed Services;
- multiple priests and organists;
- Czech and Polish songs;
- organist repertoire entries suitable for candidate lookup;
- historical songs suitable for demonstrating availability/non-repetition behavior.

The newest Completed Service is the source for Start New Plan Priest and Organist defaults, matching the normal Planning contract.

## Local interaction

A new draft and an opened Working plan remain locally editable in React state:
- service date/time/language;
- Priest and Organist;
- Melody Protection effective filtering;
- Antiphon and Topic;
- rows;
- candidate lookup/selection;
- row notes;
- row ordering/add/remove/clear.

Final and Completed records remain locked according to the existing lifecycle/editor semantics.

Navigating away/reopening a Working fixture or refreshing the browser restores the original Demo snapshot because local changes are never written into the Demo read model.

## Persistence boundary

`DemoPlanningLifecycleClient` is a read model, not an in-memory persistence service.

Read methods return cloned fixture data.

All lifecycle mutations are denied through the D0 central boundary:
- save Working;
- finalize;
- reopen Final;
- complete/store;
- delete plan;
- update Completed;
- delete Completed.

Every denied operation throws `DemoWriteDeniedError` with code `demoReadOnly` before a mutation callback can execute.

There is therefore no fake success and no domain persistence, even inside the browser memory runtime.

## UI boundary

Lifecycle controls remain visible to demonstrate product capability but are disabled in Demo:
- Save working plan
- Finalize plan
- Delete saved plan
- Edit Final Plan
- Store Service
- Delete Saved Plan
- Save completed changes
- Delete completed record

The disabled title explains that the action would change stored data.

## Network and Production isolation

D2 keeps all D1 invariants:
- no Demo authenticated Production actor;
- no Demo PlanningRole;
- no Production auth bypass;
- no database migration;
- no Production credentials in the Demo Vercel project;
- Demo runtime is `memory + demo`;
- protected DB API remains unavailable;
- standard Production root/auth and all current Production mutations remain unchanged.

## Acceptance

Before merge:
- D0 and D1 safety tests remain green;
- D2 read model returns the expected Working/Final/Completed fixture;
- Start New Plan defaults are derived from the newest Completed fixture;
- Demo repertoire supports candidate exploration;
- all lifecycle mutation methods fail closed and leave the snapshot unchanged;
- D2 UI renders Planning/Plans/History and disabled lifecycle controls;
- Catalog/Development are inaccessible from D2;
- standard Production build/root auth remains green;
- secret-free Demo build/boot remains green;
- full exact-head CI is green;
- no migration or Production API/role change exists.

After merge:
- deploy the exact merged SHA only to `organy-app-demo`;
- verify READY, public D2 root, no runtime errors and unchanged `organy-app` Production;
- stop at explicit HUMAN checkpoint D2.
