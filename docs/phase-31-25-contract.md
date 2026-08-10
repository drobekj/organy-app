# Phase 31.25 — automatic past-Final completion

Baseline: `main` `2a0d4082350b7bf908cfc3120069e04628a23907` after merged Phase 31.24.

Authority: REQ-004, WF-006, backlog PL-006, Roadmap Phase 8, Contract Gate #161, user approval on 2026-08-10.

## Resolved rule

- A saved Final set is automatically eligible only when its `serviceDate` is strictly earlier than the current calendar date in `Europe/Prague`.
- Service time is informational and never changes automatic-completion eligibility.
- A Final dated today remains Final for the whole Prague calendar day unless priest/admin completes it manually.
- Future Finals remain Final.
- The next normal Planning/Plans/History list reconciliation converts every eligible Final into exactly one Completed-service record and removes the active Final.
- The automatic transition is system behavior, independent of the currently selected user role.
- Manual completion keeps its existing rule: priest/admin may complete today/past; future dates are blocked.
- Automatic and manual completion preserve the same Service Context snapshot and ordered rows.
- Completion is idempotent. PostgreSQL completion is one atomic transaction and concurrent reconciliation cannot duplicate or half-complete a Final.
- Memory runtime follows the same product semantics.
- Completed records become backward-history input and cease to be non-completed-plan conflict/forward-protection input.

## Reconciliation boundary

This phase intentionally uses normal application list refresh as the reconciliation opportunity. It does not introduce cron, a worker, a queue, a webhook, or deployment scheduling. A later operations phase may add proactive scheduling without changing the product date rule.

## Explicit exclusions

- no service-time trigger;
- no grace period or configurable delay;
- no cron/worker/queue/webhook/deployment work;
- no notification behavior;
- no audit/change-history feature beyond the existing Completed record;
- no direct Final editing;
- no Working-set auto-transition;
- no candidate, repertoire, preference, Antiphon/Topic, melody-equivalence, non-repetition-period, auth or account change.

## HUMAN checkpoint

- create/finalize one yesterday-dated service and one today-dated service;
- after normal refresh/navigation, yesterday Final is in History and absent from Final plans;
- today Final remains under Final plans;
- today Final can still be completed manually by priest/admin.

Keep the PR Draft until HUMAN PASS. Never merge without exact `MERGOVAT`.
