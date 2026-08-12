import fs from "node:fs";

function replaceExactly(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one target, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

// Production auth decision: record the concrete proof rather than leaving Better Auth as an unverified candidate.
replaceExactly(
  "docs/production-auth-decision.md",
  `Better Auth remains the selected authentication/session candidate with the existing PostgreSQL direction through the Better Auth Drizzle adapter and database-backed sessions. The intended Better Auth capability set is username support over password credentials with public signup disabled. The exact package/configuration is reverified and pinned only in the implementation phase.`,
  `Phase 31.28 implements the first protected staff slice with Better Auth \`1.6.25\`, \`@better-auth/drizzle-adapter\` \`1.6.25\`, and Drizzle ORM \`0.45.2\`. Protected staff sign in by username + password, sessions are database-backed, public privileged signup remains disabled in normal runtime, and authenticated identity resolves to the existing Actor/RoleAssignment model.`,
);
replaceExactly(
  "docs/production-auth-decision.md",
  `Better Auth also currently requires an email field on its auth user record even when username authentication is used. The product **does not** therefore gain an email-login or email-verification requirement. The implementation phase must prove a clean non-user-facing treatment of that library field. If Better Auth would force email into the admin/user workflow in a way that conflicts with this accepted username/password product model, the authentication library choice must be revisited rather than changing the product behavior to fit the library.`,
  `Better Auth also requires an email field on its auth user record even when username authentication is used. Phase 31.28 proves a clean non-user-facing treatment: protected bootstrap generates an internal random \`@organy.invalid\` email value that is never requested from staff, displayed as account data, used as the login identifier, or used for email verification. The product therefore remains username + password. If a future Better Auth change made this separation impossible, the library choice must still be revisited rather than changing the product behavior.`,
);
replaceExactly(
  "docs/production-auth-decision.md",
  `## External technical basis checked 2026-08-12`,
  `## Phase 31.28 implementation status\n\nImplemented for protected admin/priest/organist DB-runtime access:\n\n- pinned Better Auth/Drizzle authentication stack and reviewed auth migration;\n- one-to-one auth-user → \`app_users\` linkage;\n- protected Next.js auth handler and database-backed sessions;\n- username/password sign-in with no email field in the staff-facing flow;\n- explicit environment-driven bootstrap for initial/local staff Accounts, with no embedded production password;\n- server-authoritative session → active Actor → current \`app_user_roles\` resolution in protected Catalog, Interaction, and Planning Lifecycle DB routes;\n- rejection of client-supplied user identity and unassigned-role escalation;\n- sign-out and signed-in own-password change;\n- DB runtime no longer exposes \`Change user\`; memory runtime retains it for deterministic development/testing.\n\nStill not implemented by this slice: congregation nickname voting, admin account/role-management UI for future staff, forgotten-password/reset, forced-first-change, production secret delivery/hosting, OAuth/passkeys/2FA, and identity/security telemetry.\n\n## External technical basis checked 2026-08-12`,
);

// Logical model: distinguish the accepted model from the now-implemented protected subset.
replaceExactly(
  "docs/auth-account-role-model.md",
  `This document defines the logical authentication, account, actor, voter-identity, and role model for the app and records the production access direction corrected in Phase 31.27.`,
  `This document defines the logical authentication, account, actor, voter-identity, and role model for the app, records the production access direction corrected in Phase 31.27, and records the first protected staff implementation completed in Phase 31.28.`,
);
replaceExactly(
  "docs/auth-account-role-model.md",
  `This document does not:\n\n- install or pin an auth package version;\n- define physical auth tables, migrations, SQL, API routes, or final UI components;`,
  `This document does not:\n\n- extend Phase 31.28 protected staff authentication into the still-deferred congregation nickname flow or admin account-management UI;\n- define the final production hosting/secrets/account-recovery operations beyond the implemented protected slice;`,
);
replaceExactly(
  "docs/auth-account-role-model.md",
  `## 15. Better Auth technical boundary\n\nBetter Auth remains the selected implementation candidate because current official documentation supports username-based password sign-in, public signup disabling, password change, and database-backed operation.\n\nCurrent Better Auth documentation also requires an email field on the auth user record. This is an implementation compatibility concern only. It does **not** change the accepted product behavior into email login, email verification, or magic links. The implementation phase must prove a clean non-user-facing handling of that field; otherwise the auth-library choice is revisited.`,
  `## 15. Better Auth technical boundary\n\nPhase 31.28 selects and implements Better Auth \`1.6.25\` with \`@better-auth/drizzle-adapter\` \`1.6.25\` and compatible Drizzle ORM \`0.45.2\` for the first protected staff slice. Username/password sign-in, database-backed sessions, sign-out, and own-password change are exercised by exact-head PostgreSQL acceptance.\n\nBetter Auth's required auth-user email field remains internal implementation data. Phase 31.28 generates a random synthetic \`@organy.invalid\` value during protected bootstrap; staff do not enter or see that value and do not authenticate with it. This preserves the accepted username/password-only staff experience.`,
);
replaceExactly(
  "docs/auth-account-role-model.md",
  `Resolved by corrected Phase 31.27:`,
  `Resolved by corrected Phase 31.27 and implemented for protected staff in Phase 31.28:`,
);
replaceExactly(
  "docs/auth-account-role-model.md",
  `Still deferred:\n\n- exact Better Auth package version and proof/handling of its mandatory internal email field;\n- physical auth schema/migration;\n- exact login/account-admin UI;\n- initial password generation/delivery, forgotten-password/reset, and forced-first-change policy;`,
  `Still deferred:\n\n- admin account/role-management UI for provisioning future staff after the bootstrap slice;\n- congregation nickname-voter creation/reuse and preference-only access implementation;\n- production initial-password generation/delivery procedure, forgotten-password/reset, and forced-first-change policy;`,
);
replaceExactly(
  "docs/auth-account-role-model.md",
  `## 17. What this enables next\n\nThe next auth implementation phase can design and implement a bounded slice around:\n\n- username/password authentication package/configuration and PostgreSQL/Drizzle auth persistence;\n- protected Account ↔ \`app_users\` linkage;\n- first-admin and initial priest/organist provisioning;\n- admin protected-account creation for later priest/organist access;\n- protected username/password login and own-password-change UI;\n- server-side Actor resolution/authorization;\n- nickname-only congregation voter creation/reuse and own preference boundary;\n- removing \`Change user\` as production protected authentication while preserving memory test mode;\n- tests for no public privileged signup, inactive Actors, current roles, last-admin protection, password change, and nickname-only permission isolation.\n\nThat implementation still requires its own Contract Gate and exact-head acceptance before merge.`,
  `## 17. What this enables next\n\nPhase 31.28 closes the first protected staff authentication slice. Remaining identity/access work can now be split without reopening that login boundary:\n\n- nickname-only congregation voter creation/reuse and own-preference boundary;\n- admin UI for creating/deactivating future protected staff Accounts and maintaining privileged RoleAssignments, including last-active-admin protection;\n- explicit password reset/recovery and credential-delivery policy;\n- production deployment/secrets/operations hardening;\n- any separately accepted security/audit telemetry.\n\nEach remaining slice still requires its own Contract Gate and exact-head acceptance before merge.`,
);

// Backlog: the provider-selection item is no longer hypothetical.
replaceExactly(
  "docs/backlog.md",
  `### IP-009 — Compare future authentication providers\n\n- **Type:** Product backlog item\n- **Goal:** Compare authentication provider options without selecting a concrete provider or login method.\n- **Source / traceability:** \`docs/auth-account-role-model.md\`; \`docs/deployment-assumptions.md\`; Architecture Roles and Permissions module; ADR authorization boundary.\n- **Acceptance direction:** Future comparison evaluates how options support direct access for priest, organist, admin, and congregation member roles while keeping provider selection out of current implementation tasks.\n- **Status:** Proposed`,
  `### IP-009 — Implement protected staff authentication provider\n\n- **Type:** Product backlog item\n- **Goal:** Provide the first real protected authentication/session layer for admin, priest, and organist without changing the accepted domain-role model.\n- **Source / traceability:** \`docs/auth-account-role-model.md\`; \`docs/production-auth-decision.md\`; Phase 31.27 Contract Gate #166; Phase 31.28 Contract Gate #170; Architecture Roles and Permissions module.\n- **Acceptance direction:** DB runtime uses username/password Better Auth sessions linked one-to-one to active \`app_users\` Actors, current \`app_user_roles\` remain authoritative, client user IDs cannot authorize protected operations, staff can change their own password/sign out, and memory-only \`Change user\` remains a development/test tool. Congregation nickname access and admin account-management UI remain separate later backlog work.\n- **Status:** Accepted`,
);

// Roadmap: protected mechanics are now implemented; only the explicitly deferred identity slices remain.
replaceExactly(
  "docs/roadmap.md",
  `- Production access direction is resolved in Phase 31.27: admin-provisioned username/password protected Accounts for admin/priest/organist, no public privileged signup, PostgreSQL/Drizzle-backed sessions and server-side authorization through the existing Actor/RoleAssignment model; congregation preference voting is nickname-only with no protected Account/password. Implementation mechanics remain later work.`,
  `- Production access direction is resolved in Phase 31.27, and Phase 31.28 implements the first protected staff mechanics: pinned Better Auth/Drizzle persistence, username/password DB sessions, auth-user → Actor linkage, server-side current-role authorization, sign-out, own-password change, and explicit staff bootstrap. Congregation nickname voting and admin account-management UI remain later work.`,
);
replaceExactly(
  "docs/roadmap.md",
  `- Authentication/account implementation mechanics (auth package installation/version and Better Auth compatibility proof, physical auth schema, protected login/account-admin/password-change UI, nickname-voter UI/persistence, secrets), deployment, operations, backups, or observability; the production access direction is resolved in Phase 31.27.`,
  `- Remaining authentication/account mechanics beyond the Phase 31.28 protected staff slice: congregation nickname-voter UI/persistence, admin future-account/role-management UI, password recovery/credential-delivery policy, production secrets/deployment/operations, and observability.`,
);

// Implementation readiness checklist: protected staff slice is done, full identity/access production work is not.
replaceExactly(
  "docs/implementation-preparation.md",
  `- Production authentication implementation mechanics beyond the Phase 31.27 accepted direction.`,
  `- Production identity/access mechanics beyond the Phase 31.28 protected staff slice, especially congregation nickname access and admin future-account management.`,
);
replaceExactly(
  "docs/implementation-preparation.md",
  `- Production readiness still depends on later operational concerns such as authentication implementation, deployment, backup/restore, and broader production test strategy.`,
  `- Production readiness still depends on remaining identity/account administration, deployment, backup/restore, and broader production test strategy.`,
);
replaceExactly(
  "docs/implementation-preparation.md",
  `- [ ] Production auth implementation completed: package/config pin and Better Auth compatibility proof, auth schema+migration, bootstrap and initial staff provisioning, login/account-admin/own-password-change UI, session-derived Actor integration, nickname-only voter flow, and cutover tests.`,
  `- [x] Protected staff auth slice implemented in Phase 31.28: pinned Better Auth/Drizzle stack, hidden synthetic internal email compatibility proof, auth schema+migration, explicit bootstrap, username/password login, sign-out, own-password change, session-derived active Actor/current-role authorization, and removal of DB-runtime \`Change user\`.\n- [ ] Remaining identity/access implementation completed: congregation nickname-only voter flow, admin future-account/role-management UI with last-admin safeguard, and accepted production password-recovery/credential-delivery/secrets operations.`,
);

console.log("Phase 31.28 source-of-truth authentication implementation update complete.");
