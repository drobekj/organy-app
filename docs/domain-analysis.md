# Domain Analysis

## Purpose
Use this document to explore and clarify the problem domain before requirements, architecture, or implementation decisions are made.

This document captures domain knowledge, language, responsibilities, processes, rules, constraints, and unresolved questions without defining product scope, technical design, database schema, or implementation tasks.

## Terminology

- **Song** — a concrete hymn-book entry identified by `(language, number)`, for example `(Czech, 28)` or `(Polish, 613)`. A number alone is not sufficient because Czech and Polish numbering must remain distinct.
- **Melody** — not currently treated as a separately named object; the domain concept is an equivalence relation on songs.
- **Melody-equivalence class** — the set of songs that share the same melody. A song with no known related songs forms a singleton class.
- **Service set** — a concrete ordered set of rows for one service.
- **Service item / row** — one row in a service set. It may contain a song, an instrumental or external contribution, another free-form item, or a textual note. If a row does not contain a song, it must contain a textual note.
- **Working set** — a saved non-final service set that can still be edited.
- **Final set** — a saved set selected as final for a service. It is not directly edited; if it must change, it is deleted and recreated.
- **Completed-service record** — a historical record created from a final set after the service. It is not a non-completed plan.
- **Antiphon number** — a user-entered number. Together with service language it forms `(language, antiphon number)` and may map to a recommended song.
- **Liturgical season** — a manually selected value that may highlight season-related candidates. It defaults to none / empty.
- **Non-completed plan** — a working set or final set that has not become a completed-service record.
- **Melody non-repetition rule** — a rule preventing reuse of a melody-equivalence class across relevant historical use and saved future plans within the configured non-repetition period.
- **Preference** — a role-weighted score attached to a concrete song `(language, song number)`, not automatically transferred across a melody-equivalence class.

## Stakeholders

- **Priest** — responsible for the final liturgical selection and for saving final service sets.
- **Organist** — curates repertoire and contributes practical musical knowledge used during planning.
- **Admin** — manages shared knowledge, configuration, and congregation preferences.
- **Congregation member** — contributes preference information for concrete songs through voting or preference entry.
- **Local congregation** — the primary current context; generalization to multiple congregations remains future-oriented.

## Roles and Responsibilities

### Priest

The priest remains the liturgical decision maker. The priest may create and edit working sets, save final sets, delete working or final sets, convert final sets to completed-service records, and manage their own song preferences.

### Organist

The organist primarily maintains practical repertoire knowledge. The organist may create and edit working sets, delete working sets, manage repertoire, and manage their own song preferences. Repertoire management is distinct from shared knowledge management.

### Admin

The admin manages shared knowledge and system-level planning configuration. Admin-only knowledge management includes melody equivalence, the base song catalog, antiphon-to-song mappings, liturgical-season-to-song mappings, and the non-repetition period. Admin also manages congregation preferences.

### Congregation member

Congregation members do not administer plans or knowledge. Their domain contribution is their own preference for concrete songs.

## Knowledge Maintained by the System

The future system may need to preserve and make available:

- the song catalog, where each song is identified by `(language, number)`;
- melody-equivalence relationships between songs;
- each organist's explicit repertoire;
- ordered service sets and their rows;
- historical completed-service records;
- antiphon mappings from `(language, antiphon number)` to `(language, song number)`;
- liturgical-season mappings from `(language, liturgical season)` to songs;
- role-weighted preferences for concrete songs;
- the configured melody non-repetition period.

Knowledge entered once should remain reusable. Melody-equivalence classes may be extended or merged as new musical knowledge is discovered.

## Business Processes

### Opening planning for an upcoming service

When no working or final set exists for the upcoming service, opening the app creates planning defaults rather than deriving liturgical knowledge:

- service date is derived from the app opening date;
- priest and organist are copied from the chronologically latest completed-service record;
- language defaults to Polish if the planned service date is the second Sunday of the month and Czech otherwise;
- time defaults to `10:00` and is informational only;
- antiphon number is empty;
- liturgical season is none / empty.

The app does not derive antiphon number or liturgical season from service date.

### Planning a service set

The primary planning artifact is a concrete ordered service set for one service. The standard case contains four song slots, but rows are flexible: they may be added, removed, and reordered. Rows without songs are allowed when they carry a textual note.

A service set normally moves through:

```text
no set exists → working set → final set → completed-service record
```

Direct finalization is also possible from no set to final set when required information is present and an authorized user saves the final set.

Deleting a saved non-completed set returns the service to `no set exists`; there is no separate deleted or cancelled state.

### Filtering and displaying candidates

Candidate lists are filtered before antiphon or liturgical-season highlighting. The hard filters are:

1. selected/default organist's repertoire;
2. service language;
3. melody non-repetition rule;
4. preference threshold, default `x = 0`.

The organist repertoire filter is primary. A candidate song passes it if its melody-equivalence class contains at least one song explicitly present in the selected organist's repertoire.

The language filter applies to concrete songs:

```text
Czech service → show Czech songs
Polish service → show Polish songs
Mixed service → show Czech and Polish songs
```

Antiphon and liturgical season are not hard filters. They only highlight candidates that already passed the hard filters.

Candidate records should expose relevant songs from the same melody-equivalence class. The explicit repertoire song must be visible in bold. For Czech or Polish services, if the language-filtered display would hide every explicit repertoire song, exactly one arbitrary opposite-language repertoire song from the same melody class is added and marked in bold. For mixed services this exception cannot occur because both Czech and Polish songs are already displayed.

### Completing services and using history

A completed-service record is historical. It is used as input for backward non-repetition filtering, but it is not treated as a non-completed plan. Completed-service records are not judged as conflicts; they only provide backward non-repetition input.

## Decision Making

- Final liturgical selection remains a human decision, primarily the priest's responsibility.
- The system should support decisions by preserving knowledge, filtering candidates, and highlighting relevant information without replacing judgment.
- Antiphon and liturgical season support decision making through highlighting, not eligibility exclusion.
- Preferences influence candidate filtering through total role-weighted scores, but preferences remain attached to concrete songs.

## Business Rules

- A song is identified by `(language, number)`.
- Melody is represented as an equivalence relation on songs; each song belongs to one melody-equivalence class, including singleton classes.
- A service row without a song must contain a textual note.
- Service sets have four states: no set exists, working set, final set, completed-service record.
- A completed-service record is historical and is not a non-completed plan.
- Antiphon number and liturgical season are not prefilled from the service date.
- The relationships `service date → antiphon number` and `antiphon number → liturgical season` cannot be reliably assumed.
- `(language, antiphon number)` may map to `(language, song number)` for red highlighting.
- `(language, liturgical season)` may map to songs for green highlighting.
- Antiphon and liturgical season are not hard filters.
- The melody non-repetition rule applies to melody-equivalence classes, not individual songs, and has no exceptions.
- Forward antiphon protection is removed.
- Backward non-repetition checks completed-service records within the period before the planned service date.
- Forward protection checks saved future working and final sets within the period after the planned service date.
- Only service rows containing concrete songs participate in melody non-repetition checks.
- Conflicts are defined only among non-completed plans: the currently edited plan and saved future working or final sets.
- Completed-service records affect backward filtering but are not conflicts among themselves.
- The default non-repetition period is 2 months.
- Only admin may change the non-repetition period.
- A non-repetition period change is not allowed if it would create a conflict between currently saved non-completed plans, even for admin; the blocking saved set must be deleted first.
- Preferences belong to concrete songs and do not automatically transfer across melody-equivalence classes.
- Own preference score ranges are priest `0–3`, organist `0–2`, congregation member `0–1`, and admin has no own preference.
- Total preference is the sum of role-weighted preferences and candidate filtering shows songs with total preference at least `x`, default `0`.

## Constraints

- The current scope is one local congregation.
- Legacy data exists and may constrain migration, but migration strategy remains architectural and unresolved.
- Service time is informational only and has no filtering or decision-making effect.
- Final sets are not directly edited; changes require deleting and recreating the final set.
- Permissions distinguish service sets, shared knowledge, organist repertoire, congregation preferences, and own song preferences.

## Open Questions

- How legacy data should be migrated into the refined song and melody-equivalence model.
- Whether melody-equivalence classes will later need named melody objects or remain only equivalence relations.
- How future multi-congregation support would affect repertoire, preferences, and permissions.
- How additional experts might contribute knowledge without weakening admin-only responsibility for shared knowledge quality.
