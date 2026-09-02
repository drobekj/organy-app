# Demo Stage D3 — read-only Catalog and knowledge

Stage D3 extends the isolated `memory + demo` runtime after HUMAN PASS D2.

## Visible scope

Demo navigation now exposes:
- Planning
- Plans
- History
- Catalog
- About
- Guide

Development remains hidden.

## Catalog browsing

The existing Catalog workspace is reused in a dedicated read-only Demo mode.

Visitors can interact with:
- Organist
- Language
- Antiphon
- Topic
- Available / Unavailable
- Songs / Melodies
- candidate Detail

The D3 synthetic read adapter provides deterministic:
- Czech and Polish songs;
- several melody classes, including cross-language classes;
- per-Organist repertoire membership;
- available/unavailable partitions;
- aggregate preference shading;
- Antiphon signal;
- Topic signal;
- authoritative melody-member detail.

No Production database or Production snapshot is used.

## Mutation boundary

Catalog and knowledge remain fully read-only.

The UI explicitly disables/hides mutation surfaces in Demo:
- personal preference persistence;
- repertoire Add/Remove;
- Antiphon Reference-song editing;
- Melody Edge editor;
- any song/person mutation surface.

In addition, the Demo client fail-closes direct mutation calls through the D0 central write boundary:
- preference save;
- repertoire set;
- Melody Edge add;
- Melody Edge remove.

All throw `DemoWriteDeniedError` / `demoReadOnly` before any mutation callback.

## Defense in depth

`CatalogWorkspace` receives `readOnlyDemo=true` in Demo.

This independently prevents mutation behavior even if a future change accidentally changes runtime assumptions:
- no DB Antiphon recommendation client;
- no preference read/write effect;
- no repertoire management capability;
- no Antiphon recommendation edit capability;
- no Melody Edge editor.

The normal Production call site leaves `readOnlyDemo=false`, preserving current behavior.

## Isolation invariants

D0–D2 invariants remain:
- Demo runtime = `memory + demo`;
- no Production auth secrets;
- no DB/Neon credentials;
- no protected Production API access;
- no Demo PlanningRole or authenticated fake actor;
- no DB migration;
- no Production API/auth route change;
- no Production deploy.

## Acceptance

Before merge:
- D0/D1/D2 acceptance remains green;
- D3 available/unavailable Catalog partition works;
- Mixed mode exposes cross-language authoritative melody detail;
- Antiphon signal is deterministic;
- direct Catalog/knowledge mutations fail closed and do not change fixture state;
- Catalog is visible in Demo;
- Development remains hidden;
- readOnlyDemo guards every existing Catalog mutation path;
- standard Production Catalog behavior remains unchanged;
- standard Production build/root auth passes;
- secret-free Demo build/boot passes;
- full exact-head CI is green.

After merge:
- deploy exact merge SHA only to `organy-app-demo`;
- verify READY/public Catalog/runtime isolation/errors;
- verify `organy-app` Production remains unchanged;
- STOP at HUMAN checkpoint D3 with explicit test instructions.
