# Audit and Change-History Policy

Authority: backlog HR-002, Architecture Cross-Cutting Concerns, Roadmap Open Roadmap Questions, Phase 31.26 Contract Gate #164.

## Purpose

Audit/change history exists to explain successful business changes over time without replacing current domain state or Completed-service business history.

It must let an authorized reader answer:

- when did the change happen;
- who performed it, or was it a system action;
- what business action occurred;
- what business object was affected;
- what changed.

## Audited scope

Audit/change history is required for successful state-changing actions in these product areas:

- shared knowledge: song/catalog knowledge, melody equivalence, Antiphon/Topic mappings, and non-repetition configuration;
- organist repertoire;
- preferences, including admin-managed congregation preferences;
- Planning lifecycle transitions: Working creation/update/deletion, Final creation/deletion, manual completion, and automatic Final → Completed transition.

Read-only actions such as opening, searching, filtering, candidate viewing, or history viewing are not business audit events. Failed validation or authorization attempts are not business audit events; security and operations logging is a separate future concern.

## Event semantics

One successful atomic business action creates one logical audit event, even when persistence changes several rows internally. Persistence implementation details are not separate audit actions.

Each event preserves stable historical context sufficient to explain the change without depending on mutable current state:

- occurrence timestamp;
- actor kind: human or system;
- for a human action, an actor snapshot sufficient for historical interpretation even if account/person data later changes;
- for an automatic action, actor kind `system`;
- business action type;
- affected business-object kind and stable reference or equivalent historical identity;
- before/after business values, or an explicit delta with equivalent explanatory power.

Automatic Final → Completed reconciliation is recorded as a system action.

## Immutability and behavior

Audit events are append-only from normal product behavior. Users cannot edit audit events.

Audit/change history is explanatory only. It does not itself:

- undo or restore a change;
- reopen a planning state;
- mutate the audited business object;
- require event sourcing.

Initial product visibility is admin read-only. Contextual history views for priest or organist may be added later without changing the recording policy.

## Relationship to Completed-service history

Completed-service records remain the authoritative business history of services. They preserve the finalized Service Context and ordered rows for future planning and non-repetition.

The audit trail records the successful transition or related business change; it does not replace Completed history and does not make Completed records editable.

## Retention and privacy boundary

The product requires audit events not to be silently purged while retention/privacy policy remains unresolved. Exact retention period, archival, export/privacy procedure, and deletion obligations are deployment/operations decisions and must be explicitly accepted before implementation introduces automatic purge behavior.

## Explicit exclusions for Phase 31.26

This policy does not choose or implement:

- physical audit schema, table structure, migrations, or payload encoding;
- indexing, pagination, storage provider, or archival mechanism;
- API endpoints or UI layout;
- authentication/account provider;
- security telemetry, failed-login logging, or failed-authorization logging;
- restore/undo/version rollback;
- multi-congregation behavior.

Current planning, candidate, knowledge, repertoire, preference, and Completed-history behavior is unchanged by this documentation decision.
