import fs from "node:fs";

function replaceExactlyOnce(path, from, to) {
  const input = fs.readFileSync(path, "utf8");
  const first = input.indexOf(from);
  if (first < 0) throw new Error(`${path}: expected source block not found`);
  if (input.indexOf(from, first + from.length) >= 0) throw new Error(`${path}: source block is not unique`);
  fs.writeFileSync(path, input.replace(from, to));
}

replaceExactlyOnce(
  "docs/backlog.md",
  `### HR-002 — Clarify audit and change-history needs\n\n- **Type:** Open question\n- **Goal:** Determine what auditability or change history is needed for shared knowledge changes, repertoire changes, preferences, planning transitions, and historical records.\n- **Source / traceability:** Architecture Cross-Cutting Concerns; Architecture Open Architecture Questions; Roadmap Open Roadmap Questions.\n- **Acceptance direction:** Product and architecture sources clarify audit/change-history expectations before detailed implementation planning defines mechanisms.\n- **Status:** Open`,
  `### HR-002 — Preserve audit and change history for successful business changes\n\n- **Type:** Product backlog item\n- **Goal:** Preserve an explanatory, append-only history of successful state-changing business actions across shared knowledge, repertoire, preferences, and Planning lifecycle transitions.\n- **Source / traceability:** Architecture Cross-Cutting Concerns; \`docs/audit-change-history-policy.md\`; Phase 31.26 Contract Gate #164.\n- **Acceptance direction:** Audit records answer when, who/system, what action, what business object, and what changed; they preserve stable actor/system and before/after-or-delta context, remain separate from Completed-service business history, are initially admin read-only, and do not provide undo/restore behavior.\n- **Status:** Accepted`,
);

replaceExactlyOnce(
  "docs/architecture.md",
  `- preservation and auditability of shared planning knowledge;`,
  `- preservation and auditability of successful state-changing business actions according to \`docs/audit-change-history-policy.md\`;`,
);

replaceExactlyOnce(
  "docs/architecture.md",
  `- What audit or change-history behavior is needed for knowledge changes, repertoire changes, preferences, and planning state transitions?\n`,
  ``,
);

replaceExactlyOnce(
  "docs/architecture.md",
  `## Deployment and Operations`,
  `## Audit and Change-History Policy\n\nThe product-level audit policy is resolved in \`docs/audit-change-history-policy.md\`. Audit/change history records successful state-changing business actions in shared knowledge, repertoire, preferences, and Planning lifecycle transitions. Each logical event must preserve stable explanatory context for when the change occurred, who or the system performed it, what business action and object were involved, and what changed. Human actor context is historical snapshot data; automatic transitions use actor kind \`system\`.\n\nAudit/change history is append-only explanatory history and is initially admin read-only. It is not event sourcing, restore/undo behavior, read telemetry, failed-authorization/security logging, or a replacement for Completed-service records. Completed-service records remain the authoritative business history of services. Physical schema, payload encoding, indexing, pagination, retention/privacy operations, and UI layout remain later implementation/operations decisions.\n\n## Deployment and Operations`,
);

replaceExactlyOnce(
  "docs/roadmap.md",
  `- Audit or change-history design.`,
  `- Audit/change-history implementation mechanics such as schema, storage, UI, and retention/privacy operations; the product policy is resolved in Phase 31.26.`,
);

replaceExactlyOnce(
  "docs/roadmap.md",
  `- What audit or change-history behavior is needed for knowledge changes, repertoire changes, preferences, planning state transitions, and historical records?\n`,
  ``,
);

replaceExactlyOnce(
  "docs/roadmap.md",
  `- Confirm that product, domain, decision, requirement, workflow, and architecture documents are accepted as the implementation baseline.`,
  `- Confirm that product, domain, decision, requirement, workflow, and architecture documents are accepted as the implementation baseline.\n- Audit/change-history product policy is resolved: successful state-changing business actions are recorded as append-only explanatory history, separate from Completed-service business history; implementation mechanics remain later work.`,
);

fs.writeFileSync(
  "docs/audit-change-history-policy.md",
  `# Audit and Change-History Policy\n\nAuthority: backlog HR-002, Architecture Cross-Cutting Concerns, Roadmap Open Roadmap Questions, Phase 31.26 Contract Gate #164.\n\n## Purpose\n\nAudit/change history exists to explain successful business changes over time without replacing current domain state or Completed-service business history.\n\nIt must let an authorized reader answer:\n\n- when did the change happen;\n- who performed it, or was it a system action;\n- what business action occurred;\n- what business object was affected;\n- what changed.\n\n## Audited scope\n\nAudit/change history is required for successful state-changing actions in these product areas:\n\n- shared knowledge: song/catalog knowledge, melody equivalence, Antiphon/Topic mappings, and non-repetition configuration;\n- organist repertoire;\n- preferences, including admin-managed congregation preferences;\n- Planning lifecycle transitions: Working creation/update/deletion, Final creation/deletion, manual completion, and automatic Final → Completed transition.\n\nRead-only actions such as opening, searching, filtering, candidate viewing, or history viewing are not business audit events. Failed validation or authorization attempts are not business audit events; security and operations logging is a separate future concern.\n\n## Event semantics\n\nOne successful atomic business action creates one logical audit event, even when persistence changes several rows internally. Persistence implementation details are not separate audit actions.\n\nEach event preserves stable historical context sufficient to explain the change without depending on mutable current state:\n\n- occurrence timestamp;\n- actor kind: human or system;\n- for a human action, an actor snapshot sufficient for historical interpretation even if account/person data later changes;\n- for an automatic action, actor kind \`system\`;\n- business action type;\n- affected business-object kind and stable reference or equivalent historical identity;\n- before/after business values, or an explicit delta with equivalent explanatory power.\n\nAutomatic Final → Completed reconciliation is recorded as a system action.\n\n## Immutability and behavior\n\nAudit events are append-only from normal product behavior. Users cannot edit audit events.\n\nAudit/change history is explanatory only. It does not itself:\n\n- undo or restore a change;\n- reopen a planning state;\n- mutate the audited business object;\n- require event sourcing.\n\nInitial product visibility is admin read-only. Contextual history views for priest or organist may be added later without changing the recording policy.\n\n## Relationship to Completed-service history\n\nCompleted-service records remain the authoritative business history of services. They preserve the finalized Service Context and ordered rows for future planning and non-repetition.\n\nThe audit trail records the successful transition or related business change; it does not replace Completed history and does not make Completed records editable.\n\n## Retention and privacy boundary\n\nThe product requires audit events not to be silently purged while retention/privacy policy remains unresolved. Exact retention period, archival, export/privacy procedure, and deletion obligations are deployment/operations decisions and must be explicitly accepted before implementation introduces automatic purge behavior.\n\n## Explicit exclusions for Phase 31.26\n\nThis policy does not choose or implement:\n\n- physical audit schema, table structure, migrations, or payload encoding;\n- indexing, pagination, storage provider, or archival mechanism;\n- API endpoints or UI layout;\n- authentication/account provider;\n- security telemetry, failed-login logging, or failed-authorization logging;\n- restore/undo/version rollback;\n- multi-congregation behavior.\n\nCurrent planning, candidate, knowledge, repertoire, preference, and Completed-history behavior is unchanged by this documentation decision.\n`,
);

fs.writeFileSync(
  "docs/phase-31-26-contract.md",
  `# Phase 31.26 — resolve audit and change-history policy\n\nBaseline: \`main\` \`3c74f82a5ddea766736ddcdf3394bbcf517b5305\` after merged Phase 31.25.\n\nAuthority: backlog HR-002, Architecture Cross-Cutting Concerns and Open Architecture Questions, Roadmap Open Roadmap Questions, Contract Gate #164, user approval on 2026-08-11.\n\n## Scope\n\nPhase 31.26 is documentation/product-decision work only. It resolves the audit/change-history policy in \`docs/audit-change-history-policy.md\`, aligns backlog/architecture/roadmap, and closes HR-002 as an open question.\n\nNo runtime code, database schema, migration, API, UI, authentication, security logging, retention mechanism, or undo/restore behavior is implemented.\n\n## Acceptance\n\n- HR-002 becomes Accepted rather than Open;\n- architecture and roadmap no longer leave audit/change-history product behavior unresolved;\n- successful-write scope, human/system actor context, explanatory before/after-or-delta semantics, append-only behavior, admin read-only visibility, and Completed-history separation are explicit;\n- implementation/operations details remain deferred;\n- documentation-only diff receives a fresh review with no blocking finding.\n\nNever merge without exact user command \`MERGOVAT\`.\n`,
);

console.log("Phase 31.26 documentation transform completed.");
