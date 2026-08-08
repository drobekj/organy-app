# Phase 31.18 — bilingual-ready Service Context Antiphon lookup

Authoritative issue: #144.

Baseline `main`: `b0a36ebced4a1c177f08b63b28b9c11b14a8346b`.

## Accepted product contract

- Antiphons are concrete Czech or Polish records; there are no equivalence classes.
- Record fields: stable id, language, number, title, optional source URL.
- Recommendation is a separate optional relation to exactly one authoritative Reference song of the same language.
- Missing recommendation is normal and must not break Planning.
- Existing Czech frozen catalog remains unchanged; Polish production data is intentionally absent in this phase.
- Service Context persists a historical snapshot `{ id, displayNumber, title, sourceUrl? }`.
- New/changed selections are server-authoritative; unchanged historical snapshots survive later catalog changes/removal.
- Compact optional lookup: empty `Select antiphon`; selected `number · title` plus optional `Source`.
- No helper text, panel heading, `Find antiphon`, `No antiphon selected`, `Remove antiphon`, Detail or nested expansion in normal Service Context.
- Language-only browse filter: Czech, Polish, or Mixed = Czech then Polish.
- Overlay uses a max height, independent out-of-flow placement and left scrollbar.
- Candidate rows show number, title and optional `Source`; Source never selects the row.
- Live number/title filtering; typed text is transient only and never becomes persisted data.
- Click/Enter selects; ArrowUp/Down and Home/End navigate; Escape/outside restores the confirmed value.
- Optional transient lookup never blocks Save/Finalize.
- Explicit clear persists absence.
- Service-language mismatch keeps the confirmed antiphon visible but muted/invalid and blocks actions with one centralized message: `Selected antiphon must match the service language.`
- Restoring a compatible language restores validity automatically.
- Candidate red antiphon signal remains exact-song, soft, post-hard-filter and non-transferable to melody siblings.
- Legacy synthetic Candidate antiphon key disappears from normal Service Context UI.

## Deferred data boundary

Polish production antiphon numbers/titles are not required for this phase. The runtime/schema/UI are prepared and tested with explicit fixtures. Real Polish records are a later data-only milestone.

## Merge rule

Keep the implementation PR Draft through exact-head CI, fresh review and HUMAN browser acceptance. Never merge without the user's exact `MERGOVAT`.
