# Phase 31.24 — Conflict-safe non-repetition period administration

Authority: Contract Gate #159; REQ-009, REQ-010, REQ-011; WF-009, WF-010, WF-011; NR-001..NR-004.

Baseline: `main` at `c34419931e78f219c136456369fbc05535852216`.

## Contract

- The shared melody non-repetition period defaults to 2 calendar months and remains the period used by candidate hard filtering.
- Any active role may read the current value; only admin may mutate it.
- A mutation accepts only a finite non-negative integer number of calendar months.
- Before persistence, all saved non-completed Working and Final plans are evaluated under the proposed period.
- Two distinct saved plans conflict when their service dates are within the proposed calendar-month window and they contain concrete Reference songs in the same authoritative Reference melody-equivalence class.
- The relation is melody-based and therefore applies across Czech/Polish song identities when they share the class.
- Rows without a concrete song, unresolved/historical song snapshots without current authoritative Reference melody membership, and repeated use inside only one plan do not create a cross-plan configuration conflict.
- Completed-service records never block a configuration change.
- A conflict rejects the mutation, leaves the prior value unchanged, and reports deterministic blocking plan id/status/date plus melody class information.
- No saved set is automatically altered or deleted. Removing one or more blockers and retrying is the only accepted unblock path.
- A conflict-free update is persisted transactionally and subsequent candidate queries use the new value.
- Knowledge administration displays the current runtime-authoritative value. Admin gets an explicit integer input/save action with visible success/error state; non-admin sees the value read-only.
- Phase 31.15 current-service occupancy/collision behavior is separate and unchanged.

## Exclusions

No candidate ordering, repertoire, preference threshold, Antiphon/Topic signal, melody-detail, completion-policy, auth, catalog-data, thematic-data or automatic repair change.

## Merge rule

Keep the implementation PR Draft until HUMAN PASS. Never merge without the user's exact `MERGOVAT`.
