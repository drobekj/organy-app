# Domain Model

## Purpose
Use this document to define the shared vocabulary, entities, relationships, and rules of the problem domain.

This is a conceptual domain model, not a database schema or implementation design.

## Ubiquitous Language

- **Song** — a concrete hymn-book entry identified by `(language, number)`.
- **Language** — the hymn-book language context for a song or service, currently Czech, Polish, or mixed for service planning.
- **Melody** — an equivalence relation on songs, not currently a separately named object.
- **Melody-equivalence class** — all songs that share the same melody.
- **Service** — one liturgical event for which a concrete ordered set may be planned.
- **Service set** — the concrete ordered set of service items for one service.
- **Service item** — an ordered row in a service set; it may contain a concrete song or a textual note.
- **Working set** — editable non-completed service set.
- **Final set** — selected final non-completed service set.
- **Completed-service record** — historical record after the service has occurred.
- **Non-completed plan** — a working set or final set.
- **Antiphon mapping** — mapping from `(language, antiphon number)` to `(language, song number)`.
- **Liturgical-season mapping** — mapping from `(language, liturgical season)` to songs.
- **Preference** — role-weighted score for a concrete song.
- **Repertoire** — the set of songs explicitly known as playable by an organist.
- **Melody non-repetition period** — configured period, default 2 months, used by the melody non-repetition rule.

## Core Entities

### Song

A song is identified by:

```text
(language, number)
```

Examples:

```text
(Czech, 28)
(Polish, 613)
```

A song number alone is ambiguous and must not be treated as the song identity.

### Melody-equivalence class

A melody-equivalence class groups all songs known to share the same melody. Each song belongs to a class. If no related songs are known, the song forms a singleton class. Classes may be extended or merged when new knowledge is discovered.

### Service set

A service set is a concrete ordered collection of service items for one service. The standard case contains four song slots, but the model allows a flexible number of rows that can be added, removed, and reordered.

### Service item

A service item is one row in a service set. It may contain:

- a concrete song;
- an instrumental performance;
- an external choir or other contribution;
- another non-song note.

If it does not contain a song, it must contain textual note content.

### Antiphon input

Antiphon is a user-entered number, not derived from date. Combined with service language, it forms `(language, antiphon number)`, which may map to a recommended song `(language, song number)`.

### Liturgical season input

Liturgical season is manually selected and defaults to none / empty. Combined with language, it may map to songs relevant to that season.

### Preference

A preference belongs to a concrete song `(language, song number)` and does not automatically transfer to other songs in the same melody-equivalence class.

Role score ranges are:

| Role | Preference score per song |
|---|---:|
| Priest | 0–3 |
| Organist | 0–2 |
| Congregation member | 0–1 |
| Admin | no own preference |

The total preference score is the sum of role-weighted preferences.

### Role

Current roles are priest, organist, admin, and congregation member. A real person may hold more than one role, but responsibilities and permissions are described by role.

## Relationships

- A song belongs to exactly one melody-equivalence class at a given point in domain knowledge.
- A melody-equivalence class contains one or more songs.
- An organist has an explicit repertoire of songs.
- A candidate song passes the repertoire filter when its melody-equivalence class contains at least one song explicitly present in the selected organist's repertoire.
- A service may have no set, a working set, a final set, or a completed-service record.
- A service set contains ordered service items.
- A service item may reference one concrete song.
- `(language, antiphon number)` may map to `(language, song number)`.
- `(language, liturgical season)` may map to one or more songs.
- Preferences are attached to concrete songs, not to melody-equivalence classes.

## Business Rules

### Candidate filtering

Candidate lists apply hard filters before highlighting:

1. selected/default organist's repertoire;
2. service language;
3. melody non-repetition rule;
4. preference threshold, default `x = 0`.

The language filter applies to concrete songs:

```text
Czech service → show Czech songs
Polish service → show Polish songs
Mixed service → show Czech and Polish songs
```

The preference filter uses total preference:

```text
show only songs with total preference score at least x
```

### Highlighting

Antiphon and liturgical season are not hard filters. If mapped songs are present after hard filtering, antiphon matches are highlighted red and liturgical-season matches are highlighted green.

### Candidate display

Candidate records display relevant songs from the same melody-equivalence class. The explicit repertoire song must be visible in bold. For a Czech or Polish service, if language filtering would hide every explicit repertoire song, the display adds exactly one arbitrary opposite-language repertoire song from the same class and marks it bold. For a mixed service, both languages are already displayed.

### Melody non-repetition

The melody non-repetition rule applies to melody-equivalence classes, not individual songs, and has no exceptions.

The rule has two components:

1. backward historical check against completed-service records within the non-repetition period before the planned service date;
2. forward protection against saved future working and final sets within the non-repetition period after the planned service date.

Forward antiphon protection is not part of the rule. Only rows containing concrete songs participate; free-form rows without songs are ignored.

### Conflict scope

Conflicts are defined only among non-completed plans:

- the currently edited plan;
- saved future working sets;
- saved future final sets.

Completed-service records are not judged as conflicts; they only provide backward non-repetition input.

### Non-repetition period changes

The default non-repetition period is 2 months. Only admin may change it. A change is disallowed if it would create a conflict between currently saved non-completed plans, even for admin. The conflict can only be unblocked by deleting one or more conflicting saved sets.

### Permission responsibilities

Service set permissions:

| Action | Priest | Organist | Admin | Congregation member |
|---|---:|---:|---:|---:|
| create working set | yes | yes | yes | no |
| edit working set | yes | yes | yes | no |
| save final set | yes | no | yes | no |
| delete working set | yes | yes | yes | no |
| delete final set | yes | no | yes | no |
| convert final set to completed-service record | yes | no | yes / system | no |

There is no direct edit final set action. If a final set must be changed, it is deleted and recreated.

Knowledge and preference permissions:

| Action | Priest | Organist | Admin | Congregation member |
|---|---:|---:|---:|---:|
| manage repertoire | no | yes | yes | no |
| manage congregation preferences | no | no | yes | no |
| manage own song preferences | yes | yes | no | yes |
| manage knowledge | no | no | yes | no |

Admin-only knowledge management includes melody equivalence, base song catalog, antiphon-to-song mappings, liturgical-season-to-song mappings, and non-repetition period.

## Lifecycle States

A concrete service set has four states:

```text
1. no set exists
2. working set
3. final set
4. completed-service record
```

Basic flow:

```text
no set exists → working set → final set → completed-service record
```

Direct finalization is possible:

```text
no set exists → final set
```

when all required data are filled and an authorized user saves the final set.

Deleting a saved non-completed set returns the service to:

```text
no set exists
```

There is no separate deleted or cancelled state.

## Domain Events

- Planning defaults are created for an upcoming service.
- A working set is created or edited.
- A working set is deleted.
- A final set is saved.
- A final set is deleted.
- A final set is converted to a completed-service record.
- Melody equivalence knowledge is extended or merged.
- An organist's repertoire is updated.
- Antiphon or liturgical-season mappings are updated.
- A song preference is recorded or changed.
- The non-repetition period is changed after conflict validation.

## Open Modeling Questions

- Whether melody-equivalence classes need named melody objects later.
- How legacy data maps to `(language, number)` songs and melody-equivalence classes.
- How future support for multiple congregations would affect role boundaries, repertoires, and preferences.

## Phase 29 catalog lookup foundation

The person catalog is a lightweight operational catalog, not an authentication or account model. A person has a stable internal ID, display name, active flag, and independent priest/organist role membership; a single person may hold both roles. Priest and organist selections in saved service contexts keep the catalog ID and the display-name snapshot that was valid when saved.

The song catalog stores concrete songs with stable `songId`, language, number, title, active flag, and at most one optional sheet-music URL. The conceptual song identity remains `(language, number)`, so equal numbers are valid across Czech and Polish catalogs. Planning rows keep `songId` plus language, number, and title snapshots; the sheet-music URL remains current catalog metadata.

Catalog deactivation is soft. Inactive people/songs and removed person roles are not offered for new lookup choices, but already saved Working, Final, Completed, and legacy snapshot-only rows remain readable. New or changed people/song selections must use an eligible catalog record; Phase 29 intentionally does not add a free-text fallback.
