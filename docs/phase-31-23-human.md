# Phase 31.23 — HUMAN checkpoint

Verify only typography of filled vs unfilled data controls.

1. Filled Date, Time, Language, Priest, Organist, Antiphon and Topic values use the stronger 700 weight.
2. In a Planning Row, the selected Song Lookup value/query uses the same 700 weight.
3. Filled Service note and Planning Row note text stay Regular 400.
4. All data-control text uses exactly the same size.
5. Every unfilled/default string looks the same: `Select antiphon`, `Select topic`, `Add service note…`, `Song lookup`, `Text note`, and — if visible — `Select active priest` / `Select active organist`. They share the same light grey, Regular cut and size.
6. When Priest/Organist are selected or prefilled, their value returns to the normal filled-choice 700 weight.
7. No layout or interaction retest is required unless a regression is visible.
