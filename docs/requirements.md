# Requirements

## Purpose
Use this document to capture product and domain requirements before implementation.

Requirements in this document translate accepted domain analysis and decisions into expected system behavior. They intentionally avoid technical architecture, database schema, UI component design, and implementation tasks.

## Requirement Format
Each requirement uses:

- **Status** — current requirement status.
- **Rationale** — why the requirement exists.
- **Acceptance criteria** — product-level conditions that must be true.
- **Related decisions** — accepted decisions that justify the requirement.

## Functional Requirements

### REQ-001 — Song identity

- **Status:** Accepted
- **Rationale:** Czech and Polish hymn-book numbers are independent, so a number alone cannot identify a song.
- **Acceptance criteria:**
  - The system treats a song as a concrete hymn-book entry identified by `(language, number)`.
  - Song references in service rows, preferences, repertoire, antiphon mappings, and liturgical-season mappings refer to concrete songs using both language and number.
  - The system does not treat song number alone as sufficient song identity.
- **Related decisions:** DEC-2026-07-06-01

### REQ-002 — Melody equivalence

- **Status:** Accepted
- **Rationale:** Different song entries may share the same melody, including across languages and numbers.
- **Acceptance criteria:**
  - The system supports melody as an equivalence relation on songs.
  - Each song belongs to one melody-equivalence class at a given point in domain knowledge.
  - A song with no known related songs is treated as a singleton melody-equivalence class.
  - Melody-equivalence classes can be used by repertoire filtering, candidate display, and non-repetition rules.
- **Related decisions:** DEC-2026-07-06-02

### REQ-003 — Flexible ordered service sets

- **Status:** Accepted
- **Rationale:** Real services may include songs, instrumental music, choir contributions, and other notes rather than only fixed hymn slots.
- **Acceptance criteria:**
  - The system supports a concrete ordered service set for one service.
  - The standard planning case supports four song slots.
  - Service-set rows can be added, removed, and reordered.
  - A service-set row may contain a concrete song.
  - A service-set row without a song is allowed only when it contains a textual note.
- **Related decisions:** DEC-2026-07-06-03

### REQ-004 — Service-set lifecycle states

- **Status:** Accepted
- **Rationale:** Planning must distinguish absent, editable, final, and historical service records.
- **Acceptance criteria:**
  - For a service, the system recognizes these states: `no set exists`, `working set`, `final set`, and `completed-service record`.
  - A working set is a saved non-final set that can still be edited by authorized roles.
  - A final set is a saved final plan and is not directly editable.
  - If a final set must change, it must be deleted and recreated.
  - A completed-service record is historical and is not a non-completed plan.
  - Priest and admin may convert a final set to a completed-service record.
  - The system may also convert a final set to a completed-service record automatically after a default time.
  - Automatic conversion is an allowed product direction, but the exact default time and automatic conversion behavior remain open product/workflow questions.
  - Deleting a saved working set or final set returns the service to `no set exists`.
  - The system does not require separate deleted or cancelled service-set states.
- **Related decisions:** DEC-2026-07-06-04

### REQ-005 — Default planning values when opening the app

- **Status:** Accepted
- **Rationale:** Opening planning for an upcoming service should provide practical defaults without deriving unavailable liturgical knowledge.
- **Acceptance criteria:**
  - When no working or final set exists for the upcoming service, the service date is derived from the app opening date.
  - The default priest and organist are copied from the chronologically latest completed-service record.
  - The service language defaults to Polish when the service date is the second Sunday of the month.
  - The service language defaults to Czech otherwise.
  - The service time defaults to `10:00` and is informational only.
  - The antiphon number defaults to empty.
  - The liturgical season defaults to none / empty.
  - The system does not derive antiphon number or liturgical season from service date.
- **Related decisions:** DEC-2026-07-06-05

### REQ-006 — Antiphon and liturgical-season highlighting inputs

- **Status:** Accepted
- **Rationale:** Antiphon and liturgical season provide useful context, but they should not restrict candidate eligibility.
- **Acceptance criteria:**
  - Antiphon number is entered manually.
  - Liturgical season is selected manually and may remain none / empty.
  - `(language, antiphon number)` may map to a recommended concrete song for antiphon highlighting.
  - `(language, liturgical season)` may map to songs for liturgical-season highlighting.
  - Antiphon and liturgical season do not act as hard candidate filters.
  - Candidate highlighting occurs only after hard filters have been applied.
  - The system does not provide forward antiphon protection.
- **Related decisions:** DEC-2026-07-06-05, DEC-2026-07-06-06

### REQ-007 — Candidate hard filters

- **Status:** Accepted
- **Rationale:** Candidate eligibility must separate playable, language-appropriate, non-repeating, and sufficiently preferred songs from contextual highlighting.
- **Acceptance criteria:**
  - Candidate lists apply hard filters before antiphon or liturgical-season highlighting.
  - The hard filters are selected/default organist repertoire, service language, melody non-repetition rule, and preference threshold.
  - The default preference threshold is `x = 0`.
  - A candidate passes the repertoire filter when its melody-equivalence class contains at least one song explicitly in the selected/default organist's repertoire.
  - For a Czech service, the language filter displays Czech songs.
  - For a Polish service, the language filter displays Polish songs.
  - For a mixed service, the language filter displays Czech and Polish songs.
  - The preference filter uses the total summed preference score for the concrete song and shows songs with total score at least `x`.
- **Related decisions:** DEC-2026-07-06-06, DEC-2026-07-06-07, DEC-2026-07-06-08

### REQ-008 — Candidate display for melody-equivalence classes

- **Status:** Accepted
- **Rationale:** Users need to see the relevant song options in a melody-equivalence class while preserving visibility of the organist's explicit repertoire.
- **Acceptance criteria:**
  - Candidate records show relevant songs from the melody-equivalence class.
  - A song explicitly present in the selected/default organist's repertoire is displayed in bold.
  - For Czech or Polish services, if same-language display would hide all explicit repertoire songs in the class, the candidate record adds exactly one arbitrary opposite-language repertoire song from the same melody-equivalence class.
  - The added opposite-language repertoire song is displayed in bold.
  - For mixed services, no opposite-language exception is needed because Czech and Polish songs are already displayed.
- **Related decisions:** DEC-2026-07-06-02, DEC-2026-07-06-06

### REQ-009 — Melody non-repetition rule

- **Status:** Accepted
- **Rationale:** Reusing the same melody under a different song number still counts as repetition.
- **Acceptance criteria:**
  - The non-repetition rule applies to melody-equivalence classes, not individual songs.
  - The rule has no exceptions.
  - Backward checking uses completed-service records within the configured period before the planned service date.
  - Forward protection checks saved future working sets and final sets within the configured period after the planned service date.
  - Saved future working sets and final sets can exclude candidate melody-equivalence classes from earlier planned services.
  - Rows without concrete songs are ignored by non-repetition checks.
  - Forward antiphon protection is not part of non-repetition.
- **Related decisions:** DEC-2026-07-06-08, DEC-2026-07-06-09

### REQ-010 — Conflict scope among plans

- **Status:** Accepted
- **Rationale:** Historical records should inform planning but should not be treated as conflicts with each other.
- **Acceptance criteria:**
  - Conflicts are defined only among non-completed plans.
  - Non-completed plans include the currently edited plan, saved future working sets, and saved future final sets.
  - Completed-service records affect backward non-repetition filtering.
  - Completed-service records are not judged as conflicts; they only provide backward non-repetition input.
- **Related decisions:** DEC-2026-07-06-09

### REQ-011 — Non-repetition period administration

- **Status:** Accepted
- **Rationale:** The repetition window is shared planning configuration and must not introduce conflicts among saved non-completed plans.
- **Acceptance criteria:**
  - The default non-repetition period is 2 months.
  - Only admin may change the non-repetition period.
  - A non-repetition period change is blocked if it would create a conflict between currently saved non-completed plans.
  - The block applies even when the change is attempted by admin.
  - The only way to unblock the change is to delete one or more conflicting saved sets.
- **Related decisions:** DEC-2026-07-06-09, DEC-2026-07-06-10

### REQ-012 — Role permissions

- **Status:** Accepted
- **Rationale:** Different roles own different parts of service planning, repertoire, preferences, and shared knowledge.
- **Acceptance criteria:**
  - Supported roles are priest, organist, admin, and congregation member.
  - Priest, organist, and admin may create and edit working sets.
  - Priest, organist, and admin may delete working sets.
  - Priest and admin may save final sets.
  - Priest and admin may delete final sets.
  - Priest and admin may convert final sets to completed-service records.
  - The system provides no direct edit final set action.
  - Organist and admin may manage repertoire.
  - Priest, organist, and congregation member may manage their own song preferences.
  - Admin has no own song preference.
  - Admin alone may administer congregation preferences.
  - Admin alone may manage shared knowledge, including melody equivalence, base song catalog, antiphon mappings, liturgical-season mappings, and non-repetition period.
  - Congregation members do not administer service sets, repertoire, or shared knowledge.
- **Related decisions:** DEC-2026-07-06-10

### REQ-013 — Role-weighted preferences

- **Status:** Accepted
- **Rationale:** Preferences need to reflect concrete song identity and role-specific weight while remaining simple enough for candidate filtering.
- **Acceptance criteria:**
  - Preferences belong to concrete songs `(language, song number)`.
  - Preferences do not automatically transfer across a melody-equivalence class.
  - Priest own preference scores range from `0` to `3`.
  - Organist own preference scores range from `0` to `2`.
  - Congregation member own preference scores range from `0` to `1`.
  - Admin has no own preference score.
  - The total preference score is the sum of role-weighted preferences for the concrete song.
  - Candidate preference filtering uses the total summed score and threshold `x`.
- **Related decisions:** DEC-2026-07-06-07

## Non-Functional Requirements

No non-functional requirements are accepted yet.

## User Stories

User stories are intentionally deferred until product scope is decomposed further. The accepted requirements above are the current source for expected product behavior.

## Acceptance Criteria

Acceptance criteria are listed under each functional requirement.

## Constraints

- Current product scope is one local congregation.
- Service time is informational only and has no filtering or decision-making effect.
- Antiphon number and liturgical season are manual inputs and must not be derived from service date.
- Final sets are not directly edited; required changes happen by deleting and recreating the final set.
- Product requirements must remain separate from technical architecture, database schema, UI component design, implementation tasks, backlog items, and roadmap planning.

## Traceability

Requirements should be traced to accepted decisions in `docs/decisions.md` and to domain concepts in `docs/domain-analysis.md` and `docs/domain-model.md`. Future backlog items, tests, and release notes should reference requirement identifiers when implementation work begins.

## Phase 29 lookup requirements

- Priest and organist fields use lookup of active catalog persons with the matching role; typed search text alone is not a valid new selection.
- Song rows use lookup of active catalog songs scoped by service language: Czech services show Czech songs, Polish services show Polish songs, and Mixed services show both.
- Song lookup searches number and title and exposes a sheet-music link only when the catalog record has one.
- Note-only planning rows remain valid.
- Admin may add/update/deactivate people and manage priest/organist role membership. Admin may only activate/deactivate catalog songs in the application UI/API; song creation/editing is reserved for a future import milestone.
- The explicit development seed is `npm run db:seed:catalog`; it is not run by migrations or application startup.
- Lookup foundation is separate from candidate filtering. The candidate-selection engine, melody knowledge, repertoire, preference thresholds, full Czech/Polish import, and automatic hymn picking remain future work.

Phase 29 implementation also requires that unchanged inactive song references be matched independently of row position, so moving rows, inserting note-only rows before a saved song, or deleting other rows does not force a valid historical snapshot through current catalog eligibility again. Additional occurrences beyond the originally saved snapshot count are treated as new selections.
