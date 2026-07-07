# Legacy Data Assessment

## Purpose
This document assesses legacy data as a product/domain input and constraint for future decisions.

It does not define a migration strategy, target schema, import process, synchronization approach, data-cleaning workflow, implementation task, or technical design. It is organized around the accepted domain model so future migration planning can be based on explicit product/domain understanding rather than assumptions about old tables or files.

## Assessment Status

- **Repository inspection date:** 2026-07-07
- **Inspection scope:** read-only repository file inspection
- **Legacy sources found in repository:** none found
- **Known external context:** the analysis log and architecture note that an existing legacy database exists and is expected to contain approximately ten tables, but that database, schema, dump, or file export is not present in this repository.

Because no legacy database, schema dump, SQL files, CSV exports, spreadsheet files, or other legacy data files were found in the repository, this document is currently an assessment template/checklist for later manual completion.

## 1. Legacy Source Overview

### Found or Not Found

No legacy data source was found in the repository during read-only inspection.

No confirmed legacy tables, columns, records, schema files, export files, import files, or database binaries are available here for direct assessment.

### Confirmed Tables, Files, or Entities

None confirmed from repository contents.

The only currently confirmed legacy-data fact is contextual rather than inspectable: project analysis records that an existing legacy database exists with approximately ten tables. That source has not been provided in the repository, so its structure and contents remain unknown.

### Unknowns

The following remain unknown until a legacy database, schema, export, or manual inventory is provided:

- whether legacy songs are identified by language, number, title, book, internal ID, or another field;
- whether Czech and Polish song numbers are stored distinctly or can be confused by number alone;
- whether melody relationships are explicit, implicit, free-form, or absent;
- whether organist repertoire is represented separately from the song catalog;
- whether antiphon mappings exist and whether they include language;
- whether liturgical-season mappings exist and how seasons are named;
- whether service rows distinguish planned services from completed historical services;
- whether old records contain non-song rows such as instrumental music, choir contributions, or notes;
- whether preferences exist and, if so, whose preferences they represent;
- whether people and roles are modeled explicitly or only as text fields;
- whether free-form notes contain domain knowledge that is not otherwise structured;
- whether legacy data contains obsolete concepts that no longer match the accepted domain model.

## 2. Mapping Candidates to Accepted Domain Concepts

This section defines what should be looked for when a legacy source becomes available. It identifies possible mapping candidates only; it does not decide whether anything should be migrated, transformed, replaced, or ignored.

### Songs as `(language, number)`

Accepted domain concept: a song is a concrete hymn-book entry identified by `(language, number)`. A number alone is not sufficient.

Assessment checklist:

- Identify all legacy song-like records.
- Check whether each song has an explicit language.
- Check whether song number is stored separately from title or notes.
- Check whether Czech and Polish songs with the same number can be distinguished.
- Check whether any legacy identifiers hide language or hymn-book context.
- Identify records that cannot be mapped confidently to `(language, number)`.

### Melody-Equivalence Classes

Accepted domain concept: melody is an equivalence relation between songs. A melody-equivalence class contains all songs sharing the same melody, including singleton classes.

Assessment checklist:

- Look for explicit same-melody, duplicate, equivalent-song, or tune-link data.
- Look for implicit melody clues in notes, titles, aliases, or cross-reference fields.
- Identify whether melody relationships are one-to-one, one-to-many, or free-form.
- Identify songs that appear duplicated but do not have explicit relationship data.
- Identify relationships that may conflict with the accepted equivalence-class model.

### Organist Repertoire

Accepted domain concept: an organist has explicit repertoire entries tied to concrete songs, and candidate eligibility can use melody-equivalence classes around those entries.

Assessment checklist:

- Identify any legacy records that mark songs as playable, known, learned, available, or excluded.
- Check whether repertoire is tied to a specific organist or treated as a single shared list.
- Check whether repertoire entries reference concrete songs or only melody-like groups.
- Check whether repertoire status is structured or embedded in notes.
- Identify records where the organist is incomplete, ambiguous, historical, or only free-form text.

### Antiphon Mappings

Accepted domain concept: `(language, antiphon number)` may map to a recommended song `(language, song number)` for highlighting only.

Assessment checklist:

- Identify antiphon-like numbers, entrance chants, recommendations, or related fields.
- Check whether antiphon mappings include language.
- Check whether mapping targets are concrete songs or unstructured references.
- Check whether antiphon data was used as a hard rule in the legacy source or only as planning context.
- Identify antiphon values that cannot be tied to a language-specific song.

### Liturgical-Season Mappings

Accepted domain concept: `(language, liturgical season)` may map to songs for highlighting only. Liturgical season is manually selected and may remain empty.

Assessment checklist:

- Identify season-like fields, tags, categories, or notes.
- Check whether season mappings include language.
- Check whether season names match accepted domain vocabulary or require interpretation.
- Check whether a song can be associated with multiple seasons.
- Identify whether legacy season data is structured, categorical, or free-form.

### Service Sets / Service Rows

Accepted domain concept: a service set is a concrete ordered set of rows for one service. Rows may contain songs, instrumental or external contributions, another free-form item, or a textual note. A row without a song must contain a textual note.

Assessment checklist:

- Identify service-like, plan-like, mass-like, or event-like records.
- Identify whether rows are ordered.
- Check whether records assume a fixed four-song structure or allow flexible rows.
- Check whether non-song rows are possible and how they are represented.
- Check whether a row can contain both a song reference and note text.
- Identify whether service date, time, language, priest, organist, antiphon number, and liturgical season are available.

### Completed-Service Records / History

Accepted domain concept: a completed-service record is historical and provides backward non-repetition input. It is not a non-completed plan.

Assessment checklist:

- Identify whether legacy service records represent past completed services, future planned services, or both.
- Check whether record status distinguishes working set, final set, completed-service record, deleted, cancelled, draft, or other states.
- Identify dates needed to distinguish historical records from future plans.
- Check whether historical rows preserve concrete songs and order.
- Identify any records that appear to be old plans but may not represent what actually happened.

### Preferences

Accepted domain concept: preferences are role-weighted scores attached to concrete songs and do not automatically transfer across melody-equivalence classes.

Assessment checklist:

- Identify preference-like fields such as votes, ratings, popularity, favorites, exclusions, or comments.
- Check whose preference is represented: priest, organist, congregation member, congregation aggregate, or unknown.
- Check whether scores fit accepted role ranges or use another scale.
- Check whether preferences reference concrete songs or melody-like groups.
- Identify preference values that are historical observations rather than current preferences.

### Roles / People

Accepted domain concept: current roles are priest, organist, admin, and congregation member. A real person may hold more than one role, but responsibilities and permissions are described by role.

Assessment checklist:

- Identify person-like records for priests, organists, admins, congregation members, or other contributors.
- Check whether people are structured records or free-form names in service records.
- Check whether a person can have multiple roles.
- Identify incomplete, duplicated, renamed, or historical person references.
- Check whether legacy roles include concepts that do not match the accepted role set.

## 3. Data Quality Questions

These questions should be answered before any technical migration planning begins.

### Ambiguous Song Numbers

- Are song numbers unique only within a language or hymn book?
- Are there legacy records that store only a number without language?
- Are Czech and Polish songs with the same number present?
- Are number formats consistent, or are suffixes, ranges, variants, and free-form labels used?

### Missing Language

- Which song, repertoire, preference, antiphon, season, and service-row records lack language?
- Can language be confirmed from context, or would manual domain judgment be required?
- Are there mixed-language services whose rows need per-song language clarity?

### Duplicate Songs

- Are duplicate song records present?
- Do duplicates represent data-entry duplication, different language entries, different hymn-book entries, or same-melody relationships?
- Are duplicate titles enough to infer anything, or are they unreliable without manual review?

### Melody Relationships Not Explicit

- Are same-melody relationships stored explicitly?
- If not, are they embedded in notes, titles, or informal conventions?
- Are any duplicate-song or cross-language relationships actually melody-equivalence relationships?
- Are there contradictory or partial melody relationships that would require domain review?

### Old Service Records vs Future Plans

- Does the legacy source distinguish completed services from future plans?
- Are old plans known to represent what actually happened?
- Are final selections distinguishable from drafts or proposals?
- Are cancelled, deleted, or superseded records present, and do they conflict with the accepted four-state lifecycle?

### Free-Form Notes

- Which records contain notes?
- Do notes contain planning rationale, melody knowledge, repertoire limitations, antiphon hints, season hints, person references, or exceptions?
- Are notes structured enough for inventory, or do they require manual reading?
- Could notes contain knowledge that would be lost if only structured fields were considered?

### Incomplete Priest/Organist References

- Are priests and organists stored as structured person records or text names?
- Are historical priest and organist names complete and consistent?
- Are there services with missing or ambiguous priest or organist references?
- Are role changes over time visible or only implied?

## 4. Migration Risks

This section lists risks only. It does not propose solutions.

- **Song identity risk:** legacy records may use song number alone, which conflicts with accepted `(language, number)` identity.
- **Language ambiguity risk:** missing or inferred language may make song, mapping, repertoire, preference, and history records unreliable.
- **Melody-equivalence risk:** legacy data may not explicitly represent same-melody relationships needed for repertoire filtering, candidate display, and non-repetition.
- **Duplicate interpretation risk:** duplicate-looking songs may represent data errors, cross-language equivalents, same-melody relationships, or legitimate distinct entries.
- **Repertoire ownership risk:** repertoire may be global, implicit, outdated, or not tied to a specific organist.
- **Service-history risk:** old service records may not distinguish completed history from future plans, drafts, proposals, cancelled plans, or final selections.
- **Row-structure risk:** fixed legacy service slots may not capture flexible service rows, non-song contributions, or ordered notes in a way that matches the accepted model.
- **Preference-scale risk:** legacy votes or preferences may use different meanings, actors, or scoring ranges than the accepted role-weighted preference model.
- **Role/person risk:** free-form priest or organist names may create ambiguity when future planning defaults rely on the chronologically latest completed-service record.
- **Context-field risk:** antiphon and liturgical-season data may have been inferred from dates or used as rules in legacy data, while the accepted model treats them as manual highlighting inputs.
- **Free-form knowledge risk:** notes may contain important domain knowledge that is hard to inventory consistently.
- **Obsolete-concept risk:** legacy concepts may reflect earlier assumptions that are no longer accepted in the current product/domain baseline.

## 5. Decisions Needed Before Migration Planning

Before any technical migration design is considered, the following product/domain decisions or clarifications are needed:

- What legacy source or sources are authoritative enough to assess?
- Which legacy records are in scope for future consideration: catalog knowledge, repertoire, mappings, preferences, service history, people, notes, or all of these?
- What evidence is required to treat a legacy song reference as a valid `(language, number)` song?
- How should unknown or missing language be handled at the product/domain decision level?
- What counts as sufficient evidence for melody equivalence?
- How should legacy duplicate songs be classified during domain review?
- Which legacy service records are trustworthy completed-service history rather than plans or drafts?
- What domain vocabulary should be accepted for liturgical seasons before comparing legacy values?
- Whose preferences, if any, are represented by legacy preference-like data?
- Which person and role references matter for future planning defaults and historical understanding?
- How much manual review is acceptable before any migration strategy is chosen?
- Which legacy data can be treated as domain knowledge, and which should be treated only as historical context or uncertainty?

## 6. Recommended Next Analytical Steps

These are analytical, read-only, product/domain steps. They are not implementation tasks.

### Read-Only Inspection

- Obtain the legacy database, schema description, export files, or screenshots without changing the source.
- Inventory table/file names, record counts, and high-level meanings.
- Identify fields that appear to contain songs, languages, melody links, repertoire, mappings, service records, preferences, people, and notes.
- Record uncertainty explicitly rather than normalizing it prematurely.

### Manual Data Inventory

- Create a field-by-field inventory with plain-language descriptions.
- Mark whether each field maps clearly, partially, ambiguously, or not at all to accepted domain concepts.
- List representative examples for each legacy entity or file.
- Identify fields that require domain expert interpretation.

### Sample Mapping Exercises

- Select a small sample of legacy song records and test whether they can be expressed as `(language, number)`.
- Select a small sample of suspected same-melody or duplicate records and test whether they behave like melody-equivalence candidates.
- Select a small sample of service records and test whether they can be interpreted as ordered service rows and whether they are completed history or non-completed plans.
- Select a small sample of preference-like records and test whether actor, role, song identity, and score meaning are clear.

### Validation Against Domain Model

- Compare observed legacy entities against accepted domain concepts before making any migration decision.
- Highlight mismatches between legacy assumptions and accepted decisions.
- Separate confirmed facts, plausible interpretations, and unresolved questions.
- Use the assessment outcome as an input to later product/domain decisions about whether migration planning should happen at all.
