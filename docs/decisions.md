# Decisions

## Purpose
Use this document as an index for important product and technical decisions.

## Decision Record Format
For each decision, include an identifier, date, status, context, options considered, decision, consequences, and related links.

## Decision Log

### DEC-2026-07-06-01 — Song identity uses language and number

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Czech and Polish hymn numbering must remain distinct.
- **Options considered:** identify songs by number alone; identify songs by `(language, number)`.
- **Decision:** A song is identified conceptually by `(language, number)`.
- **Consequences:** Preferences, mappings, service rows, and catalog references must refer to concrete songs using language and number.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 11.

### DEC-2026-07-06-02 — Melody is modeled as equivalence between songs

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** The domain needs to recognize the same melody across different song entries without prematurely introducing a separately named melody object.
- **Options considered:** separately named melody entity; equivalence relation on songs.
- **Decision:** Melody is modeled conceptually as an equivalence relation on songs. A melody-equivalence class contains songs sharing the same melody, and singleton classes are valid.
- **Consequences:** Repertoire filtering, non-repetition, and candidate display operate at melody-equivalence-class level where relevant.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 12.

### DEC-2026-07-06-03 — Planning artifact is a concrete ordered service set

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Real services may include songs, instrumental contributions, external choir contributions, and notes.
- **Options considered:** fixed hymn slots only; flexible ordered service rows.
- **Decision:** The primary planning artifact is a concrete ordered service set with flexible rows. Rows may be added, removed, and reordered. A row without a song must contain a textual note.
- **Consequences:** Planning remains aligned with real service structure while still supporting the standard four-song case.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 13.

### DEC-2026-07-06-04 — Service sets use a four-state lifecycle

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** The domain needs clear treatment of absent, draft, final, and historical service sets.
- **Options considered:** separate deleted/cancelled states; four-state lifecycle without deleted/cancelled states.
- **Decision:** Service set states are `no set exists`, `working set`, `final set`, and `completed-service record`. Deleting a saved non-completed set returns to `no set exists`.
- **Consequences:** Completed-service records are historical, while working and final sets are non-completed plans.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 14.

### DEC-2026-07-06-05 — Antiphon and liturgical season are manual highlighting inputs

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Earlier assumptions that service date determines antiphon number and antiphon number determines liturgical season were corrected.
- **Options considered:** derive antiphon and season from date; require manual input and use mappings only for highlighting.
- **Decision:** Antiphon number and liturgical season are not prefilled from service date. Antiphon is user-entered, liturgical season is manually selected, and both highlight candidates after hard filtering. Forward antiphon protection is removed.
- **Consequences:** `(language, antiphon number)` may map to a recommended song for red highlighting; `(language, liturgical season)` may map to songs for green highlighting. Neither is a hard filter.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discoveries 15–16.

### DEC-2026-07-06-06 — Candidate lists use four hard filters before highlighting

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Candidate selection needs to distinguish eligibility from helpful liturgical highlighting.
- **Options considered:** include antiphon and season as hard filters; apply only repertoire, language, non-repetition, and preference threshold as hard filters.
- **Decision:** Hard filters are selected/default organist repertoire, service language, melody non-repetition rule, and preference threshold with default `x = 0`.
- **Consequences:** Antiphon and liturgical season can only highlight candidates that already passed hard filters.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 17.

### DEC-2026-07-06-07 — Preferences belong to concrete songs and are role-weighted

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Preferences must preserve language-specific song identity and reflect different role weights.
- **Options considered:** store preferences at melody-equivalence-class level; store preferences on concrete songs.
- **Decision:** Preferences belong to concrete songs `(language, song number)` and do not transfer automatically across a melody-equivalence class. Priest scores range `0–3`, organist `0–2`, congregation member `0–1`, and admin has no own preference.
- **Consequences:** Candidate preference filtering uses total summed role-weighted score for the concrete song.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 18.

### DEC-2026-07-06-08 — Melody non-repetition applies to melody-equivalence classes

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Repeating the same melody under another song number should still count as repetition.
- **Options considered:** check individual songs; check melody-equivalence classes.
- **Decision:** The melody non-repetition rule applies to melody-equivalence classes, has no exceptions, and consists of backward historical checking plus forward protection of saved future plans.
- **Consequences:** Completed-service records provide backward filtering input; saved future working and final sets provide forward protection. Rows without concrete songs are ignored.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 20.

### DEC-2026-07-06-09 — Conflicts are limited to non-completed plans

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Historical completed-service records should inform future planning but not be judged against each other as conflicts.
- **Options considered:** define conflicts among all service records; define conflicts only among non-completed plans.
- **Decision:** Conflicts exist only among the currently edited plan, saved future working sets, and saved future final sets.
- **Consequences:** Completed-service records affect backward non-repetition filtering but are not mutually judged as conflicting instances. Non-repetition period changes are blocked only when they would create conflicts between currently saved non-completed plans.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discoveries 21–22.

### DEC-2026-07-06-10 — Permissions separate service sets, knowledge, repertoire, and preferences

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context:** Different roles are responsible for different kinds of domain activity.
- **Options considered:** broad shared editing rights; separated responsibility by activity area.
- **Decision:** Permissions distinguish service set management, shared knowledge management, organist repertoire management, congregation preference administration, and own song preferences.
- **Consequences:** Admin manages shared knowledge and congregation preferences; organist manages repertoire; priest and admin can save final sets; priest, organist, and congregation member can manage own song preferences within their role limits.
- **Related:** `docs/analysis-log.md` session 2026-07-06, Discovery 23.

## Active Proposals

No active proposals are recorded at this time.

## Superseded Decisions

No formal decisions are superseded. The 2026-07-06 antiphon and liturgical-season decision corrects an earlier working assumption, not a previously accepted decision.

## Review Cadence

Review decisions when domain analysis changes, when requirements are drafted from these decisions, or when implementation exposes a mismatch with the documented domain model.
