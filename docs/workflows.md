# Workflows

## Purpose
Use this document to describe important user, business, operational, and administrative workflows at the product/domain level.

These workflows translate accepted analysis into expected behavior without specifying technical architecture, database schema, UI component design, or implementation details.

## Workflow Format
Each workflow uses:

- **Goal** — the outcome the workflow supports.
- **Actors** — roles involved in the workflow.
- **Preconditions** — conditions before the workflow begins.
- **Steps** — expected product/domain flow.
- **Exceptions** — important alternate paths or blocked actions.
- **Outputs** — resulting domain state or information.
- **Related requirements** — requirement identifiers supported by the workflow.

## User Workflows

### WF-001 — Open planning for an upcoming service

- **Goal:** Start planning from practical defaults when no set exists.
- **Actors:** Priest, organist, admin.
- **Preconditions:** No working set or final set exists for the upcoming service being opened.
- **Steps:**
  1. The actor opens the app for planning.
  2. The service date is derived from the app opening date.
  3. The priest and organist default to the priest and organist from the chronologically latest completed-service record.
  4. The language defaults to Polish when the service date is the second Sunday of the month; otherwise it defaults to Czech.
  5. The time defaults to `10:00` and remains informational only.
  6. The antiphon number starts empty.
  7. The liturgical season starts as none / empty.
- **Exceptions:**
  - If a working set already exists, opening planning resumes the working set instead of creating defaults for a new absent set.
  - If a final set already exists, opening planning shows the final set rather than creating a separate working set by default.
  - The app does not derive antiphon number or liturgical season from service date.
- **Outputs:** Planning context in `no set exists`, `working set`, or `final set` state, depending on already saved service-set state.
- **Related requirements:** REQ-004, REQ-005

### WF-002 — Create or edit a working set

- **Goal:** Build a concrete ordered service set that can still be changed.
- **Actors:** Priest, organist, admin.
- **Preconditions:** The service is in `no set exists` or `working set` state, and the actor is authorized to create or edit working sets.
- **Steps:**
  1. The actor creates a working set or opens an existing working set.
  2. The working set starts from the standard planning case of four song slots when appropriate.
  3. The actor may add, remove, and reorder rows.
  4. For a song row, the actor selects a concrete song identified by `(language, number)`.
  5. For a non-song row, the actor enters a textual note describing the instrumental, choir, free-form, or other contribution.
  6. The actor saves the working set.
- **Exceptions:**
  - A row without a song cannot be saved unless it contains a textual note.
  - Congregation members cannot create, edit, or delete working sets.
- **Outputs:** A saved working set, or an updated working set if one already existed.
- **Related requirements:** REQ-001, REQ-003, REQ-004, REQ-012

### WF-003 — Select candidates while planning

- **Goal:** Present eligible song candidates with contextual highlighting and melody-class information.
- **Actors:** Priest, organist, admin.
- **Preconditions:** A service planning context exists with selected/default organist, language, non-repetition period, and preference threshold available. Antiphon number and liturgical season may be empty.
- **Steps:**
  1. The candidate list starts from known concrete songs and their melody-equivalence classes.
  2. The repertoire filter keeps melody-equivalence classes that contain at least one song explicitly in the selected/default organist's repertoire.
  3. The language filter limits displayed concrete songs to Czech for Czech service, Polish for Polish service, and Czech plus Polish for mixed service.
  4. The melody non-repetition rule removes melody-equivalence classes blocked by completed-service history or saved future working/final sets within the configured period.
  5. The preference filter keeps concrete songs whose total summed preference score is at least threshold `x`, default `0`.
  6. Antiphon matches are highlighted when `(language, antiphon number)` maps to a candidate song that already passed hard filters.
  7. Liturgical-season matches are highlighted when `(language, liturgical season)` maps to candidate songs that already passed hard filters.
  8. Each candidate record shows relevant songs from the melody-equivalence class.
  9. Explicit repertoire songs are shown in bold.
  10. If a Czech or Polish service would hide all explicit repertoire songs because of same-language display, exactly one arbitrary opposite-language repertoire song from the same melody-equivalence class is added and shown in bold.
- **Exceptions:**
  - Antiphon and liturgical season never restore a candidate removed by a hard filter.
  - Forward antiphon protection is not applied.
  - For mixed services, the opposite-language repertoire exception does not apply because both Czech and Polish songs are displayed.
- **Outputs:** Candidate records that passed hard filters, with relevant melody-class songs, bold repertoire visibility, and optional antiphon or season highlighting.
- **Related requirements:** REQ-002, REQ-006, REQ-007, REQ-008, REQ-009, REQ-013

### WF-004 — Save a final set

- **Goal:** Record the selected final service set for a service.
- **Actors:** Priest, admin.
- **Preconditions:** The service is in `no set exists` or `working set` state, required service-set information is present, and every non-song row contains textual note content.
- **Steps:**
  1. The actor reviews the ordered rows of the planned set.
  2. The actor saves the set as final.
  3. The service enters `final set` state.
- **Exceptions:**
  - Organists and congregation members cannot save final sets.
  - A final set is not directly edited after it is saved.
  - If a final set must change, an authorized actor deletes it and creates a replacement set.
- **Outputs:** A saved final set that represents the final selected plan for the service.
- **Related requirements:** REQ-003, REQ-004, REQ-012

### WF-005 — Delete a working or final set

- **Goal:** Return a service to `no set exists` when a saved non-completed plan should no longer be used.
- **Actors:** Priest, organist, admin for working sets; priest and admin for final sets.
- **Preconditions:** A working set or final set exists, and the actor is authorized to delete that set type.
- **Steps:**
  1. The actor chooses to delete the saved non-completed set.
  2. The set is removed as the saved plan for that service.
  3. The service returns to `no set exists`.
- **Exceptions:**
  - Organists cannot delete final sets.
  - Congregation members cannot delete working or final sets.
  - Completed-service records are historical records, not non-completed plans deleted through this planning workflow.
- **Outputs:** The service has no saved set.
- **Related requirements:** REQ-004, REQ-012

### WF-006 — Complete a service from a final set

- **Goal:** Convert the final selected plan into historical completed-service record used for future planning.
- **Actors:** Priest, admin, system.
- **Preconditions:** A final set exists for the service.
- **Steps:**
  1. After the service, a priest or admin may convert the final set to a completed-service record.
  2. The system may also convert the final set to a completed-service record automatically after a default time.
  3. The completed-service record preserves the concrete songs and ordered service rows that represent what was finalized for the service.
  4. The record becomes historical input for backward melody non-repetition checks.
- **Exceptions:**
  - Automatic conversion is an allowed product direction but is not fully specified yet.
  - The exact default time and automatic conversion behavior remain open workflow/product questions.
  - Completed-service records are not non-completed plans.
  - Completed-service records are not judged as conflicts; they only provide backward non-repetition input.
- **Outputs:** A completed-service record for historical planning knowledge.
- **Related requirements:** REQ-004, REQ-009, REQ-010, REQ-012

## Administrative Workflows

### WF-007 — Manage repertoire

- **Goal:** Keep an organist's explicit playable song knowledge available for planning.
- **Actors:** Organist, admin.
- **Preconditions:** The actor is authorized to manage repertoire.
- **Steps:**
  1. The actor records or updates songs explicitly present in an organist's repertoire.
  2. Each repertoire entry refers to a concrete song identified by `(language, number)`.
  3. Candidate planning uses melody-equivalence classes so that a melody can pass the repertoire filter when any song in its class is explicitly in the selected/default organist's repertoire.
- **Exceptions:**
  - Priests and congregation members cannot manage repertoire.
  - Repertoire management does not itself change shared melody-equivalence knowledge.
- **Outputs:** Updated organist repertoire used by candidate filtering and candidate display.
- **Related requirements:** REQ-001, REQ-002, REQ-007, REQ-008, REQ-012

### WF-008 — Manage preferences

- **Goal:** Maintain role-weighted preference scores for concrete songs.
- **Actors:** Priest, organist, congregation member, admin.
- **Preconditions:** The actor is authorized for the preference activity being performed.
- **Steps:**
  1. A priest may set their own preference for a concrete song from `0` to `3`.
  2. An organist may set their own preference for a concrete song from `0` to `2`.
  3. A congregation member may set their own preference for a concrete song from `0` to `1`.
  4. Admin may administer congregation preferences.
  5. Candidate filtering uses the total summed preference score for each concrete song.
- **Exceptions:**
  - Admin has no own preference score.
  - Preferences do not automatically transfer across songs in the same melody-equivalence class.
  - Only admin may administer congregation preferences.
- **Outputs:** Updated preference scores available to the preference threshold filter.
- **Related requirements:** REQ-001, REQ-012, REQ-013

### WF-009 — Manage shared knowledge

- **Goal:** Preserve shared planning knowledge under admin responsibility.
- **Actors:** Admin.
- **Preconditions:** The actor has the admin role.
- **Steps:**
  1. Admin manages the base song catalog using concrete song identity `(language, number)`.
  2. Admin manages melody equivalence between songs.
  3. Admin manages antiphon mappings from `(language, antiphon number)` to concrete songs.
  4. Admin manages liturgical-season mappings from `(language, liturgical season)` to songs.
  5. Admin manages the melody non-repetition period subject to conflict validation.
- **Exceptions:**
  - Priest, organist, and congregation member roles do not manage shared knowledge.
  - Antiphon and liturgical-season mappings provide highlighting, not hard filtering.
- **Outputs:** Updated shared knowledge available to planning, highlighting, candidate display, and non-repetition checks.
- **Related requirements:** REQ-001, REQ-002, REQ-006, REQ-011, REQ-012

### WF-010 — Change the melody non-repetition period

- **Goal:** Adjust the planning window for melody non-repetition without creating conflicts among saved non-completed plans.
- **Actors:** Admin.
- **Preconditions:** The actor has the admin role.
- **Steps:**
  1. Admin proposes a new non-repetition period.
  2. The change is checked against currently saved non-completed plans.
  3. If the proposed period would not create conflicts between saved non-completed plans, the period is changed.
  4. Future candidate filtering and conflict checks use the new period.
- **Exceptions:**
  - If the proposed period would create a conflict between currently saved non-completed plans, the change is blocked.
  - The block applies even to admin.
  - The block can only be removed by deleting one or more conflicting saved sets.
  - Completed-service records provide backward history but are not themselves conflicts between non-completed plans.
- **Outputs:** Either an updated non-repetition period or a blocked change with conflicting saved sets requiring deletion before retry.
- **Related requirements:** REQ-009, REQ-010, REQ-011, REQ-012

## System Workflows

### WF-011 — Apply melody non-repetition during planning

- **Goal:** Prevent repetition of melody-equivalence classes across relevant history and saved future plans.
- **Actors:** System behavior supporting priest, organist, and admin planning.
- **Preconditions:** A planned service date, configured non-repetition period, melody-equivalence knowledge, completed-service records, and saved future working/final sets are available.
- **Steps:**
  1. For each candidate song, identify its melody-equivalence class.
  2. Check completed-service records within the configured period before the planned service date.
  3. Exclude candidate melody-equivalence classes found in those completed-service records.
  4. Check saved future working sets and final sets within the configured period after the planned service date.
  5. Exclude candidate melody-equivalence classes found in those saved future non-completed plans.
  6. Ignore rows that do not contain concrete songs.
- **Exceptions:**
  - The rule has no exceptions for song language, service type, antiphon, liturgical season, or role.
  - Forward antiphon protection is not applied.
- **Outputs:** Melody-equivalence classes eligible or excluded by the non-repetition rule.
- **Related requirements:** REQ-002, REQ-009, REQ-010

## Development Workflows

No development workflows are defined in this product workflow document.

## Edge Cases and Exceptions

- A row without a song must contain textual note content before the service set can be saved.
- A final set cannot be directly edited; it must be deleted and recreated if it must change.
- Deleting a working set or final set returns the service to `no set exists`.
- Antiphon and liturgical season only highlight candidates that already passed hard filters.
- Candidate filtering does not include forward antiphon protection.
- Free-form rows without songs are ignored by melody non-repetition checks.
- Conflicts are defined only among non-completed plans.
- Changing the non-repetition period is blocked when it would create a conflict between currently saved non-completed plans.

## Open Workflow Questions

- What exact default time should trigger automatic conversion of a final set to a completed-service record?
- What exact automatic conversion behavior should apply around that default time?

## Phase 29 catalog lookup workflow

Planning users search for a priest, organist, or song and then choose a concrete catalog result. The visible search text is only a search aid; save validation requires the chosen catalog ID for new or changed selections. Existing saved references that later become inactive or role-ineligible may be re-saved unchanged, preserving their snapshots, but they cannot be chosen again until made eligible.

Local admins use the minimal catalog administration surface to maintain people and to activate/deactivate songs. Development/demo catalog data is loaded explicitly with `npm run db:seed:catalog` after `npm run db:migrate` when using `ORGANY_RUNTIME=db`.

### Phase 29 editor lookup completion

The Planning Lifecycle editor now uses catalog lookup controls for priest, organist, and song rows. Typing in a lookup box is search text only; changing the text clears the selected catalog ID until the user chooses a result. Legacy snapshots without IDs are shown as saved snapshots and remain readable, but a new or changed save must select an eligible active catalog record. The same in-memory catalog instance backs both lookup/admin UI and the in-memory Planning Lifecycle service, so local runtime no longer bypasses catalog validation.

Admin catalog controls are intentionally minimal: people can be added, renamed, assigned priest/organist roles, activated, and deactivated; songs can only be listed and activated/deactivated. Song creation and metadata editing remain import-only future work.

Language changes preserve already selected song snapshots. The editor keeps existing song selections visible, limits only subsequent lookup results to the new service language, and relies on the existing save confirmation for language-deviation rows.

### Phase 29 development seed smoke

Run `npm run db:catalog-seed-smoke` against a disposable or development PostgreSQL database after migration to verify that the explicit Phase 29 catalog seed is idempotent against the real Drizzle/PostgreSQL repository. The smoke uses a transaction rollback and marker-scoped foreign records; it must not reset the database or broadly delete catalog data.

Confirmed language deviations are now carried through the lifecycle save input as `allowLanguageDeviations`. The UI sets it only after the user confirms a visible mismatch; the service still requires a real active catalog song with `songId` and only relaxes the service-language match.

Lookup result rendering is guarded by request generations. Typing, selecting, clearing, or changing service language invalidates stale person/song lookup requests so late responses cannot restore obsolete results.
