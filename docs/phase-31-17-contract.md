# Phase 31.17 — inline melody-class detail and equivalent navigation

Approved by the user on 2026-08-06. Baseline: `fb23295fba224d0ccbc645b77358d5e51c2f19ff`.

## Contract

- one local Planning expansion: candidate list, candidate detail, selected-song detail, or none;
- complete authoritative melody-class members are shown;
- Detail ordering is fixed for one open Detail session: the song through which Detail was entered is first, with the remaining equivalent members below it in deterministic natural order;
- changing which member is expanded does not reorder that already open Detail session;
- safe score links remain available for informational members;
- candidate detail returns to the clicked available member in the candidate list without selecting it and without changing the confirmed Song lookup field;
- selected-song detail selects/replaces only through a fresh hard-filtered eligibility snapshot;
- replacement preserves note and updates local occupancy;
- language-disabled, occupied and hard-filtered members remain explanatory and unselectable;
- an unavailable member can still expose its Detail and Score, but its field cannot be activated or receive keyboard-row focus;
- historical fallback never invents a melody class;
- memory demo projects only data it actually owns;
- no theme UI, schema, migration or Planning persistence change.

## Acceptance

Focused Phase 31.17 tests, all prior phase gates, typecheck, complete tests and production build must pass. One real browser HUMAN checkpoint is required after the final Detail refinement before Ready for review.

## HUMAN row-UX refinement — functionally PASS 2026-08-07; final palette alignment re-check pending

The browser checkpoint confirmed the compact invariant Planning-row protocol:

- every row keeps one outer `Row N` fieldset in all empty, partial and selected states;
- the upper border carries `Row N` on the left and the compact control palette on the right;
- palette order and meaning are `↑` move up, `↓` move down, `↶` clear row contents, `×` remove row;
- the rounded control squares must be vertically centered on the same upper-border/legend axis as `Row N`; the earlier `translateY(-50%)` correction remained visibly too low, so the final implementation lifts the palette by its full own height and requires one focused browser re-check;
- the interior has exactly two permanent base fields: song lookup and text note, with no visible labels above them;
- empty-field guidance is provided by the placeholders `Song lookup` and `Text note`;
- after selection, the collapsed song field contains only `number · title`;
- Detail remains on the right side of the song field and is disabled only when no song is selected;
- focusing the note field or otherwise leaving the lookup interaction closes the candidate list and restores the confirmed number/title or an empty field;
- `↶` clears both the selected song and the text note, closes list/detail state and remains available for note-only rows;
- `×` removes the whole row.

## HUMAN candidate-list refinement — PASS 2026-08-07

The candidate-list presentation was browser-accepted with these invariants:

- each candidate row visibly contains only the song number, song title and `Detail` button;
- the exact selected candidate is identified by one blue outer contour plus light-blue fill around number/title and Detail;
- candidate-row language, repertoire, preference, signal, melody-class count and occupancy explanation are absent from the compact list;
- visible `Currently selected` and `Cancel` controls are absent;
- if a selected song existed before the list opened, the `Song lookup` field keeps showing its confirmed `number · title` while browsing;
- the confirmed display label is not treated as a search query;
- clicking the already-open `Song lookup`, outside click, focus departure or Escape closes the list without changing the confirmed selection;
- candidate selection, disabled-state semantics, keyboard navigation and Detail opening remain intact;
- number/title and Detail are vertically centered and the row is compact;
- candidate Detail uses a compact rounded rectangle matching the visual language of the Detail control beside Song lookup.

## HUMAN editable Song lookup refinement — PASS 2026-08-07

The user browser-accepted the editable Song lookup behavior:

- activating a non-empty Song lookup selects its whole visible value so the next typed character replaces it;
- non-empty manually typed text is only a live query, never an accepted song by itself;
- every manual text change refreshes the open candidate list;
- candidate matching is case-insensitive against song title and incremental against displayed song number in both memory and authoritative Reference/DB runtimes;
- the active candidate can be accepted directly with Enter in the Song lookup field, while clicking a candidate continues to accept it;
- leaving the lookup with non-empty unconfirmed text restores the last confirmed song;
- explicitly clearing the lookup to empty removes the confirmed song/candidate immediately while preserving the row note and keeping the candidate list open;
- after an explicit clear, closing the lookup preserves the valid empty/no-song state instead of restoring the former song;
- the empty/no-song row continues to be evaluated only by the already established Planning-row validation and persistence rules.

## HUMAN unified melody Detail refinement — 2026-08-07

Approved for implementation by the user's `dál`, then refined through focused browser feedback on the same day.

### One panel geometry for both entry paths

- Detail opened from a candidate-list row and Detail opened beside the selected Song lookup use the same melody-class presentation;
- both render in the same Planning-row position between `Song lookup` and `Text note`;
- both use the same right-aligned panel geometry, left inset, neutral surface and elevation;
- the interaction meaning still depends on the entry path, and the final visual refinement deliberately exposes that origin through whether the candidate list remains visible underneath the panel.

### Frozen order for one Detail session

- when Detail opens, the song through which Detail was entered is placed first at the top;
- the other members of the same melody/equivalence class follow below it in deterministic natural order;
- that complete vertical order is then frozen for the entire open Detail session;
- pressing another compressed member's `Detail` expands it at its existing position and compresses the previously expanded member without moving either row;
- this is intentionally different from candidate-list ordering, which remains unchanged;
- a compressed equivalent member contains only number, title and the right-side `Detail` control;
- exactly one member is expanded at a time;
- the expanded member does not show a redundant `Detail` control;
- visible `Currently selected` text is absent even when the expanded member is the selected song;
- the expanded member contains all available detail information;
- available `Score` and `Score not available` occupy the same metadata location among the expanded information rather than different action positions;
- `Detail` and an available `Score` remain independent controls and must not propagate into whole-member activation.

### Right-aligned overlay and origin cue

- the whole expanded Detail panel is right-aligned and deliberately narrower than its available row slot, leaving a clear inset on the left;
- the panel uses a previously unused neutral light surface plus a soft shadow so it reads as the active foreground layer without introducing another semantic signal color;
- when Detail originates from the candidate list, that candidate list remains rendered in the same grid layer underneath the panel;
- the Detail panel overlays the list from the right, leaving part of the candidate list visible on the left as an orientation cue;
- when Detail originates from the right-side button beside the already selected song, the candidate list remains collapsed and therefore nothing is visible underneath the panel;
- this visual distinction communicates which Detail entry path is active without changing the internal Detail presentation itself.

### No companion navigation buttons

The expanded Detail contains no separate:

- `Back to candidates`;
- `Show this candidate`;
- `Close`;
- `Replace with this song`.

Their navigation/selection semantics belong directly to the member fields.

### Candidate-detail activation and lossless return

- clicking an available member field closes Detail and returns to the candidate list focused/scrolled to that concrete member;
- this action does not select the member into Song lookup;
- clicking the originally opened available member has the same return-to-list meaning;
- returning from candidate Detail must never clear, replace or rewrite the confirmed Song lookup field;
- for that returned list, the fresh hard-filtered eligibility snapshot already loaded by Detail is retained for the duration of the open list, so the clicked equivalent cannot disappear during a background candidate refresh;
- the clicked member id is carried as the highest-priority local focus/scroll target, ahead of the currently selected song;
- therefore the confirmed `number · title` display is not reused as a candidate query and cannot produce a false empty-list message or redirect focus back to the selected song;
- editing Song lookup after the return releases the retained snapshot and resumes normal live candidate querying;
- return scrolling uses the candidate's real geometry relative to the scroll container, not a nested grid-local `offsetTop`, so the target row is actually visible at its corresponding list position.

### Selected-song-detail activation and collapsed return

- clicking an available eligible member field closes Detail and selects that member into Song lookup;
- clicking the currently selected member closes Detail and preserves the same Song lookup selection;
- opening the right-side Detail beside a selected Song lookup deactivates/collapses any open candidate list;
- every way of leaving selected-song Detail leaves the candidate list collapsed, whether the candidate list had previously been open or not;
- this includes member activation, clicking `Song lookup`, clicking `Text note`, and clicking anywhere else outside the expanded Detail;
- clicking `Song lookup` while selected-song Detail is open dismisses Detail but suppresses the same pointer action from immediately reopening the candidate list;
- clicking an input outside Detail leaves that clicked input focused after dismissal;
- hard candidate eligibility, service-language and current-service occupancy rules remain authoritative for replacement.

### Unavailable member

- its informational content is visibly lighter/muted;
- its `Detail` control and any `Score` link remain active and are not visually muted with the informational text;
- its member field is not selectable/activatable;
- keyboard vertical navigation skips the member, so it never receives the active cursor contour;
- clicking the unavailable member field has Escape semantics: close/return from Detail without selection or replacement and preserve the previously confirmed Song lookup state;
- expanding an unavailable member through `Detail` remains informational only.

A fresh exact-head automated gate and focused browser HUMAN checkpoint are required after this refined unified Detail behavior.
