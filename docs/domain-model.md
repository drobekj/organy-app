# Domain Model

## Purpose
Use this document to define the shared vocabulary, entities, relationships, and rules of the problem domain.

## Ubiquitous Language

- **Song** — a concrete item identified by `(language, number)`.
- **Language** — Czech, Polish, or mixed in planning context; Czech or Polish for a concrete song.
- **Melody-equivalence class** — a set of songs that share the same melody.
- **Service set** — an ordered set of service rows for one service.
- **Service row** — an ordered item in a service set containing either a song or a textual note.
- **Working set** — an editable saved plan that is not final.
- **Final set** — the selected plan for a service before completion.
- **Completed-service record** — historical record of a service after completion.
- **Repertoire** — songs explicitly known to be in an organist's repertoire.
- **Candidate** — a song shown after hard filters are applied.
- **Preference** — a role-weighted score attached to a concrete song.
- **Melody non-repetition rule** — a rule preventing melody-equivalence class reuse within the configured period.

## Core Entities

### Song

A song is identified by language and number. Number alone is not unique across the domain because Czech and Polish hymn numbering are separate.

Key attributes:

- language;
- number;
- membership in one melody-equivalence class.

### Melody-equivalence class

A melody-equivalence class groups songs that share the same melody. Every song belongs to one class. A song with no known related songs belongs to a singleton class.

Classes may be extended or merged when new musical knowledge is discovered.

### Service set

A service set is the planning artifact for one concrete service. It has a service date, language, priest, organist, informational time, optional antiphon number, optional liturgical season, lifecycle state, and ordered rows.

### Service row

A service row is one ordered item in a service set. It may contain a concrete song. If it does not contain a song, it must contain a textual note.

### Repertoire

Repertoire records the concrete songs explicitly present in an organist's playable repertoire. Candidate filtering uses repertoire through melody-equivalence classes: a candidate may pass if its melody class contains at least one explicit repertoire song for the selected organist.

### Preference

A preference belongs to a concrete song. Preferences do not automatically apply to other songs in the same melody-equivalence class.

Role score ranges:

| Role | Score range |
|---|---:|
| Priest | 0–3 |
| Organist | 0–2 |
| Congregation member | 0–1 |
| Admin | no own preference |

The total preference score of a song is the sum of its role-weighted preferences.

### Antiphon mapping

An antiphon mapping relates `(language, antiphon number)` to a recommended concrete song. It supports highlighting, not hard filtering.

### Liturgical-season mapping

A liturgical-season mapping relates `(language, liturgical season)` to songs. It supports highlighting, not hard filtering.

## Relationships

- A song belongs to exactly one melody-equivalence class.
- A melody-equivalence class contains one or more songs.
- An organist repertoire contains explicit songs.
- A service set contains ordered service rows.
- A service row may reference one concrete song.
- A service row without a song contains a textual note.
- A completed-service record is the historical form of a finalized service set.
- A candidate row represents a concrete song together with relevant songs from its melody-equivalence class.
- Antiphon and liturgical-season mappings reference concrete songs.
- Preferences are attached to concrete songs.

## Business Rules

### Service set lifecycle

Service set lifecycle states are:

1. no set exists;
2. working set;
3. final set;
4. completed-service record.

Normal flow is:

```text
no set exists → working set → final set → completed-service record
```

Direct finalization is possible when all required data are present and an authorized user saves a final set:

```text
no set exists → final set
```

There is no separate deleted or cancelled state. Deleting a saved non-completed set returns the service to `no set exists`.

### Candidate filtering

Candidate lists apply hard filters before highlighting:

1. selected or default organist's repertoire;
2. service language;
3. melody non-repetition rule;
4. total preference threshold, default `0`.

The language filter applies to concrete songs:

- Czech service shows Czech songs;
- Polish service shows Polish songs;
- mixed service shows Czech and Polish songs.

Antiphon and liturgical season are not hard filters. They only highlight candidates already present in the filtered candidate list.

### Candidate display

Candidate rows show relevant songs from the candidate's melody-equivalence class. The explicitly repertory song must be shown in bold.

For a Czech or Polish service, if language filtering would hide all explicit repertoire songs from that melody class, exactly one arbitrary opposite-language repertoire song from the same class is added to the display and shown in bold. For a mixed service, this exception is unnecessary because both languages are already displayed.

### Melody non-repetition

The melody non-repetition rule applies to melody-equivalence classes and has no exceptions.

Backward historical checks prevent candidates whose melody-equivalence class was used in completed-service records within the configured period before the planned service date.

Forward protection checks saved future working and final sets within the configured period after the planned service date. Only rows with concrete songs participate; free-form note rows are ignored.

Conflicts exist only among non-completed plans: the currently edited plan and saved future working or final sets. Completed-service records affect backward filtering but are not mutually judged as conflicts.

### Non-repetition period changes

The default non-repetition period is two months. Only admin may change it. A change is not allowed if it would create a conflict among currently saved non-completed plans. The only way to unblock such a change is to delete one or more conflicting saved sets.

### Default planning values

When no working or final set exists for the upcoming service, opening the app creates defaults:

- service date from the app opening date;
- priest and organist from the chronologically latest service record;
- Polish language for the second Sunday of the month, Czech otherwise;
- informational time `10:00`;
- empty antiphon number;
- empty liturgical season.

The app does not derive antiphon number or liturgical season from service date.

## Lifecycle States

### Service set states

- **No set exists** — there is no saved non-completed set for the service.
- **Working set** — editable saved plan.
- **Final set** — selected plan before service completion; not directly edited.
- **Completed-service record** — historical record after completion.

### Candidate visibility states

A known song may be absent from the candidate list because it fails a hard filter, visible as an ordinary candidate, or visible with antiphon and/or liturgical-season highlighting.

## Domain Events

- **Working set created** — planning starts for a service.
- **Working set edited** — service rows or service metadata change.
- **Final set saved** — a service plan becomes final.
- **Saved set deleted** — a working or final set is removed and the service returns to no set exists.
- **Final set completed** — a final set becomes a completed-service record.
- **Melody equivalence updated** — songs are related, extended, or merged by melody.
- **Repertoire updated** — an organist's explicit playable songs change.
- **Preference recorded** — a role-weighted score is recorded for a concrete song.
- **Non-repetition period change attempted** — proposed configuration change is validated against non-completed plans.

## Open Modeling Questions

- Should melody remain modeled only as an equivalence relation, or later become a separately named object?
- How should free-form service rows be categorized if additional musical and non-musical contribution types become important?
- How should legacy data be migrated into the song, melody-equivalence, repertoire, and service-set concepts?
- How should role assignment be modeled when one real person holds multiple roles?
