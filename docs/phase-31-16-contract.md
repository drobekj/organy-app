# Phase 31.16 — concrete candidate-list UI and single-open interaction

## Authority

- Issue: #137
- Approved by the user with workflow keyword `dál` on 2026-08-06.
- Exact baseline: `db67b168a05fb7604f22ccf25efbb4f48e3b61c2`.

## Goal

One concrete authoritative candidate is one concrete option in a single-open Planning candidate list. The list supports empty-query browse, exact-current marker and inner auto-scroll, occupied disabled results, loading/empty/error states, keyboard access, and safe select/replace/clear behavior.

## Required behavior

- at most one list open in the service;
- opening a row queries with an empty search instead of the confirmed display label;
- opening and empty browse are transient and do not dirty or block the draft;
- non-empty unresolved search retains the existing safety block;
- backend order is preserved and exact `songId` alone determines the current marker;
- selected songs outside the hard-filtered universe remain separate non-selectable context;
- an active Service Context organist is a mandatory prerequisite for candidate browsing;
- the selected organist's concrete repertoire is always a hard filter; no organist or an empty repertoire yields zero candidates rather than bypassing the filter;
- occupied candidates stay in order, expose all occupying rows, and cannot be selected through any input path;
- selection/replacement preserves note, closes the list, updates occupancy immediately, and dirties only a genuinely changed draft;
- same-song reselection is idempotent;
- clear preserves note and releases occupancy;
- loading, browse-empty, search-empty, prerequisite guidance, local error, retry, stale-response protection, and context refresh are explicit;
- combobox/listbox ARIA and Arrow/Home/End/Enter/Escape behavior;
- approved default preference threshold is `0`;
- no inline melody detail, thematic UI, migration, schema or persistence change.

## HUMAN checkpoint history

- 2026-08-06: first browser checkpoint failed because an empty candidate browse attempted a lookup without a selected Service Context organist and exposed `Candidate lookup failed.`
- Correction: no-organist browse is now a neutral prerequisite state with no API request; no organist and an empty selected-organist repertoire both yield zero candidates in authoritative and in-memory services.
- A fresh browser HUMAN checkpoint is required on the corrected exact head.

## Workflow

Exact-head CI, Automatic Review Gate and one real browser HUMAN checkpoint are required. Merge is forbidden without exact `MERGOVAT`.
