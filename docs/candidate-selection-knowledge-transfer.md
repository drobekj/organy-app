# Candidate Selection Knowledge Transfer

## Authority and status

This document is the repository source of truth for accepted candidate-selection behavior discussed through 2026-08-05.

It is an approved functional baseline, not implementation authorization. Every implementation slice still requires its own Contract Gate. No merge is authorized without the user's exact instruction `MERGOVAT`.

Use together with:

- `docs/decisions.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/domain-model.md`
- `docs/planning-lifecycle-confirmed-rules.md`
- `docs/phase-30-1-interaction-data-contract.md`

## Core model

A concrete song is identified by `(language, number)`. Numbers are not globally unique across languages.

A melody-equivalence class contains all concrete songs known to share one melody. Singleton classes are valid.

Candidate selection operates at two levels:

- concrete songs are searched, displayed, selected, persisted, highlighted and preference-filtered;
- melody classes provide repertoire reachability, historical non-repetition, current-service occupancy and equivalent-song context.

The application supports a human decision. It does not select songs automatically.

## Candidate pipeline

```text
catalog + melody knowledge + organist repertoire + service context
-> hard-filtered concrete-song universe
-> current-service availability
-> antiphon/theme highlighting
-> concrete-song rows with melody context
-> human selection
```

Hard filters determine whether a song belongs to the candidate universe. Current-service occupancy may only make an otherwise eligible song temporarily unavailable. Highlighting never changes eligibility or ordering.

## Hard filters

The established hard filters are:

1. selected/default organist repertoire through melody-class reachability;
2. service language applied to the concrete song;
3. melody non-repetition against applicable completed and saved-plan data;
4. preference threshold applied separately to each concrete song, default `x = 0`.

A melody class may pass the repertoire filter because any equivalent song is explicitly in the organist repertoire. Preference scores never transfer between equivalent songs.

Antiphon and thematic section are not hard filters.

## Candidate-row contract

Each candidate row represents exactly one concrete song. One melody class may therefore produce several candidate rows.

The compact row begins with the concrete song number and title, followed by compact melody-class context containing the other song numbers. The authoritative pivot or explicit repertoire member remains distinguishable. Polish equivalents must be distinguishable in mixed-language context.

Selecting a row persists that concrete song, not a class representative.

### Ordering

Highlighting does not affect ordering.

- Czech service: Czech songs in canonical number order.
- Polish service: Polish songs in canonical number order.
- Mixed service: Czech block first, Polish block second; each block in canonical number order.

### Existing selection

When reopening a candidate list for a row with a selected song:

- the current concrete song is marked;
- the list scrolls to it;
- its class remains available to that same row;
- classes occupied by other rows remain unavailable.

A selected song that became language-invalid remains visible as the current invalid selection until replaced or removed.

## Current-service occupancy

Selecting a concrete song immediately occupies its whole melody class in the local unsaved service draft.

For every other service row, all songs from that class become unavailable. Removing or replacing the selection immediately releases the old class unless another row still occupies it.

An invalid selected song continues occupying its class until corrected, preventing an additional collision.

### Existing duplicate state

If imported or older data already contain the same melody class in two rows:

- do not alter either row automatically;
- mark both rows as erroneous;
- allow saving the invalid working draft;
- block approval/finalization;
- show a concise blocking reason near the final action.

## Selection and editing

- Clicking/tapping the main area of an available candidate selects it immediately.
- Selecting another candidate replaces the current song without confirmation.
- The candidate list closes after selection or replacement.
- Removing a song requires no confirmation, leaves the row empty and does not open the list.
- Selection, replacement and removal remain local until the shared Save action.
- Approval is blocked while changes are unsaved and always operates on persisted state.
- Save remains available even when validation errors exist.
- After saving an invalid draft, confirmation remains visible together with the errors and blocked approval.
- `Discard changes` restores the last persisted state after confirmation.
- Unsaved-change protection applies when leaving the service or closing the page.
- Failed save retains all local changes.
- Open lists and details are transient and are closed after reload.

## Candidate search

Search supports song number and title, including canonical slash variants such as `52/1` and their encoded form.

Search never restores a song removed by a hard filter.

Songs that pass hard filters but are unavailable only because their class is occupied in another current-service row may appear as disabled results. Each disabled result states the reason and identifies the occupying row. It remains available for informational detail and resource links but cannot be selected.

When no available song remains, show `No available song` and, where determinable, distinguish hard filtering from current-service occupancy.

## Detail contract

Every candidate row and every selected-song row has a Detail action.

- Desktop hover may provide temporary preview; explicit Detail pins it.
- Touching the main candidate row selects; touching Detail opens detail.
- Detail opens inline below its row and pushes following content downward.
- Across the whole service section only one expansion is open: one candidate list or one song detail.
- Opening another expansion closes the previous one.
- Clicking/tapping outside an open detail closes it.
- Exact cosmetic treatment is deferred to practical testing.

### Detail contents

The first detail row is the concrete song whose detail was opened. Following rows are the other songs in the same melody class.

Each row contains number, title and resource/score URL when available. URLs open in a new tab without losing application state.

Equivalent songs outside the permitted service language remain visible with active links, but are not selectable.

### Candidate detail

Clicking another selectable equivalent song moves focus to that song's own candidate row and opens its detail. It does not select it immediately.

A disabled candidate detail is informational only.

### Selected-song detail

Clicking another selectable equivalent song immediately replaces the selected concrete song, keeps the same melody class occupied and closes the detail. Reopening starts with the new song.

Clicking a resource URL never selects or replaces a song.

## Service Context changes

Changing language never deletes an existing selection automatically.

A no-longer-permitted song:

- remains in its row;
- is marked invalid;
- continues occupying its melody class;
- may be replaced or removed;
- allows working-draft save;
- blocks approval/finalization.

Use the existing validation pattern: local row error plus concise explanation near the blocked final action.

Changing antiphon or thematic section only recalculates highlights. It does not invalidate selections.

## Antiphon and thematic highlighting

Highlighting applies only to the concrete candidate's number and title, not to every member of its melody class.

It does not change order, restore a hard-filtered song or invalidate a nonmatching selected song.

When both signals apply, antiphon has priority over theme.

## Czech thematic-section knowledge

The authoritative source will be an exact transcription of the thematic table of contents from the physical `Evangelický zpěvník`, supplied as user scans.

The first data-only boundary establishes:

- frozen Czech thematic-section JSON;
- stable section identifiers;
- exact inclusive number ranges;
- range validation;
- DB synchronization/read-only provider where required by the architecture;
- resolution by base song number, including slash variants;
- deterministic ordinary and slash-number tests.

The theme belongs to a concrete Czech song. It does not transfer through melody equivalence. Polish songs receive no Czech theme until authoritative Polish data exist.

Initial exclusions:

- Polish ranges;
- manual exception tags;
- automatic date derivation;
- multiple themes per song;
- candidate-picker redesign;
- cosmetic tuning.

## Validation and final action

The following block approval/finalization but not working-draft save:

- the same melody class selected in multiple rows;
- selected concrete song disallowed by current Service Context;
- inherited Planning Lifecycle validation errors.

Errors are local to affected rows or fields and summarized near the final action.

## Accepted comparison with current `main`

Phase 31.12 already provides and must be reused:

- authoritative Czech/Polish catalog and stable song IDs;
- melody-equivalence authority;
- organist repertoire;
- aggregate concrete-song preferences;
- historical and saved-plan melody non-repetition;
- authoritative antiphon recommendation;
- number/title search including slash variants;
- persistence and hydration of concrete selected songs;
- candidate refresh after relevant Service Context changes;
- structured candidate errors;
- existing Planning Lifecycle save/finalize and validation patterns.

The existing implementation is only partially compatible in these areas:

1. It currently groups by melody class and emits one chosen primary row. It must emit one row for every eligible concrete song.
2. Preference threshold currently admits a class by the best visible member. It must apply per concrete song.
3. Ordering currently uses signal, repertoire and preference ranking. It must become language-block and canonical-number ordering, independent of highlighting.
4. `candidateUsages` already suppress melody classes, but it must distinguish historical/saved-plan hard suppression from temporary occupancy by another row in the current draft.
5. The candidate DTO must gain melody-class identity, full equivalent-song metadata, availability, reason and occupying-row information, plus later thematic signal.
6. The existing selected-song Detail action is only a starting point; the complete inline melody detail and one-expansion interaction are new.
7. Existing language-deviation handling must converge on the accepted rule: preserve the invalid song, allow draft save and block approval.

Truly new work is limited to:

- duplicate-class validation across current service rows;
- disabled occupancy search results with occupying-row explanation;
- complete inline melody detail and its navigation/replacement behavior;
- current-selection positioning in the candidate list;
- Czech thematic-section data and resolver;
- thematic highlighting and antiphon precedence.

The catalog, melody database, repertoire, preferences, antiphon knowledge and Planning persistence must not be rebuilt.

## Resolved questions and deferred cosmetics

Resolved:

- display and selection unit is a concrete song;
- ordering is by language block and number;
- equivalent-song context is supplemental;
- opposite-language equivalents remain informational;
- current-service occupancy disables, but does not hard-filter, otherwise eligible songs;
- candidate and selected-song details intentionally behave differently;
- antiphon wins over theme.

Deferred until practical UI testing:

- colors;
- spacing and indentation;
- icons;
- animation;
- exact close affordance styling.

## Implementation discipline

Do not implement the whole specification in one broad PR.

Before each implementation slice:

1. isolate one failure domain;
2. define inputs, outputs, invariants, validation, tests and explicit non-goals;
3. approve the Contract Gate;
4. only then create the implementation issue/branch/code required by workflow.

## Traceability

- Functional specification approved: 2026-08-05.
- Implementation comparison approved: 2026-08-05.
- Examined baseline: `main` at `39c3e64f96a5ec1cd879e28e12bbf13c6909afc7`, containing merged Phase 31.12.
- Documentation PR: #129 on `docs/candidate-selection-spec-2026-08-05`.
