# Phase 31.14 — concrete-song authoritative Planning candidates

## Authority

- Issue: #133
- Approved by the user with workflow keyword `dál` on 2026-08-05.
- Exact baseline: `50fae1326534d4058157bab6fca6c7f9e2a26948`.

## Goal

One authoritative Planning candidate result represents one concrete song. Melody equivalence continues to govern repertoire reachability and melody non-repetition, but must not collapse several concrete songs into one primary result.

## Required behavior

- one result for each concrete song that passes hard filters;
- repertoire eligibility evaluated over the complete melody class;
- language, preference threshold and search evaluated on the concrete song;
- melody-window suppression evaluated over the complete class;
- exact-song antiphon signal after hard filtering, without ordering impact;
- deterministic order: Czech before Polish, then base number, variant and stable ID;
- complete `melodyClassId` and `melodyMembers` metadata on every authoritative candidate;
- stored-song hydration preserves the persisted number/title snapshot while adding current authoritative class metadata;
- missing authoritative songs retain historical fallback behavior;
- existing compatibility fields remain until the UI phases replace them.

## Explicit exclusions

- current-service row occupancy and disabled results;
- duplicate melody validation across rows;
- candidate-list UI redesign;
- inline melody detail interaction;
- Service Context theme selection or candidate theme highlighting;
- schema or migration changes;
- cosmetic work.

## Workflow

Automatic Review Gate and one focused local HUMAN checkpoint are required. Merge is forbidden without exact `MERGOVAT`.