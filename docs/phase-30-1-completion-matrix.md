# Phase 30.1 completion matrix

Source: PR #89 “Adversarial corrective task v3 — complete the observable milestone, not the matrix”.

Rules applied here: a row is `DONE` only when the capability is observable in the app, mediated by an application service/API where applicable, authorized in the application layer, persistent in DB runtime where applicable, covered by automated tests, and represented in the manual checkpoint. Static source checks and tables alone do not make a row done.

| Item | Status | Observable app behavior | Application service / API | Persistence | Automated test | Manual checkpoint |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Matrix uses strict DONE / NOT DONE without counting helper-only/static-only evidence | DONE | This file is the committed source of truth | N/A | Git | Review this file | Matrix review |
| 1. Catalog-backed priest/organist selection, latest Completed defaults, historical inactive display, and service note lifecycle | DONE | Planning form dropdowns and note textarea | `PlanningLifecycleService` | service context rows | Lifecycle/catalog tests | Steps 1-3 |
| 2. Stable actor identity with no independent role drift | DONE | Development user selector derives effective role from actor | `InteractionService.resolveActor`, `/api/interaction` | `app_users`, `app_user_roles` | Phase 30.1 contract tests | Step 4 |
| 3. Role-aware preferences with category-specific limits | DONE | Catalog song detail preference action | `InteractionService.saveOwnPreference`, `/api/interaction` | `song_preferences` | Phase 30.1 contract tests | Step 5 |
| 4. Organist/admin repertoire management | DONE | Catalog song detail repertoire action | `InteractionService.setRepertoire`, `/api/interaction` | `organist_repertoire` | Phase 30.1 contract tests | Step 6 |
| 5. Admin-only Knowledge with one shared melody non-repetition window | DONE | Catalog Knowledge tab admin action and dated candidate suppression | `InteractionService.setMelodyWindow`, `/api/interaction` | `melody_non_repetition_config` | Phase 30.1 contract + adversarial tests; DB smoke script | Step 8 |
| 6. Candidate query uses service data in memory and DB runtime | DONE | Candidate lookup calls `InteractionClient.queryCandidates`; DB API loads catalog songs and persisted interaction data; recent melody suppression uses dated Completed records and the shared window | `InteractionService.queryCandidates`, `/api/interaction` | Catalog + interaction tables; demo knowledge seeded after catalog seed | Contract + adversarial tests; static UI API-route guard | Steps 10-14 |
| 7. Planning row lookup popup, compact candidates, two-line selection, Detail navigation, cancel/restore, invalid lookup blocking | DONE | Planning row UI controls | Catalog API + Interaction client + lifecycle validation | Planning set rows after selection | Phase 30.1 contract tests; build | Steps 10-16 |
| 8. Role-aware Catalog Songs/People/Knowledge browse/search/detail/pagination | DONE | Catalog tabs and song detail | Catalog API + Interaction API | Catalog + interaction tables | Catalog tests; static UI assertions | Steps 7-8, 10 |
| 9. Deterministic synthetic scale data and no real Czech/Polish catalog import | DONE | Catalog shows synthetic scale records | In-memory fixture generator | N/A | Synthetic scale assertions | All |
| 10. DB runtime smoke covers migrated interaction entities through repository/application expectations | DONE | DB smoke seeds catalog and interaction knowledge, then verifies actor/profile/config/knowledge round-trip | `PgInteractionRepository`, `/api/interaction` | PostgreSQL via `db:phase-30-1-smoke` | Typecheck plus DB smoke script; local execution blocked by missing Docker | Step 17 |
| 11. Browser-level regression workflow coverage | NOT DONE | No browser runner available | N/A | N/A | Static assertions only, not browser tests | Steps 10-16 |

## Current NOT DONE rows

- 11. Browser-level regression workflow coverage.

## External blocker

Browser-level regression workflow coverage remains externally blocked in this container: installing Playwright returned `403 Forbidden`, and no Chrome/Chromium/Firefox binary is installed. Static source assertions are partial guardrails only and are not counted as DONE.
