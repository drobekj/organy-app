# Phase 31.19 — Polish production antiphon catalog

Authoritative issue: #146.

Baseline `main`: `1ed92b593bb2b9d46576b5fb97925355ed73ce04`.

## Accepted product contract

- This phase only populates the already-approved bilingual Antiphon model with the real Polish production catalog.
- The authoritative user-supplied source contains exactly 116 ordered Polish records.
- Production ids are `polish:1` through `polish:116`; displayed/canonical numbers are exactly `1` through `116`.
- Titles are preserved verbatim, including Polish diacritics and punctuation.
- Polish `sourceUrl` is absent. No URL is invented.
- The Czech production catalog remains unchanged at `czech:800` through `czech:915`.
- Memory runtime bundles both authoritative catalogs.
- Production DB synchronization is authoritative for both languages, idempotently upserts the two catalogs and removes same-language rows absent from the authoritative inputs.
- Production counts after synchronization are exactly Czech 116, Polish 116, total 232.
- `polish` Service Language exposes only Polish antiphons.
- `mixed` keeps the established ordering: all Czech antiphons first, then all Polish antiphons; each language is ordered by canonical number.
- Existing number/title search, selection, keyboard navigation, optional-source rendering, language validation, historical snapshots and exact-song recommendation behavior do not change.
- No Polish antiphon recommendation mappings are invented or seeded.
- Topic and wider Service Context layout remain out of scope.

## Acceptance

- Source validation proves the exact frozen Polish file hash, keys, count, ordered contiguous range 1–116 and trimmed non-empty titles.
- Focused memory verification uses the real production catalog and checks Polish-only filtering, Mixed ordering and search.
- Focused DB verification proves 116/116/232 counts, idempotence, stale Polish cleanup and nullable Polish source URLs.
- Existing Phase 31.2–31.18 gates, typecheck, complete tests and production build remain green.
- Fresh Automatic Review Gate has no blocking finding or open thread before HUMAN browser acceptance.
- HUMAN browser acceptance is limited to the newly populated Polish data: Polish list/search/select and Mixed Czech→Polish ordering transition.

## Merge rule

Keep the implementation PR Draft through exact-head CI, fresh review and HUMAN browser acceptance. Never merge without the user's exact `MERGOVAT`.
