# Planning Lifecycle Confirmed Rules

This document records only rules confirmed by the automated lifecycle regression safety net. It does not introduce new product behavior, UI behavior, database schema, or future workflow scope.

## Confirmed rules

- A note-only planning row is valid.
- An empty planning row is not valid.
- Planning lifecycle role permissions apply in the application layer.
- Completing a final set creates a separate historical completed-service record.
- An active final set and a completed record are not two active representations of the same service; completing the final set removes that final set from active planning storage.
- Future UI defaults, dirty-state handling, and completed-history UI are deferred and are not part of this regression-safety change.

## Phase 29 confirmed lookup rules

Planning Lifecycle keeps its existing lifecycle behavior while replacing new free-text priest, organist, and song selections with catalog lookup. Saved records store stable catalog IDs plus snapshots. Legacy snapshot-only records remain readable. Lookup availability depends on active catalog records and person role membership; this is separate from future candidate-selection filtering.
