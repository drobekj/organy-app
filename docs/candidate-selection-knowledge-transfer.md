# Candidate Selection Knowledge Transfer

## Purpose

This document is the authoritative functional specification for candidate selection and song detail behavior. It consolidates the accepted product decisions from the 2026-08-05 design discussion so later implementation work does not reconstruct or silently alter them.

Use it together with:

- `docs/decisions.md`
- `docs/roadmap.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/domain-model.md`
- `docs/planning-lifecycle-confirmed-rules.md`
- `docs/phase-31-14-contract.md`

## Status and phase history

- Phase 31.13, authoritative Czech and Polish thematic-section knowledge, is merged on `main` as commit `50fae1326534d4058157bab6fca6c7f9e2a26948`.
- Phase 31.14, concrete-song authoritative Planning candidates, is merged on `main` as commit `93f1e1f836cadca5d286a5b9b2678334614d9ee0`.
- Phase 31.15 is authorized by issue #135 and implements current-service occupancy plus collision validation.
- This file supersedes the documentation-only draft PR #129.
- Later phases remain separately gated and must not be pulled into Phase 31.15.

The system supports human decisions. It must not automatically choose hymns or override the priest or organist.

## Core identity and melody rules

A concrete song is identified by its authoritative song ID, language and number. Song numbers are not globally unique across languages.

A melody is an equivalence class of concrete songs. Singleton classes are valid.

Candidate selection reasons at two levels:

- concrete song: language, preference, search, display, selection and persistence;
- melody class: repertoire reachability, non-repetition, occupancy and collision validation.

The selected and persisted value is always the concrete song. Melody equivalence is supporting knowledge, not a replacement identity.

## Candidate row

One candidate row represents one concrete song.

A melody class may therefore appear in several candidate rows when several of its concrete songs pass the hard filters.

Each row begins with the concrete song number and title, followed by compact melody-class context. The exact visual layout is deferred to practical testing.

## Hard filters

The hard filters are:

1. selected/default organist repertoire;
2. service language;
3. melody non-repetition;
4. preference threshold, default `0`.

Antiphon and thematic section are recommendation/highlight inputs, not hard filters.

### Repertoire

A melody class passes the repertoire condition if at least one member of the complete class is explicitly in the selected organist's repertoire.

This evidence may come from a member hidden by the current service-language filter. For example, a Polish repertoire member may prove that the organist can play the melody while Czech concrete songs from the same class remain the selectable candidates.

Repertoire evidence does not change the concrete song that is selected or persisted.

### Language

```text
Czech  -> Czech candidate songs
Polish -> Polish candidate songs
Mixed  -> Czech and Polish candidate songs
```

Language filtering applies to the concrete candidate. It must not discard opposite-language members from the melody-class detail or repertoire explanation.

### Melody non-repetition

Historical or saved future use of one member blocks the complete melody class within the configured window.

Rows without a concrete song are ignored.

The configured default is two months. Existing date-window semantics remain authoritative until a separately approved phase changes them.

### Preference threshold

Preferences belong to concrete songs and never transfer through melody equivalence.

Each concrete song must independently satisfy the threshold.

Role score limits remain:

```text
priest               0-3
organist             0-2
congregation member  0-1
admin                no own preference score
```

At threshold `0`, an otherwise eligible song with no positive preference remains available.

## Ordering and highlighting

Normal ordering is:

- Czech songs first;
- then Polish songs;
- within each language by base number and slash variant;
- stable ID as final tie-breaker.

Antiphon and theme highlighting do not change ordering.

Antiphon applies only to the exact recommended concrete song. It does not transfer to melody equivalents. Theme also applies only to the concrete song and is resolved against ranges of that song's language.

When both signals apply, antiphon has visual priority.

## Mixed-language theme semantics

Phase 31.13 introduced symmetric Czech and Polish thematic-section datasets and language-specific resolvers.

In a mixed service:

- a Czech candidate is evaluated only against the Czech ranges of the selected shared theme concept;
- a Polish candidate is evaluated only against the Polish ranges;
- thematic membership never transfers through melody equivalence;
- a language-specific concept without a counterpart, such as Polish `Miłość bliźniego`, highlights only that language.

## Melody-class context and Detail

Every candidate and selected-song row has a Detail action.

The expanded detail contains one row for each member of the complete authoritative melody class, including:

- song number;
- title;
- language;
- score URL when available;
- repertoire state;
- current aggregate preference context where useful.

The concrete candidate/selected song appears first, followed by the other members in deterministic order.

Score links remain active even for members that are not selectable because of service language. They open in a new tab and preserve application state.

### Candidate detail behavior

Selecting an allowed equivalent inside a candidate detail does not immediately choose it. It moves/focuses to that equivalent's own candidate row and opens its detail.

A disallowed-language member remains informational and does not move or select.

### Selected-song detail behavior

Selecting an allowed equivalent inside the detail of an already selected song immediately replaces the selected concrete song and closes the detail.

A disallowed-language member remains informational.

### Expansion state

Only one expansion may be open in the entire service section:

- one candidate list; or
- one song detail.

Opening another list/detail closes the previous one. Expansion state is not persisted and refresh closes all expansions.

Desktop hover may temporarily reveal detail; click/tap pins it. Final close affordance and cosmetic behavior are deferred to practical testing.

## Selection, replacement and removal

Clicking/tapping the main candidate row immediately selects that concrete song.

Selection, replacement and removal change the local draft only. They are persisted by the common `Uložit` action.

Replacing a song requires no confirmation. Removing a song requires no confirmation and leaves the row empty.

Reopening the candidate list for a row with a selected song:

- keeps the selected song and its class available for that same row;
- marks the current concrete song;
- scrolls to it automatically;
- returns classes occupied by other rows as disabled candidates with an occupying-row reason.

After selecting or replacing, the candidate list closes.

## Local melody occupancy

Selecting a concrete song occupies its complete melody class for all other rows of the same service draft.

Removing or replacing releases the previous class.

While editing a row, that row's own previous class remains available to itself.

An invalid selected song, for example after a language change, continues to occupy its complete class elsewhere until the user removes or replaces it.

## Search and unavailable results

Candidate search works by concrete song number and title.

The search universe is first limited by hard context that cannot be relaxed, especially service language and authoritative catalog scope.

Within that universe, songs temporarily unavailable because their melody is occupied by another row are returned as inactive results with a concise reason.

The reason names the occupying service row, for example:

```text
Stejná melodie je použita v řádku Píseň po kázání.
```

An inactive search result still supports Detail, including the complete melody class and score links. Only selection is disabled.

Songs outside the hard search universe never appear.

Search is live, case-insensitive and diacritic-insensitive where sensible. Numeric search follows the displayed catalog number syntax, including slash variants.

## Collision and validation behavior

Old/imported data may contain the same melody class in more than one service row.

The application must not silently remove or rewrite either row.

Instead:

- mark both rows with a local validation error;
- show a concise shared reason near the blocked approval action;
- allow saving the invalid draft;
- block approval until the conflict is resolved.

`Uložit` remains enabled with validation errors. Successful invalid save reports that the draft was saved while error markers remain visible.

## Language changes

Changing service language does not automatically delete a selected song that is no longer permitted.

The song remains selected and is marked invalid. Its candidate list shows it as the current invalid selection plus permitted alternatives.

The draft may be saved, but approval is blocked until the song is removed or replaced.

## Theme and antiphon changes

Changing the antiphon or selected thematic section only recalculates highlights. It does not remove or invalidate existing selections.

Antiphon/theme mismatch is not an approval error.

## Save, discard and approval

Candidate edits remain local until common `Uložit`.

Leaving the service/page with unsaved changes triggers stay/discard protection.

`Zahodit změny` restores the last saved state in place and requires confirmation.

Approval is allowed only for persisted valid state. Unsaved changes must be saved first.

After approval, the complete set is locked. Editing requires the priest to cancel approval and return the set to draft; existing songs and metadata are preserved.

## Approved implementation decomposition

### Phase 31.13 — authoritative bilingual thematic knowledge

Completed and merged. Contains frozen Czech and Polish data, validation, persistence, synchronization and language-specific read-only resolution. No Service Context UI or candidate highlighting.

### Phase 31.14 — concrete-song authoritative backend candidates

Completed and merged:

- one backend result per concrete song;
- per-song preference threshold;
- language/number ordering independent of highlights;
- complete melody-class metadata;
- existing hard filters, authoritative search and antiphon behavior preserved;
- no new candidate-list UI.

### Phase 31.15 — local melody occupancy and collision validation

Current phase:

- occupy/release a full class across rows;
- distinguish historical blocking from local occupancy;
- inactive candidates with occupying row reason;
- detect imported duplicate classes;
- allow invalid draft save but block approval.

### Phase 31.16 — concrete candidate-list UI

- one open list;
- concrete rows;
- selection/replacement/removal;
- current-song marker and auto-scroll;
- inactive results and empty states;
- no expanded class detail.

### Phase 31.17 — inline melody-class detail

- detail for candidate and selected song;
- complete class rows and score links;
- language-disabled members;
- candidate-detail navigation versus selected-detail replacement;
- one expansion in the whole section.

### Phase 31.18 — Service Context theme and candidate highlighting

- one optional theme concept selection;
- persistence and hydration;
- Czech/Polish language-specific resolution;
- concrete-song highlighting;
- antiphon priority;
- no automatic derivation from date, multi-theme selection or manual exception tags.

## Workflow constraints

Each phase has one failure domain, an explicit Contract Gate, focused acceptance, Automatic Review Gate, one useful HUMAN checkpoint and a Merge Gate.

No issue, branch or implementation is created before Contract Gate approval.

No merge occurs without the user's exact command:

```text
MERGOVAT
```

## Deferred presentation details

Exact colors, spacing, indentation, hover delay, close icon and other cosmetic choices are intentionally deferred to practical browser testing. Functional semantics above are authoritative.