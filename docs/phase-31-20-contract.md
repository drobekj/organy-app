# Phase 31.20 — Service Context Topic lookup and soft thematic signal

Authority: issue #148.

Stacked baseline: Phase 31.19 head `7e76844a5c78a55dc9133eca937d69679be432db`.

## Product contract

- Reuse the frozen Phase 31.13 Czech and Polish thematic sections without changing source data or hashes.
- Topic is an optional authoritative Service Context selection rendered immediately to the right of Antiphon.
- Topic displays its authoritative title only. No public topic number and no Topic URL are invented.
- Czech service browses Czech Topics, Polish service browses Polish Topics, Mixed browses Polish first and Czech second.
- Topic lookup mirrors the compact Antiphon interaction: live title search, Click/Enter selection, ArrowUp/Down + Home/End navigation, Escape/outside restore and explicit clear.
- An incompatible confirmed Topic remains visible but invalid and blocks persistence with `Selected topic must match the service language.` Mixed accepts either language.
- Persist the stable Topic id plus historical title snapshot; unchanged historical snapshots survive later catalog changes/removal.
- Remove the legacy `Candidate season key` control from normal Service Context UI while retaining internal legacy compatibility.

## Candidate semantics

- The selected Topic's existing language-specific `ranges` define matching concrete Reference songs.
- Match on the base canonical song number in the Topic's own language.
- Topic is soft only: it sets the existing `seasonMatch` / `season` signal after hard filters and never excludes a surviving candidate.
- No cross-language or melody-equivalent transfer is allowed.
- If Antiphon and Topic both match one concrete song, the visible signal remains `antiphon`; this is signal-label precedence only.
- Phase 31.14 deterministic concrete-song ordering is unchanged by Antiphon or Topic signals.

## Scope boundaries

- No Topic URLs.
- No automatic Topic inference from service date.
- No changes to Antiphon recommendation mappings.
- No changes to frozen Phase 31.13 thematic artifacts.
- No candidate reordering by soft signals.

## Acceptance

- Memory and DB Topic lookup preserve the frozen data and Polish→Czech Mixed order.
- Server-authoritative Topic validation, historical persistence and clear behavior are covered.
- Candidate tests prove exact range matching, soft-only semantics, same-language isolation, no melody sibling transfer, Antiphon signal precedence and unchanged candidate ordering.
- Existing Phase 31.2–31.19 gates, typecheck, full tests and production build remain green.
- Fresh Automatic Review Gate and focused HUMAN browser checkpoint are required.

## Merge rule

Keep the implementation PR Draft. Never merge without the user's exact `MERGOVAT`.
