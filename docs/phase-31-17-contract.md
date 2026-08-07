# Phase 31.17 — inline melody-class detail and equivalent navigation

Approved by the user on 2026-08-06. Baseline: `fb23295fba224d0ccbc645b77358d5e51c2f19ff`.

## Contract

- one local Planning expansion: candidate list, candidate detail, selected-song detail, or none;
- complete authoritative melody-class members with concrete opened song first;
- safe score links remain available for informational members;
- candidate detail navigates to an equivalent candidate without selecting it;
- selected-song detail replaces only through a fresh hard-filtered eligibility snapshot;
- replacement preserves note and updates local occupancy;
- language-disabled, occupied and hard-filtered members remain explanatory and unselectable;
- historical fallback never invents a melody class;
- memory demo projects only data it actually owns;
- no theme UI, schema, migration or Planning persistence change.

## Acceptance

Focused Phase 31.17 tests, all prior phase gates, typecheck, complete tests and production build must pass. One real browser HUMAN checkpoint is required before Ready for review.

## HUMAN checkpoint status — editable lookup refinement pending

The compact Planning-row protocol and the reduced candidate-list presentation, including the final compact candidate geometry, have passed browser HUMAN review. The user then requested one further Song lookup interaction refinement before Detail itself is changed. The inline/selected-song Detail presentation remains intentionally unchanged until this lookup refinement passes its focused browser check.

## HUMAN row-UX refinement — 2026-08-06

The first browser checkpoint confirmed the Phase 31.17 behavior but requested a compact invariant row protocol before approval:

- every row keeps one outer `Row N` fieldset in all empty, partial and selected states;
- the upper border carries `Row N` on the left and the compact control palette on the right;
- palette order and meaning are `↑` move up, `↓` move down, `↶` clear row contents, `×` remove row;
- the interior has exactly two permanent base fields: song lookup and text note, with no visible labels above them;
- empty-field guidance is provided by the placeholders `Song lookup` and `Text note`;
- after selection, the collapsed song field contains only `number · title`; language, repertoire, preference, signals, equivalents and score context remain in the candidate list or Detail;
- Detail remains on the right side of the song field and is disabled only when no song is selected;
- focusing the note field or otherwise leaving the lookup interaction closes the candidate list and restores the confirmed number/title or an empty field;
- `↶` clears both the selected song and the text note, closes list/detail state and remains available for note-only rows;
- `×` removes the whole row;
- candidate list, inline detail, validation, occupancy and persistence behavior otherwise remain unchanged.

The replacement browser check on 2026-08-07 confirmed this compact-row protocol.

## HUMAN candidate-list refinement — 2026-08-07

The candidate-list presentation is further reduced while preserving Phase 31.17 selection and Detail behavior:

- each candidate row visibly contains only the song number, song title and `Detail` button;
- the exact currently selected candidate remains identified only by the existing blue visual highlight; the visible `Currently selected` text is removed from the candidate list;
- candidate-row language, repertoire, preference, signal, melody-class count and occupancy explanation are removed from the list; those facts remain available through Detail where applicable;
- all visible `Cancel` buttons are removed from the candidate list;
- if a selected song existed before the list opened, the `Song lookup` field keeps showing its confirmed `number · title` while browsing the list instead of becoming blank;
- the confirmed display label is not treated as a search query when the backend candidate list is loaded;
- clicking the already-open `Song lookup` field closes the candidate list without changing the confirmed selection;
- outside click, focus departure and Escape continue to close the list without changing the confirmed selection;
- candidate selection, disabled-state semantics, keyboard navigation and Detail opening remain otherwise unchanged;
- the selected candidate is shown with one blue outer contour plus light-blue fill around number/title and Detail;
- number/title and Detail are vertically centered and the row is compact;
- candidate Detail is a compact rounded rectangle matching the visual language of the Detail control beside Song lookup;
- the contents and behavior of candidate Detail and selected-song Detail are deliberately not changed in this refinement.

The user confirmed this candidate-list presentation and final geometry in the browser on 2026-08-07.

## HUMAN editable Song lookup refinement — 2026-08-07

The Song lookup interaction is refined without changing the existing row validation rules:

- activating a non-empty Song lookup selects its whole visible value so the next typed character replaces it;
- non-empty manually typed text is only a live query, never an accepted song by itself;
- every manual text change refreshes the open candidate list;
- candidate matching remains case-insensitive against either song number or song title;
- the active candidate can be accepted directly with Enter in the Song lookup field, while clicking a candidate continues to accept it;
- leaving the lookup with non-empty unconfirmed text restores the last confirmed song;
- explicitly clearing the lookup to empty removes the confirmed song/candidate immediately while preserving the row note and keeping the candidate list open;
- after an explicit clear, closing the lookup preserves the valid empty/no-song state instead of restoring the former song;
- the empty/no-song row continues to be evaluated only by the already established Planning-row validation and persistence rules;
- Detail contents and behavior remain unchanged pending the next user step.

A fresh exact-head automated gate and focused browser HUMAN checkpoint are required after this editable lookup refinement.
