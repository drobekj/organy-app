# Codex handoff for issue #91

## Phase

Phase 31A — Real Catalog Foundation.

## Purpose

Provide the accepted Czech and Polish catalog inputs inside the implementation branch so Codex does not need chat attachments.

## Required first action

Run from the repository root:

```bash
node data/catalog/materialize-catalogs.mjs
```

Do not begin schema/import/runtime implementation until this command succeeds and prints:

```text
Czech catalog: 808 records, SHA-256 OK
Polish catalog: 990 records, SHA-256 OK
Czech validation: SHA-256 OK
Polish validation: SHA-256 OK
Catalog handoff complete: 808 Czech + 990 Polish = 1,798 accepted records.
```

Then inspect issue #91 and implement its complete acceptance contract in this same branch.

## Branch and PR rule

- Continue branch: `codex/phase-31a-real-catalog`.
- Do not start a replacement branch from `main`.
- Open one pull request from this branch to `main`.
- The PR is intended to close Phase 31A after automated acceptance and the single human checkpoint required by issue #91.

## Data rule

The reconstructed files are frozen inputs. Do not scrape them again, reformat them, normalize titles, or alter records silently. The final implementation should commit the reconstructed canonical JSON files and may delete the temporary `payload/*.part*` transport files only after all four SHA-256 checks pass.
