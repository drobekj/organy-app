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

## HUMAN row-UX refinement — functionally PASS 2026-08-07

The browser checkpoint confirmed the compact invariant Planning-row protocol:

- every row keeps one outer `Row N` fieldset in all empty, partial and selected states;
- the upper border carries `Row N` on the left and the compact control palette on the right;
- palette order and meaning are `↑` move up, `↓` move down, `↶` clear row contents, `×` remove row;
- the rounded control squares are browser-accepted as vertically centered on the same upper-border/legend axis as `Row N`;
- the next visual refinement makes those squares slightly smaller while compensating their vertical offset so this accepted center does not move;
- the glyphs inside those smaller squares are deliberately heavier (`font-weight: 900`) so they visually match the weight of `Detail` and other bold UI controls instead of appearing thin and incidental;
- the interior has exactly two permanent base fields: Song lookup and Text note, with no visible labels above them;
- Song lookup and Text note form a fixed-height base pair whose row height does not change when candidate or Detail overlays open;
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

### One overlay geometry for both entry paths

- Detail opened from a candidate-list row and Detail opened beside the selected Song lookup use the same melody-class presentation;
- both begin on the same horizontal line immediately below Song lookup;
- both are overlays and do not consume row-flow height, so Text note remains fixed immediately below Song lookup and is partially covered by the overlay;
- both use the same right-aligned panel geometry, left inset, neutral surface and elevation;
- the interaction meaning still depends on the entry path, and the visual refinement deliberately exposes that origin through whether the candidate list remains visible underneath the panel.

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

### Independent candidate-list and Detail overlays

- the candidate-list block starts immediately below Song lookup and is removed from normal document flow;
- its width remains the established Song lookup-column width, but the whole block is shifted right so its right edge aligns with the right edge of the standalone selected-song `Detail` button;
- opening the candidate list never changes the height of `Row N`; it may overlay Text note, later Planning rows and any other content below;
- candidate-list height is content-driven up to `max-height: min(32rem, 70vh)`; longer lists scroll internally instead of growing indefinitely;
- the candidate-list vertical scrollbar is exposed on the left so it remains accessible when a candidate Detail overlays the right-hand part of the list;
- candidate Detail is a separate overlay with the same top edge and the same right edge as the candidate list;
- candidate Detail is narrower than the candidate list, so an exposed strip of the candidate list remains visible and clickable on the left;
- candidate Detail has a higher stacking level than the candidate list and therefore overlays it;
- Detail height is independent from candidate-list height, with its own `max-height: min(32rem, 70vh)` and its own left-side scrollbar only when needed;
- selected-song Detail uses the same top line, right edge, width policy, max-height and left-scrollbar policy, but the candidate list is collapsed underneath it;
- the panel uses a previously unused neutral light surface plus a soft shadow so it reads as the active foreground layer without introducing another semantic signal color.

### No companion navigation buttons

The expanded Detail contains no separate:

- `Back to candidates`;
- `Show this candidate`;
- `Close`;
- `Replace with this song`.

Their navigation/selection semantics belong directly to the member fields.

### Candidate-detail activation and lossless return

- clicking an available member field inside Detail closes Detail and returns to the candidate list focused/scrolled to that concrete member;
- this action does not select the member into Song lookup;
- clicking the originally opened available member has the same return-to-list meaning;
- clicking the exposed strip of any candidate row in the retained candidate list while candidate Detail is open also closes Detail and returns the active candidate cursor to exactly that clicked list row;
- an exposed-list return happens before normal candidate selection logic, so it never selects, replaces or clears Song lookup; the currently visible list snapshot is retained for that return so the clicked row does not move or disappear;
- the candidate list remains open after either member-field return or exposed-list return;
- returning from candidate Detail must never clear, replace or rewrite the confirmed Song lookup field;
- for a return initiated from a Detail member, the fresh hard-filtered eligibility snapshot already loaded by Detail is retained for the duration of the open list, so the clicked equivalent cannot disappear during a background candidate refresh;
- the clicked member/candidate id is carried as the highest-priority local focus/scroll target, ahead of the currently selected song;
- therefore the confirmed `number · title` display is not reused as a candidate query and cannot produce a false empty-list message or redirect focus back to the selected song;
- editing Song lookup after the return releases the retained snapshot and resumes normal live candidate querying;
- return scrolling uses the candidate's real geometry relative to the scroll container, not a nested grid-local `offsetTop`, so the target row is actually visible at its corresponding list position;
- for outside-dismiss, the candidate-list block and candidate Detail are treated as one union region: a pointer inside either block remains in the interaction;
- a pointer anywhere outside that union immediately hides both overlays, cancels the restored candidate-list state, and returns Song lookup/Text note to their already confirmed values without song selection;
- the standalone selected-song `Detail` button is the one explicit exception to that generic outside-dismiss rule: clicking it while candidate Detail is open collapses the candidate-origin Detail/list state and the same click then opens Detail for the already selected Song lookup song.

### Selected-song-detail activation and collapsed return

- clicking an available eligible member field closes Detail and selects that member into Song lookup;
- clicking the currently selected member closes Detail and preserves the same Song lookup selection;
- opening the right-side Detail beside a selected Song lookup deactivates/collapses any open candidate list;
- while selected-song Detail is open, that right-side `Detail` control is visually deactivated and pointer-inert; clicking its screen area therefore has the same outside-dismiss meaning as clicking elsewhere outside the open Detail;
- every way of leaving selected-song Detail leaves the candidate list collapsed, whether the candidate list had previously been open or not;
- this includes member activation, clicking `Song lookup`, clicking `Text note`, clicking the deactivated right-side Detail area, and clicking anywhere else outside the expanded Detail;
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

## Latest refinement verification

The selected-song `Detail` switch exception above is the latest approved correction. It requires a fresh exact-head Phase 31.17/CI/Automatic Review Gate and one focused HUMAN browser checkpoint before Ready for review.

## HUMAN checkpoint update — 2026-08-08

Browser-confirmed PASS:

- clicking an exposed candidate row beneath candidate-origin Detail closes Detail back to exactly that candidate without selecting/replacing Song lookup;
- generic outside-dismiss outside the union of candidate list + candidate Detail closes both overlays and preserves the confirmed row values;
- the selected-song right-side `Detail` switch exception remains separately HUMAN-passed.

Latest refinement pending a focused browser check:

- the already accepted row-control vertical center and square size remain unchanged, while arrow glyphs receive additional visual stroke weight;
- the active candidate cursor contour encloses the whole candidate row, including its right-side `Detail` control, matching the whole-item contour used in expanded melody Detail;
- row-level blocking validation is removed from each `Row N`; one action-level bullet list sits between the last Planning row and the `Save working set` / action palette;
- if at least one row lacks both a complete song and a non-empty text note, that list contains exactly one unified message: `Every row must include either a complete song reference or a non-empty textual note.`;
- other current missing/invalid data that disable Planning actions may share the same list, while permission/lifecycle state is not misrepresented as validation.

## Exact-head CI trigger note — 2026-08-08

The isolated macOS refinement runner already passed focused Phase 31.17 acceptance, typecheck, the complete test suite and production build on product commit `b32fb5447b5c7bdbc10ab1cf718bc3e9f67cceaa`. This documentation follow-up exists only to produce a normal non-bot PR head so the repository's standard exact-head CI and fresh Automatic Review Gate can run before the browser checkpoint.


## HUMAN checkpoint update — context-sensitive selected-candidate validity (2026-08-08)

Browser-confirmed before this implementation:

- heavier row-control glyphs: PASS;
- active candidate contour encloses number/title/Detail: PASS;
- centralized Planning action validation placement and unified empty-row message: PASS.

Refinement now required:

- opening candidates over an unchanged confirmed and currently available Song lookup is a valid selected-row state; it must not emit `Select a candidate or cancel the active lookup before leaving Planning.` and must not by itself block Save Working Set;
- only manually changed non-confirmed lookup text is an active lookup state that blocks persistence/workspace departure;
- every selected catalog song is revalidated against the current authoritative candidate context whenever candidate-relevant Service context or current-row occupancy changes;
- candidate-relevant context includes service date, service language, organist/repertoire, authoritative antiphon/context candidate inputs, current plan identity and the current/historical usage snapshot used by the melody window and occupancy rules;
- if at least one selected candidate is no longer available, action-level validation contains one unified `Every candidate must be available.` message and persistence/finalization actions are blocked;
- a confirmed unavailable Song lookup remains visible so the user can repair it, but its text is muted to the same visual color as the empty `Song lookup` placeholder;
- changing Czech → Polish therefore leaves a previously selected Czech song visible but unavailable/muted until replaced (or the context is changed back);
- a failed fresh availability check blocks persistence with `Candidate availability could not be checked.` rather than silently trusting a stale snapshot;
- historical song snapshots without a catalog song id keep the established historical fallback behavior and are not falsely classified as current catalog candidates.
