# Phase 31.15 Contract — Current-service melody occupancy and collision validation

## Authority

Approved by the user with `dál` on 2026-08-05.

Baseline:

```text
main 93f1e1f836cadca5d286a5b9b2678334614d9ee0
```

Implementation authority: issue #135.

## Goal

Distinguish two different reasons why a melody class cannot be selected:

1. completed or other saved working/final use inside the non-repetition window is a hard class-wide exclusion;
2. use by another row of the currently edited service remains visible inside the hard-filtered search universe but is unavailable for selection.

The same phase detects authoritative melody-class collisions already present across selected rows. It preserves colliding Working drafts but prevents finalization until the collision is removed.

## Candidate occupancy contract

Current-row usage carries a stable editor row ID and current visible label:

```ts
type CandidateUsage = {
  songId: string;
  serviceDate: string;
  source: "current";
  rowId: number;
  rowLabel: string;
};
```

Every candidate exposes:

```ts
type CandidateAvailability =
  | { kind: "available" }
  | {
      kind: "occupiedByCurrentRows";
      rows: Array<{ rowId: number; label: string }>;
    };
```

Rules:

- completed/working/final usages remain hard exclusions under the existing date-window and `currentPlanId` rules;
- `current` usages are independent of the date window;
- current occupancy is resolved by authoritative melody class, not number;
- occupied candidates remain in normal deterministic order after all hard filters;
- all occupying rows are returned in deterministic order;
- the active row is omitted from current usages, so its own previous class remains available;
- remove/replace/reorder invalidates stale candidate results and recomputes occupancy;
- a retained language-invalid selection still occupies its class.

## Collision contract

Collision detection groups selected authoritative songs by current `melodyClassId` and reports every group with at least two rows.

It covers:

- the same concrete song in multiple rows;
- same-language equivalents;
- Czech/Polish equivalents;
- groups with more than two rows.

Rows without a song or without an authoritative melody class are ignored rather than assigned invented classes.

Every affected row receives a local issue. A concise shared reason is displayed near Finalize.

## Lifecycle contract

- Working save is not blocked by melody collision.
- Saved colliding selections are preserved exactly and collision markers reappear after authoritative hydration.
- Finalize is blocked locally.
- `finalizeWorkingSet` independently reloads current authoritative class memberships through a read-only provider and rejects collisions with `invalidInput` plus one issue path per affected row.
- Client-provided class metadata is never trusted for authoritative finalization.
- Removing the collision restores finalization.

## Persistence boundary

The provider reads only existing Reference tables:

```text
reference_catalog_songs
reference_song_melody_memberships
```

No migration, Planning schema change, copied class ID, trigger, or persisted validation result is introduced.

## Minimal UI boundary

The existing candidate popup only gains:

- disabled selection for occupied candidates;
- a concise occupying-row reason;
- accessible unavailable meaning;
- a defensive selection-handler guard.

Candidate-list redesign, auto-scroll, expansion policy and melody Detail remain later phases.

## Acceptance

The implementation must prove hard blocking, current occupancy, multiple occupiers, active-row self-availability, immediate release/re-occupation, language-invalid occupancy, all collision forms, all-row markers, Working save/reload, local and server finalization rejection, restored finalization, disabled pointer/keyboard/programmatic selection, unchanged ordering and hard filters, no schema migration, typecheck, complete tests and production build.
