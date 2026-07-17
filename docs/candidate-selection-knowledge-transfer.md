# Candidate Selection Knowledge Transfer

## Purpose

This document transfers detailed candidate-selection knowledge from the project analysis conversation into the repository so that future ChatGPT/Codex work can continue from the accepted understanding instead of reconstructing the rules from scattered context.

It is intended as study material for the next implementation-planning thread. It is not yet an implementation task, not a UI design, and not a database schema proposal.

Use this document together with:

- `docs/decisions.md`
- `docs/roadmap.md`
- `docs/requirements.md`
- `docs/workflows.md`
- `docs/domain-model.md`
- `docs/planning-lifecycle-confirmed-rules.md`

## Status

Status: knowledge transfer / pre-implementation material.

The rules below summarize accepted or strongly established product knowledge from the analysis conversation. Where a detail still needs implementation-level precision, it is explicitly marked as an open point.

Do not implement candidate selection directly from memory in a later thread. First turn this material into a precise implementation contract for the candidate-selection milestone.

## Current implementation context

The repository currently implements the Planning Lifecycle First slice. Recent work has focused on:

- service-set lifecycle;
- in-memory and DB-backed repository paths;
- `ORGANY_RUNTIME=db` opt-in;
- local DB setup and migrations;
- DB-free lifecycle regression tests;
- service date/time identity;
- active planning sets versus completed records;
- completed-record administration.

Candidate selection, repertoire management, preference management, melody non-repetition engine, antiphon highlighting, and liturgical-season highlighting are still future work. They should attach to the existing planning lifecycle rather than replace it.

## Product principle

The system supports human decisions. It must not replace the priest or organist with automatic selection.

Candidate selection should reduce cognitive load by surfacing eligible and contextually relevant songs. The human user still makes the final liturgical choice.

The system should make a larger repertoire easier to use, not harder.

## Core domain concepts used by candidate selection

### Concrete song identity

A concrete song is identified by:

```text
(language, number)
```

Examples:

```text
(Czech, 28)
(Polish, 613)
```

Song numbers are not globally unique across languages.

### Melody equivalence

A melody is modeled as an equivalence relation between concrete songs.

A melody-equivalence class contains all songs known to share the same melody. Singleton classes are valid.

Candidate selection must reason at both levels:

- concrete songs for language, preferences, display, and final row selection;
- melody-equivalence classes for repertoire reachability and non-repetition.

### Service language

The accepted service-language behavior for filtering is:

```text
Czech  -> Czech songs
Polish -> Polish songs
Mixed  -> Czech and Polish songs
```

Language filtering determines which concrete songs are selectable for the current service.

### Planning row

Candidate selection eventually fills or supports filling a service row. A row may contain:

- a concrete song; or
- a note-only non-song contribution.

Candidate selection concerns song rows only. Note-only rows are outside candidate filtering.

## Candidate selection as a pipeline

Candidate selection should be understood as a pipeline:

```text
song catalog + melody knowledge
-> melody-equivalence classes
-> hard filters
-> highlighting
-> display shaping
-> human selection
```

Hard filters determine eligibility. Highlighting and display shaping provide additional context but must not make an ineligible song eligible.

## Hard filters

The accepted hard filters are:

1. selected/default organist repertoire;
2. service language;
3. melody non-repetition;
4. preference threshold, default `x = 0`.

Antiphon and liturgical season are not hard filters.

### 1. Organist repertoire filter

The repertoire filter is based on the selected or default organist.

A melody-equivalence class passes the repertoire filter if the class contains at least one concrete song explicitly present in the selected organist's repertoire.

Important consequence:

The organist repertoire is evidence that the organist can play that melody, not necessarily that the exact same-language concrete song is explicitly listed in the repertoire.

Example:

```text
Melody class: 38P, 29C, 421C
Organist repertoire contains: 38P
Service language: Czech
```

The class can pass the repertoire filter because `38P` proves the melody is in repertoire. Czech songs from the same class may then be considered under the language filter.

Open implementation point:

If a class passes the repertoire filter but contains no concrete song allowed by the service-language filter, it should not produce a selectable candidate for that service. This should be confirmed in the implementation contract.

### 2. Service-language filter

The service-language filter applies to concrete songs.

Accepted behavior:

```text
Czech service  -> selectable concrete songs must be Czech
Polish service -> selectable concrete songs must be Polish
Mixed service  -> selectable concrete songs may be Czech or Polish
```

This filter should not destroy the evidence that a hidden opposite-language song is in the organist's repertoire. That evidence may still be displayed as supplemental repertoire context; see Display Rules.

### 3. Melody non-repetition filter

The non-repetition rule applies to melody-equivalence classes, not individual songs.

Repeating the same melody under another song number still counts as repetition.

The rule has no ad-hoc exceptions.

It uses two directions:

1. backward historical checking against completed-service records;
2. forward protection against saved future working/final plans.

Rows without concrete songs are ignored.

### 4. Preference-threshold filter

Preferences belong to concrete songs, not melody-equivalence classes.

They do not automatically transfer across a melody-equivalence class.

Accepted score ranges:

```text
priest               0-3
organist             0-2
congregation member  0-1
admin                no own preference score
```

Candidate preference filtering uses the summed score for the concrete song.

Default threshold:

```text
x = 0
```

With `x = 0`, preference thresholding should not remove ordinary songs merely because no positive preference has been entered.

Open implementation point:

When a displayed candidate is centered on a melody-equivalence class containing several visible concrete songs, the implementation contract must specify whether thresholding is evaluated per visible concrete song, by best visible song, or by another explicit rule. The current accepted principle is: do not transfer a preference score from one concrete song to another.

## Antiphon and liturgical-season highlighting

Antiphon and liturgical season are highlighting inputs, not eligibility filters.

They apply only after hard filtering.

### Antiphon

Antiphon number is entered manually.

It is not derived from service date.

Antiphon mapping conceptually relates:

```text
(language, antiphon number) -> recommended concrete song(s)
```

The result should highlight matching candidates after hard filters have already been applied.

### Liturgical season

Liturgical season is manually selected.

It is not automatically derived from date in the current accepted model.

Season mapping conceptually relates:

```text
(language, liturgical season) -> recommended concrete song(s)
```

The result should highlight matching candidates after hard filters have already been applied.

### Highlighting rule

Highlighting must not resurrect a song or melody class eliminated by hard filters.

If a song does not pass repertoire, language, non-repetition, and preference threshold, antiphon/season mapping may not force it into the eligible candidate list.

## Candidate display rules

Candidate display should be compact but explain why a candidate is relevant.

### Display unit

Candidate display is expected to show melody-equivalence context, not just one isolated song number.

Example display:

```text
38P, 29C, 421C
```

Where suffixes indicate language, for example:

```text
P = Polish
C = Czech
```

Exact UI notation can be decided later, but the displayed context must preserve the idea that these songs share a melody.

### Repertoire visibility

Explicit repertoire songs should be visually distinguished, for example by bold text.

Example:

```text
**38P**, 29C, 421C
```

The bold item indicates a concrete song explicitly present in the organist's repertoire.

### Opposite-language repertoire visibility rule

If service-language filtering hides all explicit repertoire songs from a melody-equivalence class, display exactly one opposite-language repertoire song from the same class as supplemental context and emphasize it.

Example:

```text
Service language: Czech
Melody class: 38P, 29C, 421C
Organist repertoire contains only: 38P
Selectable Czech songs: 29C, 421C
Display should include: **38P**, 29C, 421C
```

`38P` is displayed to explain why the organist can play the melody. It is not the primary selectable Czech service song.

Open implementation points:

- define deterministic tie-breaking if multiple hidden opposite-language repertoire songs exist;
- define whether supplemental opposite-language repertoire evidence is clickable, disabled, or purely informational;
- define exact visual notation for explicit repertoire evidence.

## Non-repetition period

Default non-repetition period:

```text
2 months
```

Only admin may change the period.

Changing the period must be blocked if the change would create a conflict among saved non-completed plans.

Important distinction:

Completed-service records provide backward historical input for future planning. They are not themselves treated as conflicts with each other.

Conflicts are limited to:

- the currently edited plan;
- saved future working sets;
- saved future final sets.

Completed records are historical evidence for backward checking, not active conflicts.

Open implementation points:

- exact date arithmetic for the 2-month window;
- whether the boundary is inclusive or exclusive;
- how service time affects ordering if two services occur on the same date;
- how Europe/Prague local calendar date should be used in the non-repetition engine.

## Repertoire, knowledge, and preferences are different things

The application must keep these concepts separate.

### Shared knowledge

Admin-managed shared knowledge includes:

- song catalog;
- melody equivalence;
- Czech/Polish song relations;
- antiphon mappings;
- liturgical-season mappings;
- non-repetition period.

### Organist repertoire

Organist repertoire is not shared melody knowledge. It is a statement that a specific organist can play a concrete song, and by melody equivalence can practically support using related songs in another language.

Organist or admin may manage repertoire.

### Preferences

Preferences are role-weighted song evaluations. They are attached to concrete songs only.

Admin manages congregation preference administration but has no own preference score.

Priest, organist, and congregation members may eventually manage their own preferences within accepted role limits.

## Permissions relevant to future candidate work

Candidate selection itself is decision support. It must not override planning permissions.

Planning permissions remain governed by the Planning Lifecycle rules:

- priest, organist, admin may create/edit/delete working sets;
- priest and admin may save/delete final sets;
- priest, admin, or later system may convert final set to completed-service record;
- congregation member has no planning permissions.

Knowledge permissions remain separate:

- admin manages shared knowledge;
- organist/admin manages organist repertoire;
- admin manages congregation preferences;
- users manage their own preferences where allowed.

## Implementation warnings from the previous UX failure

Do not repeat the PR #74 failure pattern.

Avoid implementing too many UX/lifecycle behaviors in one broad PR.

For candidate selection, do not combine all of these in one step:

- catalog import;
- melody-equivalence editor;
- repertoire editor;
- candidate engine;
- preference UI;
- antiphon/season mapping UI;
- service-row picker UI;
- non-repetition engine;
- DB schema expansion;
- visual highlighting design.

Before implementation, create a precise contract with deterministic test cases.

The preferred pattern is:

1. codify the implementation contract;
2. add pure/domain-level candidate-selection tests;
3. implement the smallest useful candidate engine slice;
4. only then attach UI behavior.

## Suggested next discussion target

The next ChatGPT thread should use this file to prepare a Codex-ready implementation phase, not to implement immediately from vague memory.

Suggested phase title:

```text
Candidate Selection Contract and Testable Domain Slice
```

Suggested purpose:

```text
Turn the accepted candidate-selection knowledge into a precise implementation contract and a small deterministic domain/service test suite before any UI or database-heavy candidate-selection implementation.
```

Suggested first implementation boundary:

- define candidate-selection input/output types in a dependency-free module;
- implement hard-filter logic using in-memory fixtures only;
- cover repertoire, language, melody non-repetition, and preference threshold in tests;
- include antiphon/season only as post-filter highlighting metadata if it can be done without UI work;
- do not add editors, imports, auth, full DB persistence, or visual UI redesign.

## Minimum test fixtures for the next phase

Use small artificial fixtures, not the full legacy database.

Example melody classes:

```text
Class A: 38P, 29C, 421C
Class B: 10C
Class C: 613P, 28C
```

Example repertoire:

```text
Organist O1 knows: 38P, 10C
Organist O2 knows: 613P
```

Example service contexts:

```text
Czech service
Polish service
Mixed service
```

Example non-repetition data:

```text
Completed service used Class A recently
Future final set uses Class C
Future working set uses Class B
```

Example preference data:

```text
Priest likes 29C with score 3
Organist likes 38P with score 2
Congregation member likes 421C with score 1
No score on 28C
```

These fixtures should verify:

- repertoire pass via same melody but different language;
- Czech service hides Polish selectable songs but may show one Polish repertoire evidence item;
- Polish service behaves symmetrically;
- Mixed service allows both languages;
- non-repetition removes a whole melody class;
- preference threshold does not transfer scores between concrete songs;
- antiphon/season highlighting does not resurrect filtered-out songs.

## Open questions to resolve before implementation

1. What is the exact candidate output shape: one candidate per melody class, per concrete song, or a class candidate with selectable concrete songs?
2. What is the deterministic ordering of candidates?
3. What is the deterministic ordering of songs inside a displayed melody class?
4. How exactly should hidden opposite-language repertoire evidence be represented in data?
5. How should preference threshold be evaluated when a candidate contains multiple visible concrete songs?
6. What exact date window should the 2-month non-repetition rule use?
7. Should service time affect future/backward ordering inside one calendar date?
8. Which antiphon/season highlight colors or categories are accepted, and should color names appear in domain output or only in UI?
9. What minimal persistent schema is needed for catalog, melody equivalence, repertoire, preferences, antiphon mappings, and season mappings?
10. Which part of candidate selection must be implemented before any UI picker exists?

## Non-goals for the next immediate phase

Do not implement in the first candidate-selection continuation:

- full legacy import;
- full song catalog UI;
- melody-equivalence admin UI;
- repertoire admin UI;
- preference voting UI;
- antiphon mapping editor;
- season mapping editor;
- authentication;
- multi-congregation support;
- visual redesign of the Planning Lifecycle workspace;
- automatic hymn selection;
- any behavior that bypasses human final decision-making.

## Summary

The most important transferred rule is this:

Candidate selection is not a song search box and not an automatic hymn picker. It is a decision-support engine over concrete songs and melody-equivalence classes. It applies hard eligibility filters first, then adds liturgical highlighting and repertoire explanation, and only then presents compact context for a human decision.
