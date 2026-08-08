# Phase 31.17 — inline melody-class detail and equivalent navigation

Approved by the user on 2026-08-06. Baseline: `fb23295fba224d0ccbc645b77358d5e51c2f19ff`.

## Contract

- one local Planning expansion: candidate list, candidate detail, selected-song detail, or none;
- complete authoritative melody-class members with concrete opened song first;
- safe score links remain available for informational members;
- candidate detail navigates to an equivalent candidate without selecting it;
- selected-song detail replaces only through a fresh hard-filtered eligibility snapshot;
- replacement preserves note and updates local occupancy;
- language-disabled, occupied and hard-filtered members remain explanatory and unselectable;
- historical fallback never invents a melody class;
- memory demo projects only data it actually owns;
- no theme UI, schema, migration or Planning persistence change.

## Acceptance

Focused Phase 31.17 tests, all prior phase gates, typecheck, complete tests and production build must pass. One real browser HUMAN checkpoint is required before Ready for review.

## HUMAN checkpoint status — changes requested

The 2026-08-06 browser checkpoint confirmed items 1–10 functionally, but approval is withheld until the requested compact, invariant two-field Planning-row protocol is implemented and rechecked.

The compact-row correction must pass an isolated runner-independent refinement gate before the replacement browser checkpoint is issued.
