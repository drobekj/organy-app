# Candidate Selection Knowledge Transfer

## Purpose and authority

This document is the repository source of truth for the accepted candidate-selection behavior discussed through 2026-08-05.

It replaces the earlier pre-implementation candidate-display assumptions in this file, especially the former open question whether one displayed candidate represents a melody class or a concrete song. The accepted display and selection unit is now a concrete song, while melody-equivalence classes remain authoritative for repertoire reachability, non-repetition, and local occupancy.

Use this document together with:

- `docs/decisions.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/domain-model.md`
- `docs/planning-lifecycle-confirmed-rules.md`
- `docs/phase-30-1-interaction-data-contract.md`

This is accepted product knowledge and a functional specification baseline. It does not by itself authorize application-code changes, schema changes, an issue, a branch for implementation, or a merge. Implementation still requires a phase-specific Contract Gate.

## Current implementation context

Phase 31.12 is merged on `main` and provides authoritative Planning candidates from the song catalog, melody-equivalence knowledge, and organist repertoire. Its current service shapes each candidate around one authoritative melody-class representative plus equivalents.

The behavior accepted here requires a later adaptation from class-shaped display records to concrete-song candidate rows. Existing Planning Lifecycle, Service Context validation, save/finalize rules, catalog identity, and melody authority must be reused rather than replaced.

Phase 31.13 has not yet been implemented. Its intended first boundary is the Czech thematic-section knowledge dataset and resolver, not the entire candidate-picker redesign.

## Stable domain principles

### Concrete song identity

A concrete song is identified by:

```text
(language, number)
```

Song numbers are not globally unique across languages.

### Melody equivalence

A melody-equivalence class contains all concrete songs known to share one melody. Singleton classes are valid.

Candidate selection reasons at two levels:

- concrete songs are displayed, searched, selected, persisted, and evaluated for concrete-song metadata;
- melody-equivalence classes provide repertoire evidence, non-repetition, equivalent-song detail, and occupancy across rows of one service.

### Human decision

The application provides decision support. It does not automatically choose the final song set.

## Candidate pipeline

The conceptual pipeline is:

```text
catalog + melody knowledge + organist repertoire + service context
-> hard-filtered concrete-song universe
-> current-service availability
-> antiphon/theme highlighting
-> concrete-song rows with melody context
-> human selection
```

Hard filters determine whether a concrete song belongs to the candidate universe. Current-service availability may temporarily disable a song that is otherwise in that universe. Highlighting never changes eligibility or ordering.

## Hard-filtered universe

The established hard filters remain:

1. selected/default organist repertoire through melody-equivalence reachability;
2. service language for the concrete song;
3. melody non-repetition against applicable historical and saved-plan data;
4. concrete-song preference threshold, default `x = 0`.

Antiphon and thematic section are not hard filters.

A melody class may pass the repertoire filter because an equivalent song is explicitly present in the organist repertoire, even when the selectable concrete song is in another permitted language. Preference scores remain attached to concrete songs and never transfer through melody equivalence.

## Candidate-row contract

### Display unit

Each candidate row represents exactly one concrete selectable song.

A melody class containing several permitted concrete songs may therefore produce several candidate rows. Selecting one row persists that concrete song, not the class representative and not every equivalent song.

### Row content

A compact candidate row begins with:

1. the concrete candidate's number;
2. the concrete candidate's title.

It then exposes compact melody-equivalence context, including the other song numbers in the same class. The authoritative class pivot or repertoire-evidence member remains distinguishable according to existing class metadata. In mixed-language context, Polish equivalents must be clearly distinguishable from Czech equivalents.

The concrete candidate remains the row identity even when another equivalent song is the class pivot or the song explicitly present in the organist repertoire.

### Ordering

Candidate highlighting does not change ordering.

Default ordering is deterministic by concrete song number. For a mixed-language service:

1. Czech candidate rows come first;
2. Polish candidate rows follow;
3. each language block is ordered by the catalog's canonical song-number ordering.

### Current selection

When a row already contains a selected song and its candidate list is opened:

- the current concrete song is marked as the current selection;
- the list automatically scrolls to it;
- its melody class remains available to that same service row;
- melody classes occupied by other service rows remain unavailable.

If a Service Context change makes the current song language-invalid, the song is not deleted. It remains visible as the current invalid selection so the user can replace or remove it.

## Current-service occupancy

### Occupancy rule

Selecting a concrete song occupies its whole melody-equivalence class within the currently edited service set.

All other concrete songs from that class become unavailable in candidate lists for other service rows. This happens immediately in the local unsaved editing state.

### Release rule

When the selected song is removed or replaced, its previous melody class immediately becomes available again wherever no other service row occupies it.

### Invalid selections still occupy their class

A selected song that has become invalid because of a Service Context change continues to occupy its whole melody class until it is replaced or removed. This prevents creating an additional collision during correction.

### Legacy or imported duplicate state

If existing/imported data already contain the same melody class in two service rows:

- do not silently remove or replace either selection;
- mark both colliding rows as erroneous;
- allow the invalid state to be saved as a working draft;
- block approval/finalization;
- show a concise blocking reason near the approval/finalization action, following the established Service Context validation pattern.

A suitable reason is conceptually:

```text
Cannot approve: two selected songs use the same melody.
```

## Selection and editing interactions

### Select or replace

Clicking/tapping the main area of an available candidate row immediately selects that concrete song for the active service row.

If another song was already selected, it is replaced without a confirmation dialog. After selection or replacement, the candidate list closes.

### Remove

Removing a selected song requires no confirmation dialog. The service row becomes empty, the melody class is released immediately, and the candidate list does not open automatically.

### Unsaved editing

Selection, replacement, and removal update only the local draft until the existing shared Save action is used. Existing unsaved-change protection, discard behavior, approval locking, and draft validation rules remain authoritative.

Open candidate/detail state is transient UI state and is not persisted. After reload, all candidate lists and details are closed.

## Candidate search

Each candidate list supports search by:

- song number;
- song title.

Search is constrained to the hard-filtered universe. Songs eliminated by a hard filter are not resurrected as search results.

Songs that pass hard filters but are currently unavailable because their melody class is occupied elsewhere in the same service may appear as disabled search results. A disabled result states the reason and identifies the occupying service row, for example:

```text
The same melody is already used in “Song after the sermon”.
```

A disabled search result may still expose its detail and score links, but it cannot be selected.

If no currently available candidate remains, show an explicit empty state such as:

```text
No available song.
```

The explanation should distinguish, where determinable, whether the absence results from hard filtering such as language or from melody occupancy in another service row.

## Detail contract

### Availability

Every candidate row and every selected-song row has a Detail action.

On desktop, hover may open a temporary preview and an explicit Detail action pins it. On touch devices, the main row action selects while the Detail action opens/pins the detail.

The detail opens inline directly below its row and pushes following content down.

### One expansion at a time

Across the service-planning area, at most one expansion is open:

- one candidate list; or
- one song detail.

Opening another candidate list closes the previous expansion. Opening a detail closes an open candidate list, and opening a candidate list closes an open detail. Clicking/tapping outside an open detail closes it. Exact visual treatment is deferred to practical testing.

### Detail contents

The expanded detail is row-based:

1. first row: the concrete song whose detail was opened;
2. following rows: the other concrete songs in the same melody-equivalence class.

Each detail row contains:

- song number;
- title;
- score/resource URL when available.

Resource URLs open in a new tab and must not discard the current application state.

Equivalent songs outside the currently permitted service language remain visible as informational rows with active resource links, but they are not selectable.

### Candidate-detail behavior

In a detail opened from a candidate row, clicking another selectable equivalent song does not immediately select it. It moves focus to that concrete song's own candidate row and opens that row's detail.

For an unavailable candidate result, detail remains informational; no song in that disabled result can be selected through the detail.

### Selected-song-detail behavior

In a detail opened from an already selected song, clicking another selectable equivalent song immediately replaces the current concrete selection with that equivalent song.

After replacement:

- the detail closes;
- the melody class remains occupied by the newly selected concrete song;
- reopening the detail uses the newly selected song as its first row.

Clicking a resource URL never triggers selection or replacement.

## Service Context changes

When the service language changes and an already selected song is no longer permitted:

- do not delete the song automatically;
- mark its service row as invalid;
- block approval/finalization;
- keep Save available for the working draft;
- keep valid replacement candidates available;
- keep the invalid selection's melody class occupied until correction.

This uses the same validation pattern as invalid Service Context fields: local error indication plus a concise explanation at the blocked final action.

## Antiphon and thematic highlighting

Antiphon and thematic-section inputs only recalculate recommendation highlighting.

They do not:

- change candidate ordering;
- make a hard-filtered song eligible;
- invalidate an already selected song merely because it does not match;
- propagate concrete-song metadata to every member of a melody class.

Highlighting applies only to the concrete candidate's number and title, not to the whole melody-equivalence context. When both antiphon and thematic highlighting apply, antiphon has priority.

## Thematic-section knowledge

The intended input is an exact transcription of the thematic table of contents from the physical `Evangelický zpěvník`. The user will provide scans of the relevant pages.

The first data-oriented thematic phase should establish:

- frozen Czech thematic-section JSON;
- stable section identifiers;
- exact inclusive song-number ranges;
- validation of range integrity;
- DB synchronization/read-only provider where required by the existing architecture;
- resolution by the base song number so slash variants resolve through their base number;
- deterministic tests for ordinary and slash-number cases.

Thematic membership applies to a concrete Czech song. It does not automatically transfer through melody equivalence, and Polish equivalents do not inherit Czech thematic membership until authoritative Polish thematic data exist.

The initial thematic-data phase excludes:

- Polish thematic ranges;
- manual exception tags;
- automatic date derivation;
- multi-theme assignment;
- broad candidate-picker redesign;
- final visual tuning.

## Validation and final action

The following candidate-selection conditions block approval/finalization but do not block saving a working draft:

- duplicate melody-equivalence class across two service rows;
- selected concrete song disallowed by the current Service Context;
- any inherited Planning Lifecycle validation error.

Errors are shown locally at the affected row or field and summarized concisely near the blocked approval/finalization action.

## Superseded assumptions and resolved questions

The following earlier questions are now resolved:

- Candidate output is per concrete song, not one display row per melody class.
- Candidate ordering is deterministic by number, with Czech before Polish in mixed services.
- Melody context is supplemental to the concrete row identity.
- Opposite-language equivalents may be shown in detail as informational entries but cannot be selected when the language is not permitted.
- Current-service melody occupancy disables otherwise eligible candidates and states the occupying row.
- Search includes disabled occupancy results only inside the hard-filtered universe.
- Candidate and selected-song details intentionally have different click behavior because their purposes differ.
- Highlighting never changes ordering and antiphon wins over thematic highlighting.

The following are not product questions for further pre-implementation interrogation:

- exact colors, spacing, indentation, icons, and animation;
- final close affordance styling;
- other cosmetic treatment.

Those details are deferred until practical UI testing.

## Implementation discipline

Do not implement the whole specification as one broad change.

Before each implementation slice:

1. compare this specification with current `main` and identify behavior already present;
2. isolate one failure domain;
3. define inputs, outputs, invariants, validation, tests, and explicit non-goals in a Contract Gate;
4. obtain user approval of that Contract Gate;
5. only then create implementation issue/branch/code as required by the project workflow.

No merge is authorized without the user's exact instruction `MERGOVAT`.

## Traceability

- Source discussion accepted on 2026-08-05.
- Repository baseline examined: `main` at `39c3e64f96a5ec1cd879e28e12bbf13c6909afc7` (merged Phase 31.12).
- The next analytical steps are:
  1. approve this consolidated functional specification;
  2. compare it with current implementation and remove already implemented work from the change set;
  3. decompose only the remaining work into one-failure-domain phases;
  4. approve the Contract Gate for the first phase.
