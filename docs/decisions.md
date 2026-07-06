# Decisions

## Purpose
Use this document as an index for important product and technical decisions.

## Decision Record Format
For each decision, include an identifier, date, status, context, options considered, decision, consequences, and related links.

## Decision Log
Add decision records in chronological order or link to separate decision files if the log becomes large.

## Active Proposals
Track decisions currently under discussion and the information needed to resolve them.

## Superseded Decisions
List decisions that have been replaced, with links to the newer decisions and migration notes.

## Review Cadence
Define when and how decisions should be revisited.

## DR-2026-07-06-01 — Candidate display exposes repertoire songs from the melody class

Date: 2026-07-06
Status: Accepted

Context: Candidate rows need to show why a song passed the organist repertoire filter, even when the explicit repertoire song is in the opposite language from the current service.

Options considered:

- Show only songs matching the service language.
- Show all songs from the melody-equivalence class.
- Show relevant service-language songs and guarantee visibility of an explicit repertoire song.

Decision: Candidate rows must show relevant songs from the melody-equivalence class. The explicitly repertory song must be shown in bold. If language filtering would hide all explicit repertoire songs, add exactly one arbitrary opposite-language repertoire song from the same melody-equivalence class and show it in bold.

Consequences: Candidate rows remain compact while preserving evidence for the repertoire filter. Czech and Polish services may include one bold opposite-language repertoire song in the row display. Mixed services do not need this exception because both languages are displayed.

Related links: `docs/analysis-log.md`, `docs/domain-analysis.md`, `docs/domain-model.md`.
