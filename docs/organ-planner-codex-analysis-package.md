# Organ Planner — analytical update package for Codex

## Context

The repository contains `docs/analysis-log.md`, which is the chronological analytical memory of the project.

The current document already establishes the main framing:

- Organ Planner is primarily a knowledge-management system, not merely a hymn planner.
- Knowledge is stored in the system; decisions remain human.
- The priest is the final decision-maker.
- The organist is a curator of musical knowledge.
- Congregation members contribute preference information.
- Planning models real liturgical events, not just hymn numbers.

This package adds the next approved analytical conclusions. Do not implement application logic yet. Update documentation only.

---

# 1. Core domain definitions

## Song

A song is defined as:

```text
song = (language, number)
```

Examples:

```text
(Czech, 28)
(Polish, 613)
```

The number alone is not sufficient, because Czech and Polish hymn numbering must be distinguished.

## Melody

A melody is not currently modeled as a separately named object.

Instead:

```text
melody = equivalence relation on songs
```

A melody-equivalence class is a set of songs sharing the same melody.

Example:

```text
{
  (Czech, 28),
  (Polish, 613),
  (Czech, 784),
  (Czech, 202),
  (Czech, 513),
  (Polish, 98)
}
```

Each song belongs to some melody-equivalence class. If no related songs are known yet, the song forms a singleton class.

Melody-equivalence classes may later be extended or merged when new knowledge is discovered. Such changes are admin-only and affect future interpretation of historical records.

---

# 2. Concrete service set

The primary working artifact is a concrete ordered set of items for one service.

In the standard case, it contains four song slots, but the number of items is flexible.

Rows can be added, removed, and reordered.

A row is a free-form item. It does not necessarily contain a song and does not necessarily represent a musical item.

Rule:

```text
If a row does not contain a song, it must contain a textual note.
```

---

# 3. State model

A concrete service set has four states:

```text
1. no set exists
2. working set
3. final set
4. completed-service record
```

There is no separate deleted/cancelled state.

If a saved non-completed set is deleted, the service returns to:

```text
no set exists
```

## Transitions

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

if all required data are filled and an authorized user clicks the final button.

Deletion:

```text
working set
→ no set exists

final set
→ no set exists
```

Use the general term:

```text
deleting a saved set
```

not only “deleting a final set”, because both a working set and a final set can be relevant for future-plan conflict validation.

A completed-service record is historical and is not treated as a non-completed plan.

---

# 4. Default opening of the app

This applies when no working or final set exists for the upcoming service.

On app opening:

```text
app opening date
→ service date
```

The app does not derive antiphon number or liturgical season from the service date.

Default values:

- service date: derived from app opening date,
- priest: copied from the chronologically latest service record,
- organist: copied from the chronologically latest service record,
- language:
  - Polish if the planned service date is the second Sunday of the month,
  - Czech otherwise,
- time: default `10:00`, informational only,
- antiphon number: empty,
- liturgical season: none / empty.

Service time has no filtering or decision-making effect.

---

# 5. Antiphon and liturgical season — revised model

The previous assumption that antiphon and liturgical season can be derived from date is invalid.

The following relationships cannot be reliably obtained:

```text
service date → antiphon number
antiphon number → liturgical season
```

Therefore:

- antiphon number is not prefilled,
- liturgical season is not prefilled,
- forward antiphon protection is completely removed.

## Antiphon

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

## Liturgical season

Liturgical season is manually selected by the user.

Default value:

```text
none / empty
```

The available mapping is:

```text
(language, liturgical season) → songs
```

If matching songs are present in the currently filtered candidate list, they are highlighted green.

Liturgical season is not a hard filter.

Mappings are language-specific:

```text
(Czech, antiphon number) → Czech song
(Polish, antiphon number) → Polish song

(Czech, liturgical season) → Czech songs
(Polish, liturgical season) → Polish songs
```

---

# 6. Candidate song list

The candidate list is a filtered view of the knowledge base.

Hard filters:

```text
1. selected/default organist's repertoire
2. service language
3. melody non-repetition rule
4. preference threshold, default x = 0
```

Antiphon and liturgical season are not hard filters; they only highlight candidates that already passed the hard filters.

## Organist repertoire filter

The organist repertoire filter is the primary hard filter.

A candidate song passes this filter if its melody-equivalence class contains at least one song explicitly present in the selected organist's repertoire.

Example:

```text
organist repertoire contains:
(Czech, 28)

melody-equivalence class:
{
  (Czech, 28),
  (Polish, 613),
  (Czech, 784)
}

All songs in this melody class pass the repertoire filter.
```

## Language filter

The language filter applies to concrete songs:

```text
Czech service → show Czech songs
Polish service → show Polish songs
Mixed service → show Czech and Polish songs
```

## Preference filter

Preferences are assigned to concrete songs:

```text
(language, song number)
```

Preferences do not automatically transfer across a melody-equivalence class.

The filter means:

```text
show only songs with total preference score at least x
```

Default:

```text
x = 0
```

---

# 7. Candidate display

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

This must be visible even if the explicit repertoire song is not in the same language as the current service.

Therefore:

- for Czech or Polish service, if the language-filtered melody-class display does not contain any explicit repertoire song, add exactly one arbitrary opposite-language repertoire song from the same class and mark it bold;
- for mixed service, this exception cannot occur because both Czech and Polish songs are already displayed.

---

# 8. Melody non-repetition rule

Use the term:

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

## Backward historical check

A candidate melody-equivalence class must not have been used in completed-service records within the non-repetition period before the currently planned service date.

Historical records are used as input for filtering.

Conflicts are not defined between historical records themselves.

## Forward protection of saved future plans

When planning a service, the system must check saved future working and final sets within the non-repetition period after the currently planned service date.

Melody classes already used in these saved future sets are protected.

Only rows containing a concrete song participate in this check.

Free-form rows without a song are ignored.

---

# 9. Non-repetition period

Default value:

```text
2 months
```

Only admin may change it.

Changing the non-repetition period is restricted.

If changing the period would create a conflict between currently saved non-completed plans, the system must not allow the change, even for admin.

The only way to unblock such a change is to delete one or more conflicting saved future sets.

Use the general wording:

```text
delete saved set
```

because a blocking saved set may be working or final.

Historical completed-service records do not block period changes as conflicting instances. They remain historical inputs for future filtering.

---

# 10. Conflict scope

Conflicts are defined only among non-completed plans:

- the currently edited plan,
- saved future working sets,
- saved future final sets.

Conflicts are not defined among completed-service records.

Completed-service records affect backward non-repetition filtering but are not mutually judged as conflicts.

---

# 11. Roles

Current roles:

```text
priest
organist
admin
congregation member
```

One real person may potentially hold more than one role, but permissions are described by role.

---

# 12. Permissions

## Service set permissions

| Action | Priest | Organist | Admin | Congregation member |
|---|---:|---:|---:|---:|
| create working set | yes | yes | yes | no |
| edit working set | yes | yes | yes | no |
| save final set | yes | no | yes | no |
| delete working set | yes | yes | yes | no |
| delete final set | yes | no | yes | no |
| convert final set to completed-service record | yes | no | yes / system | no |

There is no direct “edit final set” action.

If a final set must be changed, it is deleted and recreated.

## Knowledge and preference permissions

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

Repertoire management is separate from knowledge management because organist may manage repertoire.

Congregation preference administration is also separate.

---

# 13. Preferences

Preferences belong to concrete songs:

```text
(language, song number)
```

Own preference ranges:

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

The candidate-list preference filter uses this total score:

```text
show songs with total preference score at least x
```

---

# Documentation update guidance

Update documentation only. Do not implement app code.

Recommended order:

1. `docs/analysis-log.md`
   - add new discoveries chronologically after the existing ones;
   - explicitly mark the antiphon/liturgical-season revision as a correction of an earlier working assumption.

2. `docs/domain-analysis.md`
   - describe the domain concepts and reasoning.

3. `docs/domain-model.md`
   - define song, melody equivalence, service set, set item, state model, roles, preferences.

4. `docs/requirements.md`
   - convert conclusions into functional requirements.

5. `docs/workflows.md`
   - document opening the app, filtering candidates, saving working/final set, deleting saved set, converting to completed record, changing non-repetition period.

6. `docs/decisions.md`
   - record key decisions:
     - song = `(language, number)`;
     - melody = equivalence relation;
     - antiphon/liturgical season are manual highlighting inputs, not derived from date;
     - no forward antiphon protection;
     - non-repetition rule uses history + future saved plans;
     - conflicts only among non-completed plans;
     - final set is not edited directly.

7. `docs/backlog.md` and `docs/roadmap.md`
   - update only after the analytical documents are aligned.
