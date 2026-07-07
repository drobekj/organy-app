# Legacy-to-Domain Mapping

## Purpose

This document captures product/domain-level mapping from the legacy SQL Server database to the accepted domain model.

It is not a database schema, migration script, import plan, data-cleaning process, implementation design, or architecture decision. Its purpose is to preserve clarified legacy semantics and describe how legacy knowledge should inform future domain-oriented migration/refactoring decisions.

## Source Legacy Database Summary

The legacy source is the SQL Server / SSMS database `VarhanniDoprovody`.

A schema-only export, row-count report, column report, and primary-key/foreign-key report were inspected outside the repository workflow. Those inspected artifacts are not stored in this repository as source files.

The legacy database is small and domain-specific. It contains useful planning, repertoire, song, melody-equivalence, service-history, and people knowledge, but its table shape reflects an older application model. A direct 1:1 schema migration is not appropriate.

## Legacy Table Inventory

The inspected legacy database contains these tables:

| Legacy table | Product/domain interpretation |
| --- | --- |
| `Bohosluzby` | Service-like records, likely carrying service context and historical planning information. |
| `BohosluzbyPisne` | Song rows attached to services using the old fixed four-song service model. |
| `CeskaTemata` | Czech theme/topic knowledge requiring later interpretation. |
| `CeskePisne` | Czech songs and Czech-Czech melody-equivalence edges. |
| `CeskePolskePisne` | Czech-Polish melody-equivalence edges. |
| `Kazatele` | Priest/preacher person records or references. |
| `KazatelePisne` | Auxiliary preacher-song knowledge with no intended role in the future system. |
| `PolskePisne` | Polish songs and Polish-Polish melody-equivalence edges. |
| `Varhanici` | Organist person records or references. |
| `VarhaniciPisne` | Legacy organist repertoire knowledge, including repertoire state. |

## Confirmed Legacy Relationships and Missing FK Constraints

The only confirmed foreign key from the inspected primary-key/foreign-key report is:

```text
BohosluzbyPisne.BohosluzbaId → Bohosluzby.Id
```

Other relationships appear to be implicit through id-like columns rather than enforced foreign keys. Those implicit relationships may still contain real domain knowledge, but they must be validated before they are treated as authoritative migration relationships.

Important implications:

- the old database may rely on application behavior, naming conventions, or manual consistency rather than database constraints;
- id-like columns should not be interpreted as confirmed relationships without validation;
- mapping should distinguish confirmed facts from plausible legacy semantics;
- future target storage should not copy missing or weak legacy constraints as design decisions.

## Mapping Strategy Principles

### Legacy DB Is a Source of Knowledge, Not the Target Architecture

The legacy database is valuable because it preserves practical domain knowledge. It is not the architecture for the future application.

### No 1:1 Schema Migration

The future application should not recreate the legacy table structure directly. The legacy schema contains old assumptions, including fixed service song slots and separate Czech/Polish song tables, that do not match the accepted domain model.

### Transform Through Accepted Domain Model

Future migration planning should transform legacy knowledge through accepted concepts such as `Song`, melody-equivalence classes, repertoire entries, service sets, service rows, completed-service records, preferences, and people/roles.

### Preserve Meaning, Not Table Shape

The goal is to preserve useful meaning: known songs, melody relationships, playable repertoire, historical service usage, people references, and relevant context. Legacy table names, old slot structure, and auxiliary helper tables should not dictate the target model.

## Table-by-Table Mapping

### `Bohosluzby`

`Bohosluzby` maps conceptually to service context and possibly completed-service history.

Future interpretation should consider whether rows represent completed services only, a mix of completed history and future plans, or old planning records with unclear status. The accepted domain distinguishes non-completed working/final sets from completed-service records, so historical meaning must be validated before migration planning.

Potential domain concepts:

- service;
- service date, language, time, priest reference, organist reference, or other service context if present;
- completed-service record when the row is confirmed to represent what happened.

Do not infer a final target table from `Bohosluzby` directly.

### `BohosluzbyPisne`

`BohosluzbyPisne` maps to song-bearing service rows attached to `Bohosluzby`.

The confirmed relationship is `BohosluzbyPisne.BohosluzbaId → Bohosluzby.Id`. The table represents the old fixed four-song service model through values such as first, second, third, and fourth song.

The future application must not preserve this as a fixed target schema. The accepted domain uses flexible ordered service rows so a service set can contain songs, non-song rows, notes, instrumental or external contributions, and rows beyond the standard four-song case.

Potential domain concepts:

- service rows with explicit order;
- song references as `(language, number)` after validation;
- completed-service row history when the parent service is confirmed historical.

### `CeskaTemata`

`CeskaTemata` contains Czech theme/topic knowledge requiring domain review.

It may map to song metadata, tags, later candidate highlighting/filtering, or contextual planning knowledge. The correct target meaning remains open because the accepted model has not finalized the metadata scope for songs or theme behavior.

Potential domain concepts:

- song metadata;
- tags or themes;
- future highlighting/filtering support;
- manually reviewed contextual notes.

### `CeskePisne`

`CeskePisne` contains Czech songs and the Czech-Czech part of melody-equivalence knowledge through `CeskeId` and `OdkazCeskeId`.

This table should be interpreted as two kinds of legacy knowledge:

1. Czech song catalog knowledge present in the legacy database.
2. Legacy melody-equivalence edges between Czech songs.

The future application needs a canonical song catalog containing all songs from the Czech and Polish hymnal/chorálník, but that catalog does not yet exist fully in the legacy database. Legacy Czech song records can inform the catalog, but they are not necessarily the complete catalog.

Potential domain concepts:

- canonical `Song` identified by `(language = Czech, number)`;
- song metadata such as title, source hymnal, optional external web link, number of verses, themes, notes, or other fields if validated;
- melody-equivalence edges to be transformed into melody-equivalence classes.

### `CeskePolskePisne`

`CeskePolskePisne` contains Czech-Polish melody-equivalence knowledge through `CeskeId` and `PolskeId`.

This table should be treated as legacy cross-language melody-equivalence edges. It should not create a combined Czech/Polish song entity. The accepted model keeps concrete song identity as `(language, number)` and represents shared melodies through equivalence classes.

Potential domain concepts:

- melody-equivalence edges between Czech and Polish songs;
- evidence for building melody-equivalence classes across languages;
- candidate display support where an organist's repertoire song in one language can make a melody-equivalent song eligible in another language.

### `Kazatele`

`Kazatele` maps conceptually to priest/preacher people references.

The target domain has a priest role and also recognizes that a real person may hold roles. Future modeling should decide separately whether these legacy records become people, users, profiles, historical names, or another representation.

Potential domain concepts:

- people;
- priest role references;
- historical service-context references.

### `KazatelePisne`

`KazatelePisne` should be excluded from future database migration.

Clarified semantics identify it as an auxiliary knowledge table with no intended role in the new system. It should not become a target-domain concept unless a future accepted product decision explicitly changes that direction.

Potential migration stance:

- exclude from future database migration;
- retain only as historical context during manual review if needed;
- do not use as a source for future preference votes unless separately revalidated by product/domain decision.

### `PolskePisne`

`PolskePisne` contains Polish songs and the Polish-Polish part of melody-equivalence knowledge through `PolskeId` and `OdkazPolskeId`.

This table should be interpreted as two kinds of legacy knowledge:

1. Polish song catalog knowledge present in the legacy database.
2. Legacy melody-equivalence edges between Polish songs.

As with Czech songs, the future canonical catalog must contain all songs from the relevant Polish source, but the legacy table should not be assumed complete.

Potential domain concepts:

- canonical `Song` identified by `(language = Polish, number)`;
- song metadata such as title, source hymnal, optional external web link, number of verses, themes, notes, or other fields if validated;
- melody-equivalence edges to be transformed into melody-equivalence classes.

### `Varhanici`

`Varhanici` maps conceptually to organist people references.

The accepted domain distinguishes the organist role and organist repertoire knowledge. Future modeling should decide separately whether these legacy records become people, users, profiles, historical names, or another representation.

Potential domain concepts:

- people;
- organist role references;
- historical service-context references;
- owner/reference for repertoire entries.

### `VarhaniciPisne`

`VarhaniciPisne` is relevant as legacy organist repertoire knowledge.

Clarified repertoire state meanings are:

- `Stav = připravená` means the organist can play the song/melody, but it has not yet sounded in a service;
- `Stav = hraná` means the song/melody has already sounded in a service;
- `Stav = doporučená` should not be migrated as a future repertoire state and will be replaced by preference votes.

When a prepared song/melody was used in a saved service record, the old application changed its state from `připravená` to `hraná`. This behavior should be preserved conceptually in the new application.

Potential domain concepts:

- organist repertoire entries;
- repertoire state or historical usage signal for prepared versus already played repertoire, if accepted later;
- completed-service behavior that marks a prepared repertoire song/melody as already sounded;
- source evidence for playable melody-equivalence classes.

`doporučená` should not become a stable future repertoire state. Future recommendation/preference behavior belongs to preference votes, modeled separately from stable song metadata and separately from organist repertoire.

## Target-Domain Concepts Implied by Mapping

### Canonical `Song`

The future app needs a canonical song catalog containing all songs from the Czech and Polish hymnal/chorálník. The canonical catalog does not yet exist fully in the legacy database.

A canonical song is identified by `(language, number)`. Prefer a unified conceptual `Song` / `SongCatalog` model over separate Czech-song and Polish-song domain entities.

Song metadata may include title, source hymnal, optional external web link, number of verses, themes, notes, or other fields. The final metadata scope remains open.

### Melody-Equivalence Classes

`CeskePisne`, `PolskePisne`, and `CeskePolskePisne` together should be treated as legacy melody-equivalence edges. These edges should later be transformed into melody-equivalence classes in the accepted domain model.

### Repertoire Entries

`VarhaniciPisne` implies repertoire entries for organists. Repertoire should support the accepted rule that candidate eligibility can use melody-equivalence classes around explicit repertoire songs.

### Service / Service Set / Service Rows

`Bohosluzby` and `BohosluzbyPisne` imply service context and song rows, but the target model should use flexible ordered service rows rather than the old fixed four-song structure.

### Completed-Service Records

Historical legacy service rows may become completed-service records if they are confirmed to represent completed services. Completed-service records are historical and are used as non-repetition input; they are not non-completed plans.

### Preferences / Preference Votes

Preference votes should be modeled separately from stable song metadata. Aggregated preference scores may be displayed for songs, but preference votes are not stable song metadata.

Legacy `VarhaniciPisne.Stav = doporučená` should be replaced by preference votes rather than migrated as a repertoire state.

### People / Roles

`Kazatele` and `Varhanici` imply person/role knowledge. The accepted roles are priest, organist, admin, and congregation member. Mapping must not assume that legacy preacher/organist records directly equal authenticated users.

## Excluded or Not-Directly-Migrated Legacy Concepts

### `KazatelePisne`

Exclude `KazatelePisne` from future database migration because it was only an auxiliary knowledge table and has no intended role in the new system.

### `VarhaniciPisne.Stav = doporučená`

Do not migrate `doporučená` as a future repertoire state. Replace the concept with preference votes if recommendation/preference knowledge is needed.

### Old Fixed Four-Song Structure as Target Schema

Do not migrate the fixed first/second/third/fourth song structure as target schema. Use flexible ordered service rows in the accepted domain model.

## Behavior to Preserve

When a prepared repertoire song/melody is used in completed service history, the conceptual behavior `připravená → hraná` should be preserved.

In future terms, completing or saving service history should be able to mark that a previously prepared playable song/melody has now sounded in a service. The exact implementation, storage representation, and lifecycle trigger remain future design questions.

## Open Mapping Questions

- What exact metadata belongs in the canonical song catalog?
- How should the full Czech and Polish song catalogs be sourced?
- Does `CeskaTemata` map to song metadata, tags, or later highlighting/filtering behavior?
- How should implicit id relationships be validated?
- Do historical `Bohosluzby` rows represent completed-service records only, or do they include plans/drafts/future services?
- How should mixed-language services be handled when mapping legacy rows and song references?

## Migration/Refactoring Implications

- Direct migration is inappropriate.
- The target schema should be designed from the accepted domain model, not from the old database shape.
- The old schema informs mapping only.
- Storage decisions remain deferred until the target mapping is accepted.
- Future migration/refactoring should preserve domain meaning while allowing the target model to differ substantially from legacy tables.
