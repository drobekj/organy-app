# Phase 31.22 — Service Context toggle parity and note prompt polish

Authority: issue #154.

Stacked baseline: HUMAN-accepted Phase 31.21 head `f69067e2b12d077d478a92560c8e06aa5522de78`.

## Product contract

### Antiphon / Topic input toggle

Match the already accepted Song Lookup input interaction:

- focusing or clicking a closed editable Antiphon/Topic field opens its candidate list;
- pointer-down records whether that same list was already open before the click sequence;
- clicking the same input while it was already open closes the list;
- that close is a cancel/restore operation: transient search text is discarded and the last confirmed selection, or the empty state, is restored;
- subsequent click on the still-focused closed input opens it again;
- Escape, outside dismissal, keyboard navigation, Enter selection, clear buttons, Antiphon Source links, Mixed ordering/gradients and language mismatch validation remain unchanged.

### Service note empty state

- Service note remains full width and one normal input-control line high;
- the visible empty-state prompt is `Add service note…`;
- the empty-state prompt is muted/light, analogous to `Select antiphon` and `Select topic`;
- entered Service note text remains normal foreground text;
- Service note persisted value semantics are unchanged.

## Scope boundaries

No changes to persistence, database schema, APIs, catalogs, candidate filtering/ordering, Antiphon/Topic confirmed selection semantics, or Service note stored values.

## Acceptance

- focused tests prove the shared open/close click decision and both Antiphon/Topic pointer-down wiring;
- focused style evidence proves `Add service note…` is shown only for the empty field and is muted;
- Phase 31.21 presentation regression remains green;
- Phase 31.20 Topic/Antiphon behavior regression remains green;
- standard exact-head CI, typecheck, complete tests and production build pass;
- fresh Automatic Review Gate passes with no open review thread;
- one narrow HUMAN browser checkpoint covers only repeated-click collapse and the Service note empty-state prompt.

## Merge rule

Keep the implementation PR Draft. Never merge without the user's exact `MERGOVAT`.
