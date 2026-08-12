# Phase 31.26 — resolve audit and change-history policy

Baseline: `main` `3c74f82a5ddea766736ddcdf3394bbcf517b5305` after merged Phase 31.25.

Authority: backlog HR-002, Architecture Cross-Cutting Concerns and Open Architecture Questions, Roadmap Open Roadmap Questions, Contract Gate #164, user approval on 2026-08-11.

## Scope

Phase 31.26 is documentation/product-decision work only. It resolves the audit/change-history policy in `docs/audit-change-history-policy.md`, aligns backlog/architecture/roadmap, and closes HR-002 as an open question.

No runtime code, database schema, migration, API, UI, authentication, security logging, retention mechanism, or undo/restore behavior is implemented.

## Acceptance

- HR-002 becomes Accepted rather than Open;
- architecture and roadmap no longer leave audit/change-history product behavior unresolved;
- successful-write scope, human/system actor context, explanatory before/after-or-delta semantics, append-only behavior, admin read-only visibility, and Completed-history separation are explicit;
- implementation/operations details remain deferred;
- documentation-only diff receives a fresh review with no blocking finding.

Never merge without exact user command `MERGOVAT`.
