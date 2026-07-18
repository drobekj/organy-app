# Phase 30.1 completion matrix

Source: PR #89 latest authoritative completion task and issue #88 acceptance scope.

| Acceptance item | Status | Actual implementation | Application service / API | Automated test evidence | Manual checkpoint |
| --- | --- | --- | --- | --- | --- |
| Latest Completed priest/organist defaults and catalog-backed dropdowns | DONE | `app/planning-lifecycle-client.tsx`; lifecycle workspace defaults | `PlanningLifecycleService` | `npm test` lifecycle/catalog suites | 1 |
| Historical inactive priest/organist snapshot display | DONE | Disabled historical options in Planning selects | `PlanningLifecycleService` snapshot preservation | `npm test` catalog/lifecycle suites | 2 |
| Service-level note persists Working → Final → Completed and admin Completed update | DONE | `ServiceContext.note`, in-memory and Drizzle lifecycle adapters | `PlanningLifecycleService` | `npm test` lifecycle suites | 3 |
| Stable deterministic users, effective role, optional person link, one profile per user | DONE | `InMemoryInteractionRepository`, DB schema | `InteractionService`, `/api/interaction` | `scripts/phase-30-1-contract-tests.ts` | 4 |
| Role-aware own preference mutation and category-specific validation | DONE | Catalog song detail preference action | `InteractionService.saveOwnPreference`, `/api/interaction` | `scripts/phase-30-1-contract-tests.ts` | 5 |
| Organist own repertoire and admin repertoire management | DONE | Catalog song detail repertoire actions | `InteractionService.setRepertoire`, `/api/interaction` | `scripts/phase-30-1-contract-tests.ts` | 6 |
| Catalog Songs browse Czech / Polish / All, empty query, search, pagination, detail | DONE | Catalog Songs tab with synthetic pagination and detail panel | Catalog API + interaction API for mutations | `npm run build`; contract synthetic scale tests | 7 |
| Catalog People read-only for non-admin and admin mutations hidden/exposed correctly | DONE | Catalog People tab role conditions | `CatalogService.savePerson` authorization | `npm test` catalog suite | 10 |
| Admin-only Knowledge with one shared non-repetition config | DONE | Catalog Knowledge tab; singleton config | `InteractionService.setMelodyWindow`, `/api/interaction` | `scripts/phase-30-1-contract-tests.ts`; DB smoke script | 8 |
| Planning row is the lookup input and candidate popup/list appears at row | DONE | Planning row song input + candidate popup/list | Catalog search + interaction candidate query | `scripts/phase-30-1-contract-tests.ts`; `npm run build` | 10 |
| Candidate rows are compact, ordered, signal/shaded, scrollable, and include pinned Detail | DONE | Candidate cards + CSS sticky number/detail | Interaction candidate query | `scripts/phase-30-1-contract-tests.ts`; `npm run build` | 11, 13 |
| Candidate selection closes lookup and renders exact two-line selected song | DONE | Selected-song card and `selectSong` state | Planning UI + lifecycle save validation | `npm test`; `npm run build` | 12 |
| Detail opens Catalog Songs for selected candidate and preserves return context | DONE | `openCatalogSongDetail`, Catalog song detail return button | Catalog API + interaction API | `npm run build` | 14 |
| Invalid lookup blocks Add, Save, Finalize, and workspace navigation | DONE | `hasInvalidLookupState`, guarded actions/navigation | Planning UI validation before service calls | `scripts/phase-30-1-contract-tests.ts`; `npm run build` | 15 |
| Row switch and Escape/cancel restore or clear invalid edits | DONE | `restoreLookupOnCancel`, `restoreRowsForRowSwitch`, row keyboard handlers | UI state contract | `scripts/phase-30-1-contract-tests.ts` | 15 |
| Candidate filtering/ordering over deterministic fixtures | DONE | `queryCandidatesFromData` and in-memory fixtures | `InteractionService.queryCandidates` | `scripts/phase-30-1-contract-tests.ts` | 10-14 |
| DB runtime uses application service and persistence for interaction mutations | DONE | `PgInteractionRepository`, `/api/interaction`, DB smoke script | `InteractionService` | `npm run typecheck`; `db:phase-30-1-smoke` when DB available | 17 |
| Browser-level regression workflow coverage | NOT DONE | Static UI workflow assertions added in `scripts/planning-ui-workflow-static-tests.ts`, but not a real browser | N/A | `npm test` includes static workflow assertions; real browser runner blocked | 10-16 |
| No real Czech or Polish hymn catalog import | DONE | Synthetic/demo fixtures only | N/A | `scripts/phase-30-1-contract-tests.ts` synthetic assertions | All |

## Current NOT DONE items

- Browser-level regression workflow coverage is not done. Attempted to add Playwright with `npm install --save-dev @playwright/test`, but the registry request returned `403 Forbidden`; the container also has no Chrome/Chromium binary. Static UI workflow assertions are included as partial evidence, but this row remains NOT DONE until a browser automation dependency or browser binary is available.
