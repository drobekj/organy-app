# Phase 31.21 — Minimal Service Context layout

Authority: issue #151.

Stacked baseline: HUMAN-accepted Phase 31.20 head `455d028a88d930e671e15d99ca0ecc43f7ec77d0`.

## Product contract

Render Service Context in the already agreed minimal scheme:

```text
Service context

[ Date      ] [ Time       ] [ Language ]

[ Priest              ] [ Organist             ]

[ Antiphon            ] [ Topic                ]

[ Service note placeholder / value                       ]
```

- Date, Time and Language occupy one complete row in three equal columns.
- Priest and Organist occupy one complete row in two equal columns.
- Antiphon and Topic occupy one complete row in two equal columns.
- Service note occupies the complete row below Antiphon/Topic.
- Visible labels are compact: `Date`, `Time`, `Language`, `Priest`, `Organist`, `Antiphon`, `Topic`; the visible `Service note` label is omitted.
- Service note keeps its existing placeholder/value semantics but is only one normal input-control line high, matching the compact height of other Service Context controls; it is not user-resizable.
- Remove Service Context helper/status prose under Time, Priest and Organist. Existing validation and blocking semantics remain unchanged.
- Optional Antiphon and Topic retain their light placeholders and all accepted Phase 31.20 lookup behavior.
- Existing Date/Time/Language defaults and Priest/Organist defaulting remain unchanged.
- Legacy candidate technical keys remain internal and absent from normal Service Context UI.
- On narrow screens the fields may collapse to one column while preserving the same logical order.

## Scope boundaries

Presentation/layout only.

No changes to:
- Service Context persistence or historical snapshots;
- Service note persisted value semantics;
- validation semantics;
- person defaulting;
- Antiphon/Topic catalogs, selection, language compatibility or candidate signals;
- song candidate hard filters, ordering, recommendation or melody behavior;
- database schema or APIs.

## Acceptance

- Focused evidence proves the 3 / 2 / 2 / 1 row geometry, field order, compact visible labels and absence of Service Context helper prose.
- Focused evidence proves the Service note remains full width, has no visible external label, keeps its placeholder and has one normal input-line height.
- Existing Phase 31.20 focused acceptance remains green.
- Typecheck, complete tests and production build remain green.
- Standard exact-head CI and fresh Automatic Review Gate pass.
- One narrow HUMAN browser checkpoint covers only the minimal Service Context presentation.

## Merge rule

Keep the implementation PR Draft. Never merge without the user's exact `MERGOVAT`.
