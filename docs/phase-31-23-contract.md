# Phase 31.23 — data-value typography hierarchy

Authority: issue #156.

## Contract

- All editable data controls in Service Context and Planning Rows use one value font size: `1rem`.
- Filled authoritative/predefined selection fields use `font-weight: 700`: Date, Time, Language, Priest, Organist, Antiphon, Topic and Planning Row Song Lookup/query.
- Filled free-text note fields use `font-weight: 400` (Regular): Service note and Planning Row note.
- Every visible unfilled/default string uses one shared empty-state typography: `font-size: 1rem`, `font-weight: 400`, and the same light grey `rgb(95 107 122 / 62%)`.
- The unified empty state covers `Select antiphon`, `Select topic`, `Add service note…`, `Song lookup`, `Text note`, and the fallback `Select active priest` / `Select active organist` strings.
- Priest and Organist are expected to be prefilled in the normal Service Context flow; if an empty fallback is visible, it still follows the shared empty-state styling. Once selected/prefilled, the value uses the normal filled-choice 700 weight.
- Labels, legends, headings, statuses, action buttons, row icon controls, candidate emphasis and detail/status hierarchy keep their existing weights and sizes.
- No geometry, persistence, lookup, keyboard, candidate ordering/filtering, validation or domain behavior changes.

Implementation remains a presentation-only CSS layer loaded after the existing Service Context styles.
