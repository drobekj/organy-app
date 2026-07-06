# Domain Analysis

## Purpose
Use this document to explore and clarify the problem domain before requirements, architecture, or implementation decisions are made.

This document captures domain knowledge, language, responsibilities, processes, rules, constraints, and unresolved questions without defining product scope, technical design, database schema, or implementation tasks.

## Terminology

- **Song** — a concrete repertoire item identified by both language and number, for example `(Czech, 28)` or `(Polish, 613)`. Number alone is not sufficient because Czech and Polish numbering are distinct.
- **Language** — the language of a concrete song and, separately, the planned service language. Current planning distinguishes Czech, Polish, and mixed services.
- **Melody-equivalence class** — the set of songs known to share the same melody. If no related songs are known, a song forms a singleton class.
- **Service set** — a concrete ordered set of rows for one service. It may be a working set, a final set, or a completed-service record depending on lifecycle state.
- **Service row** — one ordered item in a service set. A row may contain a song, or it may contain only a textual note.
- **Repertoire** — the songs explicitly present in an organist's playable repertoire.
- **Candidate list** — the filtered view of known songs offered during planning.
- **Antiphon number** — a user-entered number interpreted together with service language. It may point to a recommended song but does not itself filter candidates.
- **Liturgical season** — a manually selected planning context that may highlight related songs but does not itself filter candidates.
- **Preference score** — a role-weighted score attached to a concrete song, not automatically to its melody-equivalence class.
- **Melody non-repetition rule** — a planning rule that prevents reuse of melody-equivalence classes within the configured non-repetition period.

## Stakeholders

- **Priest** — responsible for final liturgical song selection and finalizing service sets.
- **Organist** — responsible for maintaining playable repertoire and confirming practical musical feasibility.
- **Admin** — responsible for system-level knowledge management and configuration.
- **Congregation members** — provide preference information for concrete songs through voting.
- **Local congregation** — the initial organizational context whose repertoire, languages, planning rhythm, and historical usage shape the domain.

## Roles and Responsibilities

### Priest

The priest is the primary decision maker for final service selection. The priest may create and edit working sets, save final sets, delete working or final sets, and convert final sets into completed-service records.

### Organist

The organist is primarily a repertoire maintainer and musical feasibility contributor. The organist may create, edit, and delete working sets and may manage their repertoire, but does not save or delete final sets.

### Admin

The admin manages shared knowledge and constrained configuration. Admin responsibilities include melody equivalence, the base song catalog, antiphon-to-song mappings, liturgical-season-to-song mappings, congregation preferences, and the non-repetition period.

### Congregation member

Congregation members do not administer planning or knowledge. Their domain contribution is their own song preference information.

## Knowledge Maintained by the System

The system may need to remember and organize:

- songs identified by language and number;
- melody-equivalence relationships among songs;
- each organist's explicit repertoire songs;
- ordered service sets and their lifecycle state;
- service rows that either contain a song or a textual note;
- completed-service records used as historical evidence for future planning;
- saved future working and final sets used for forward non-repetition protection;
- service language, date, priest, organist, time, antiphon number, and liturgical season;
- mappings from `(language, antiphon number)` to recommended songs;
- mappings from `(language, liturgical season)` to songs;
- role-weighted preferences for concrete songs;
- the configured melody non-repetition period.

## Business Processes

### Planning a service set

Planning concerns one concrete service. The usual set has four song slots, but the number of rows is flexible: rows may be added, removed, and reordered. A row may represent a hymn, instrumental performance, external choir, or another free-form contribution. If a row does not contain a song, it must contain a textual note.

When no working or final set exists for an upcoming service, opening the app creates planning defaults rather than derived liturgical knowledge. The service date is derived from the app opening date, priest and organist are copied from the chronologically latest service record, language defaults to Polish for the second Sunday of the month and Czech otherwise, time defaults to `10:00` and is informational only, while antiphon number and liturgical season remain empty.

### Candidate selection support

Candidate lists are produced by applying hard filters before highlighting. Hard filters are selected or default organist repertoire, service language, melody non-repetition, and a total preference threshold with default `0`. Antiphon and liturgical season do not narrow the candidate list; they only highlight candidates that already passed hard filters.

A song passes the repertoire filter when its melody-equivalence class contains at least one song explicitly present in the selected organist's repertoire. The language filter applies to concrete songs: Czech services show Czech songs, Polish services show Polish songs, and mixed services show Czech and Polish songs.

Candidate rows should expose relevant songs from the melody-equivalence class. The song explicitly present in the selected organist's repertoire must remain visible in bold. If a Czech or Polish service language display would hide all explicit repertoire songs from that melody class, exactly one arbitrary opposite-language repertoire song from that class is added and shown in bold.

### Completing service history

A final set may be converted to a completed-service record. Completed-service records are historical and are not treated as non-completed plans. They provide evidence for later backward non-repetition checks.

## Decision Making

- The priest decides final service selection.
- The organist maintains repertoire knowledge and contributes practical feasibility information.
- The admin decides shared knowledge and constrained configuration changes.
- Congregation members decide only their own preferences.

The system supports these decisions by preserving knowledge, filtering candidates, highlighting relevant context, and identifying non-repetition issues. It does not replace human liturgical judgment.

## Business Rules

- A song is identified by `(language, number)`, not by number alone.
- Melody equivalence applies to songs and forms melody-equivalence classes.
- A service row without a song must contain a textual note.
- Service sets have four states: no set exists, working set, final set, and completed-service record.
- A saved non-completed set can be deleted, returning the service to no set exists.
- A final set is not directly edited; it is deleted and recreated if it must change.
- Antiphon number and liturgical season are manually entered or selected and are not hard filters.
- Antiphon highlighting is based on `(language, antiphon number) → song` when the recommended song is present in the filtered candidate list.
- Liturgical-season highlighting is based on `(language, liturgical season) → songs` when matching songs are present in the filtered candidate list.
- Preferences belong to concrete songs and do not automatically transfer across melody-equivalence classes.
- Preference ranges are priest `0–3`, organist `0–2`, congregation member `0–1`, and admin has no own preference.
- Candidate preference filtering uses the total summed preference score.
- Melody non-repetition applies to melody-equivalence classes, not individual songs, and has no exceptions.
- Backward non-repetition checks completed-service records before the planned service date.
- Forward non-repetition protection checks saved future working and final sets after the planned service date.
- Only rows containing concrete songs participate in non-repetition checks; free-form note rows are ignored.
- Conflicts exist only among non-completed plans, not among completed-service records.
- Changing the non-repetition period must be blocked if it would create a conflict among currently saved non-completed plans.

## Constraints

- The initial scope is one local congregation; broader multi-congregation generalization is postponed.
- Czech and Polish song numbering must remain distinct.
- Service time is informational and has no filtering or decision-making effect.
- The relationships `service date → antiphon number` and `antiphon number → liturgical season` cannot be relied upon.
- Antiphon number and liturgical season are not prefilled from the service date.
- Historical completed-service records do not block non-repetition period changes as conflicts, although they remain historical inputs for future filtering.
- The default non-repetition period is two months and may be changed only by admin subject to conflict validation.

## Open Questions

- Exact long-term conceptual treatment of non-song service rows.
- Whether melody should remain only an equivalence relation or later become a separately named domain object.
- Migration strategy for existing legacy data.
- Future administration model if additional experts contribute knowledge.
- Long-term extensibility beyond the initial local congregation.
