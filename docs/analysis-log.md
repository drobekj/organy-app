# Analysis Log

This document is a chronological record of analytical discoveries made during project analysis.

Unlike Product Vision, Domain Analysis, Requirements, or Architecture, this document intentionally preserves intermediate reasoning, observations, assumptions, and insights that led to later project decisions.

It serves as the project's analytical memory.

---

# Session 2026-07-03

## Initial understanding

The project was initially perceived as a web application for planning liturgical hymns and communication between the organist and the priest.

During analysis it became clear that this description is incomplete.

---

## Discovery 1 — The real problem is not communication

The current communication workflow between the organist and the priest is only a symptom.

The real problem is that the growing amount of musical knowledge exists almost exclusively in the organist's head.

As the repertoire grows, planning paradoxically becomes more difficult instead of easier.

Increasing knowledge currently increases the cost of decision making.

The future system should reverse this trend.

---

## Discovery 2 — The system is primarily a knowledge management system

The project should not be viewed primarily as a hymn planner.

Its primary purpose is to capture, organize and preserve knowledge related to liturgical music planning.

Planning is only one consumer of this knowledge.

---

## Discovery 3 — Knowledge and decisions are different things

A fundamental design principle emerged.

Knowledge should be stored inside the system.

Decisions should remain human.

The application supports decisions but never replaces them.

The priest remains responsible for the final liturgical selection.

---

## Discovery 4 — Roles became much clearer

### Organist

The organist is primarily a curator of knowledge.

Responsibilities include:

- maintaining repertoire
- recording melody equivalence
- recording duplicate hymns
- linking Czech and Polish hymn books
- enriching hymn metadata
- maintaining overall data quality

The organist should spend as little time as possible on routine planning.

---

### Priest

The priest is the decision maker.

The priest should receive the richest possible information and independently select the final hymn set.

The system should increase decision quality rather than restrict freedom.

---

### Congregation members

Members do not participate in administration.

Their contribution is preference information through voting.

---

## Discovery 5 — Communication should almost disappear

Today's workflow:

Organist proposes songs.

↓

Priest reviews.

↓

Further discussion.

↓

Additional proposals.

↓

Agreement.

Desired workflow:

Knowledge is maintained continuously.

↓

Priest prepares final hymn set.

↓

Organist confirms.

No negotiation loop should normally be necessary.

---

## Discovery 6 — Knowledge should be entered only once

Every newly discovered relationship should become permanent project knowledge.

Examples:

- duplicate hymns
- same melody under different hymn numbers
- Czech / Polish equivalents
- historical experience
- annotations
- hymn relationships

Knowledge entered once should be reusable indefinitely.

---

## Discovery 7 — The system should reduce cognitive load

The objective is not faster clicking.

The objective is reducing cognitive effort required for hymn selection.

A larger repertoire should simplify planning rather than complicate it.

---

## Discovery 8 — Existing knowledge sources

An existing legacy database already exists.

Approximately ten tables.

The current schema may not be ideal.

Migration strategy remains open.

This is an architectural constraint rather than a product requirement.

---

## Discovery 9 — Current project scope

The primary objective is solving the problem for one local congregation.

Generalization for multiple congregations is intentionally postponed.

Future extensibility is desirable but not a current goal.

---

## Discovery 10 — Planning models real liturgical events

Planning is not merely selecting hymns.

Some positions within a service may represent:

- hymn
- instrumental performance
- external choir
- other musical contribution

This observation may later influence the conceptual domain model.

No technical decision has been made yet.

---

## Open Questions

The following topics remain intentionally unresolved.

- Exact conceptual model of a church service.
- Relationship between hymn, melody and performance.
- Migration strategy for legacy data.
- Long-term extensibility.
- Future administration model.
- Knowledge contribution by additional experts.

---

## Meta-observation

The analytical process demonstrated that important product insights emerged only through discussion.

Therefore:

Conversation
↓

Analysis Log

↓

Product Vision

↓

Domain Analysis

↓

Requirements

↓

Architecture

↓

Implementation

The repository should become the project's source of truth.

Chat conversations are only the place where new knowledge is created.

---

# Session 2026-07-06

## Analytical update from the planning package

This session restored the full analytical sequence from the 2026-07-06 analysis package.

The session refines the domain model, planning lifecycle, candidate filtering, display rules, non-repetition validation, and role responsibilities.

---

## Discovery 11 — A song is identified by language and number

A song is not identified by number alone.

The correct conceptual identifier is:

```text
song = (language, number)
```

Examples:

```text
(Czech, 28)
(Polish, 613)
```

This is necessary because Czech and Polish hymn numbering must remain distinct.

---

## Discovery 12 — Melody is an equivalence relation on songs

A melody is not currently treated as a separately named object.

Instead:

```text
melody = equivalence relation on songs
```

A melody-equivalence class is the set of songs that share the same melody.

Each song belongs to a melody-equivalence class. If no related songs are known, the song forms a singleton class.

Melody-equivalence classes may later be extended or merged when new musical knowledge is discovered.

---

## Discovery 13 — The working artifact is a concrete ordered service set

The primary planning artifact is a concrete ordered set of items for one service.

The standard case contains four song slots, but the number of rows is flexible.

Rows may be added, removed, and reordered.

A row is a free-form service item. It does not necessarily contain a song and does not necessarily represent a musical item.

Rule:

```text
If a row does not contain a song, it must contain a textual note.
```

---

## Discovery 14 — Service sets have a four-state lifecycle

A concrete service set has four states:

```text
1. no set exists
2. working set
3. final set
4. completed-service record
```

There is no separate deleted or cancelled state.

If a saved non-completed set is deleted, the service returns to:

```text
no set exists
```

Basic flow:

```text
no set exists
→ working set
→ final set
→ completed-service record
```

Direct finalization is also possible:

```text
no set exists
→ final set
```

when all required data are filled and an authorized user clicks the final button.

A completed-service record is historical and is not treated as a non-completed plan.

---

## Discovery 15 — Default app opening creates planning defaults, not derived liturgical knowledge

When no working or final set exists for the upcoming service, opening the app derives a service date from the app opening date.

Default values are:

- service date: derived from the app opening date
- priest: copied from the chronologically latest completed-service record
- organist: copied from the chronologically latest completed-service record
- language:
  - Polish if the planned service date is the second Sunday of the month
  - Czech otherwise
- time: default `10:00`, informational only
- antiphon number: empty
- liturgical season: none / empty

Service time has no filtering or decision-making effect.

The app does not derive antiphon number or liturgical season from the service date.

---

## Discovery 16 — Antiphon and liturgical season assumptions were revised

An earlier working assumption was corrected.

The following relationships cannot be reliably obtained:

```text
service date → antiphon number
antiphon number → liturgical season
```

Therefore:

- antiphon number is not prefilled
- liturgical season is not prefilled
- forward antiphon protection is removed

Antiphon is a user-entered number.

Together with service language it forms:

```text
(language, antiphon number)
```

This pair can map to a recommended song:

```text
(language, antiphon number) → (language, song number)
```

If the recommended song is present in the currently filtered candidate list, it is highlighted red.

Antiphon is not a hard filter.

Liturgical season is manually selected by the user and defaults to none / empty.

The available mapping is:

```text
(language, liturgical season) → songs
```

If matching songs are present in the currently filtered candidate list, they are highlighted green.

Liturgical season is not a hard filter.

---

## Discovery 17 — Candidate lists use hard filters before highlighting

The candidate list is a filtered view of the knowledge base.

Hard filters are:

```text
1. selected/default organist's repertoire
2. service language
3. melody non-repetition rule
4. preference threshold, default x = 0
```

Antiphon and liturgical season are not hard filters.

They only highlight candidates that already passed the hard filters.

The organist repertoire filter is the primary hard filter.

A candidate song passes this filter if its melody-equivalence class contains at least one song explicitly present in the selected organist's repertoire.

The language filter applies to concrete songs:

```text
Czech service → show Czech songs
Polish service → show Polish songs
Mixed service → show Czech and Polish songs
```

The preference filter uses the total summed preference score:

```text
show only songs with total preference score at least x
```

Default:

```text
x = 0
```

---

## Discovery 18 — Preferences are role-weighted and belong to concrete songs

Preferences belong to concrete songs:

```text
(language, song number)
```

Preferences do not automatically transfer across a melody-equivalence class.

Own preference ranges are:

| Role | Preference score per song |
|---|---:|
| Priest | 0–3 |
| Organist | 0–2 |
| Congregation member | 0–1 |
| Admin | no own preference |

The total preference score of a song is the sum of role-weighted preferences.

Example:

```text
priest gives 3
organist gives 2
two congregation members give 1 + 1

total preference = 7
```

The candidate-list preference filter uses this total summed score.

---

## Discovery 19 — Candidate display must expose the repertoire song in bold

Each candidate record should show a compact list of relevant songs from the same melody-equivalence class, for example:

```text
38P, 29C, 421C
```

The usual display follows service language:

```text
Czech service → show Czech songs from the melody class
Polish service → show Polish songs from the melody class
Mixed service → show Czech and Polish songs from the melody class
```

The song explicitly present in the selected organist's repertoire must be visually marked in bold.

This must remain visible even if the explicit repertoire song is not in the same language as the current service.

Therefore, for a Czech or Polish service, if the language-filtered melody-class display does not contain any explicit repertoire song, the display adds exactly one arbitrary opposite-language repertoire song from the same melody class and marks it in bold.

For a mixed service, this exception cannot occur because both Czech and Polish songs are already displayed.

---

## Discovery 20 — The melody non-repetition rule applies to melody classes

The correct term is:

```text
melody non-repetition rule
```

The rule applies to melody-equivalence classes, not to individual songs.

There are no exceptions.

After the antiphon revision, the rule has only two components:

```text
1. backward historical check
2. forward protection of saved future plans
```

Forward antiphon protection is removed.

For the backward historical check, a candidate melody-equivalence class must not have been used in completed-service records within the non-repetition period before the currently planned service date.

Historical records are used as input for filtering.

Conflicts are not defined between historical records themselves.

For forward protection, planning a service checks saved future working and final sets within the non-repetition period after the currently planned service date.

Only rows containing a concrete song participate in this check.

Free-form rows without a song are ignored.

---

## Discovery 21 — Conflicts exist only among non-completed plans

Conflicts are defined only among non-completed plans:

- the currently edited plan
- saved future working sets
- saved future final sets

Conflicts are not defined among completed-service records.

Completed-service records are not judged as conflicts; they only provide backward non-repetition input.

---

## Discovery 22 — Non-repetition period changes require conflict validation

The default non-repetition period is:

```text
2 months
```

Only admin may change it.

Changing the non-repetition period is restricted.

If changing the period would create a conflict between currently saved non-completed plans, the system must not allow the change, even for admin.

The only way to unblock such a change is to delete one or more conflicting saved sets.

Use the general wording:

```text
delete saved set
```

because a blocking saved set may be a working set or a final set.

Historical completed-service records do not block period changes as conflicting instances.

They remain historical inputs for future filtering.

---

## Discovery 23 — Permissions distinguish service sets, knowledge, repertoire and preferences

Current roles are:

```text
priest
organist
admin
congregation member
```

One real person may potentially hold more than one role, but permissions are described by role.

Service set permissions:

| Action | Priest | Organist | Admin | Congregation member |
|---|---:|---:|---:|---:|
| create working set | yes | yes | yes | no |
| edit working set | yes | yes | yes | no |
| save final set | yes | no | yes | no |
| delete working set | yes | yes | yes | no |
| delete final set | yes | no | yes | no |
| convert final set to completed-service record | yes | no | yes / system | no |

There is no direct edit final set action.

If a final set must be changed, it is deleted and recreated.

Knowledge and preference permissions:

| Action | Priest | Organist | Admin | Congregation member |
|---|---:|---:|---:|---:|
| manage repertoire | no | yes | yes | no |
| manage congregation preferences | no | no | yes | no |
| manage own song preferences | yes | yes | no | yes |
| manage knowledge | no | no | yes | no |

Admin-only knowledge management includes:

```text
manage melody equivalence
manage base song catalog
manage antiphon-to-song mappings
manage liturgical-season-to-song mappings
manage non-repetition period
```

Repertoire management is separate from knowledge management because an organist may manage repertoire.

Own song preferences are separate from admin management of congregation preferences.
