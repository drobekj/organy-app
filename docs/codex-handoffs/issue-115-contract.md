# Transport copy for GitHub issue #115

This file exists only because the Codex execution environment could not read the GitHub issue directly.

**GitHub issue #115 remains the sole authoritative specification.** If this transport copy and the live issue differ, stop and report the mismatch. Do not treat this file as a second specification.

Start from the `main` commit that contains this file. Resolve and record that exact SHA before implementation.

# Data Gate A1 — frozen Czech antiphon reference catalog

## Product goal

Create and commit a deterministic, validated JSON reference catalog of Czech antiphons from the same Evangelický kancionál source used for the Czech hymn catalog.

The final catalog contains only triples:

```json
{
  "number": 800,
  "title": "…",
  "url": "https://www.evangelickykancional.cz/pisen/…"
}
```

It will later power the antiphon selector in Service Context. This milestone does not implement that selector.

## Exactly one failure domain

**Acquire, normalize, validate and freeze the Czech Evangelický kancionál records numbered 800 and higher as an auditable JSON artifact.**

## Authoritative source

Use the public GraphQL backend used by the Evangelický kancionál web application:

- endpoint: `https://zpevnik.proscholy.cz/graphql`
- Evangelický kancionál songbook id: `63`
- source web origin for public links: `https://www.evangelickykancional.cz`

Use the source fields that identify the songbook record number, title and public route/URL. Do not scrape rendered HTML when the structured source is available.

## Required artifacts

Create under `data/catalog/`:

1. `catalog-czech-antiphons.json`
   - JSON array;
   - exact keys per record: `number`, `title`, `url`;
   - no `source_id`, language, recommended song, tags, lyrics or other metadata;
   - deterministic ordering by antiphon number;
   - UTF-8, stable formatting and trailing newline.

2. A reproducible extraction/materialization script using only existing runtime capabilities.

3. An offline verification script or validation artifact proving the frozen JSON without requiring network access.

Expose concise npm commands for extraction and offline verification. Do not add a dependency or test framework.

## Selection and normalization rules

- Include only Evangelický kancionál songbook `63` records whose printed source number is `800` or higher.
- Preserve the printed antiphon number faithfully.
- Do not infer, renumber or silently normalize variants.
- First inspect the complete source-number set.
- If any included source number is not an unambiguous integer, stop and report the exact values instead of inventing a canonicalization rule.
- Trim surrounding whitespace from titles; reject empty titles.
- Derive each final URL from the source public route/URL and require the final origin to be exactly `https://www.evangelickykancional.cz`.
- Reject duplicate antiphon numbers.
- Sort ascending by number.
- Fail if no qualifying records are found.

## Recommended-song boundary

Do not extract, infer or guess a recommended hymn number.

The future knowledge relation `(language, antiphon number, recommended hymn number)` will be entered manually by an admin, similarly to melodic equivalence. It is explicitly outside this issue.

## Corrected acquisition strategy

The Codex runtime is allowed to prepare the extractor and a **temporary acquisition job inside the existing CI workflow** because direct outbound access is blocked in Codex.

The temporary acquisition job must:

- run only on the implementation Draft PR branch;
- call the structured GraphQL source;
- run the extractor;
- validate the generated JSON sufficiently to reject empty, malformed, duplicate or wrong-origin output;
- upload one artifact containing the generated JSON, a source-response snapshot or equivalent reproducible acquisition evidence, and a manifest with record count, first/last number and SHA-256;
- never write directly to `main`;
- never become part of final standard CI.

After the acquisition artifact is produced, stop. The reviewer will transfer the generated JSON into the same implementation branch. The same Draft PR, branch and issue continue.

Before the final reviewed head:

- remove the temporary live-network acquisition job;
- keep the extractor;
- commit the frozen JSON;
- add offline verification;
- make standard CI fully offline for this dataset.

No second issue, branch, PR or user checkpoint may be created.

## Automated acceptance

The implementation must prove on the final head:

1. the acquisition run successfully obtained the complete source set for songbook `63`;
2. every accepted record has exactly `number`, `title`, `url`;
3. every number is an integer `>= 800`;
4. numbers are unique and strictly ascending;
5. titles are non-empty after trimming;
6. every URL is valid HTTPS on `www.evangelickykancional.cz`;
7. the committed JSON is byte-stable when extraction is rerun against the captured source response;
8. the offline verifier checks exact record count, first/last number, schema, uniqueness, ordering and SHA-256;
9. no recommended-song field or relation exists in the artifact;
10. existing typecheck, tests and build remain green;
11. final standard CI is green on the exact final head without depending on the live external service.

The PR evidence must state the exact record count, number range and SHA-256 of `catalog-czech-antiphons.json`.

## One human checkpoint

After automated review authorizes it, the user opens exactly three URLs named by the verifier: first record, a deterministic middle record and last record. The checkpoint is PASS only when each page visibly corresponds to the JSON number/title.

No local script execution or diagnosis is part of the human checkpoint.

## Definition of Done

- The frozen Czech antiphon JSON and reproducible extractor are committed.
- Offline verification is deterministic and green.
- Exact count, range and SHA-256 are recorded in the Draft PR.
- Existing regressions and final offline CI are green on the final head.
- The three-link human checkpoint passes.
- Merge Gate passes, the user explicitly approves merge, the PR is merged and issue #115 closes.

## Explicit exclusions / forbidden changes

Do not implement or modify:

- Service Context UI or antiphon selector;
- database schema or migrations;
- service records or persistence;
- Polish antiphon catalog or Polish source extraction;
- recommended-song knowledge relations;
- melodic equivalence;
- authentication, roles or authorization;
- existing Czech/Polish hymn catalog records or hashes;
- Phase 31.8 melody equivalence behavior;
- application runtime behavior;
- a new dependency or test framework;
- a permanent new CI workflow.

## Corrective boundary and stop conditions

Corrective passes may address only source querying, source-field mapping, temporary acquisition CI, deterministic JSON production, validation, hashing, offline verification and final CI cleanup for this artifact.

Stop and return to Review Gate if:

- source numbers `800+` require a new canonicalization/product rule;
- the public structured source cannot provide number, title and route/URL;
- GitHub Actions also cannot reach the structured source;
- UI, DB, knowledge or another subsystem becomes necessary;
- the source dataset is materially ambiguous;
- the same architectural blocker survives two corrective passes.

## Draft PR evidence

Open exactly one Draft PR to `main` with `Closes #115` and include:

- exact baseline and current head SHA;
- extractor and offline verifier commands;
- exact source endpoint and songbook id;
- acquisition run and artifact evidence;
- exact record count and number range;
- SHA-256;
- first, deterministic middle and last records with URLs;
- proof of schema, ordering, uniqueness and URL-origin checks;
- final standard CI run on the exact final head;
- explicit forbidden-area confirmation;
- human checkpoint marked `PENDING`.

Do not mark ready and do not merge.
