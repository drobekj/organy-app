import { readFileSync, writeFileSync, rmSync } from "node:fs";

function replaceExact(path, before, after) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing exact stale anchor in ${path}: ${before.slice(0, 120)}`);
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one stale anchor in ${path}, found ${count}: ${before.slice(0, 120)}`);
  writeFileSync(path, source.replace(before, after));
}

function replaceSection(path, startHeading, endHeading, replacement) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(startHeading);
  const end = source.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) throw new Error(`Missing section boundary in ${path}: ${startHeading} -> ${endHeading}`);
  writeFileSync(path, source.slice(0, start) + replacement.trimEnd() + "\n\n" + source.slice(end));
}

replaceExact(
  "docs/auth-account-role-model.md",
  "This document defines the logical authentication, account, actor, voter-identity, and role model for the app and records the production access direction corrected in Phase 31.27.",
  "This document defines the logical authentication, account, actor, voter-identity, and role model for the app, records the production access direction corrected in Phase 31.27, and records the protected-staff authentication implementation established in Phase 31.28."
);

replaceSection(
  "docs/auth-account-role-model.md",
  "## 2. Non-goals",
  "## 3. Accepted access context",
  `## 2. Non-goals

This document does not:

- define the still-unimplemented congregation nickname-voter UI/persistence flow;
- define a final admin-facing protected-account/role-management UI or username-management UI;
- define exact password-generation, credential-delivery, forgotten-password/reset, or forced-first-change policy;
- define exact nickname normalization or browser convenience persistence;
- select a hosting provider or production database provider;
- introduce email login, email magic links, public privileged signup, social OAuth, passkeys, or 2FA;
- introduce multi-congregation identity/tenancy behavior;
- equate legacy people records with authenticated users;
- add anti-abuse identity proof for congregation nickname voting;
- define security telemetry or account/role audit persistence.

Phase 31.28 now implements the bounded protected-staff mechanics that were previously deferred: pinned Better Auth/Drizzle dependencies, physical auth persistence and migration, username/password login, logout, own-password change, explicit bootstrap/server provisioning, and server-side session → active Actor → current RoleAssignment authorization. Deployment/operations and the remaining access-management/voter flows still require later accepted work.`
);

replaceSection(
  "docs/auth-account-role-model.md",
  "## 15. Better Auth technical boundary",
  "## 17. What this enables next",
  `## 15. Better Auth technical boundary

Phase 31.28 implements and pins the protected-staff authentication slice with Better Auth 1.6.25 and @better-auth/drizzle-adapter 1.6.25, using Drizzle ORM 0.45.2 / drizzle-kit 0.31.10 and PostgreSQL-backed sessions.

The Better Auth username plugin provides the user-facing username + password flow. The protected handler disables public email signup, email/password sign-in, and username enumeration. Better Auth's mandatory email field is satisfied only by a unique synthetic internal address under \`@organy.invalid\`; the application does not request, display, verify, use for login, or use for password recovery that address.

The auth persistence includes Better Auth's user/session/account/verification tables plus an explicit one-to-one auth-user → \`app_users\` link. Protected authorization does not use Better Auth roles as church-domain authority: every protected request resolves the authenticated session to exactly one active Actor and reloads current \`app_user_roles\` before applying application permission rules.

If a later Better Auth upgrade can no longer preserve these product boundaries, the library choice or integration must be revisited rather than changing the accepted username/password product behavior.

## 16. Resolved and remaining questions

Resolved by corrected Phase 31.27 and implemented for protected staff in Phase 31.28:

- protected user experience — username + password;
- protected signup model — none; admin/setup provisions accounts;
- exact first protected implementation — Better Auth 1.6.25 + PostgreSQL/Drizzle-backed sessions;
- auth persistence and one-to-one Account → Actor linkage;
- synthetic mandatory auth email kept fully internal;
- protected username login, logout, and own password change;
- explicit initial staff bootstrap and authenticated-admin server provisioning path;
- production protected authorization — server session → active Actor → current \`app_user_roles\`;
- client-supplied Actor IDs are not protected authorization authority;
- DB runtime no longer exposes \`Change user\`; memory runtime keeps it for deterministic tests;
- inactive Actors and missing/non-protected role assignments are rejected without requiring re-login for role changes.

Still deferred:

- congregation nickname-voter UI/persistence and exact nickname normalization/browser convenience;
- final admin-facing protected-account/role/username management UI and normal last-active-admin enforcement at that administration boundary;
- initial password generation/delivery policy, forgotten-password/reset, and forced-first-change policy;
- production hosting, deployment cutover, secrets operations, backup/restore, and observability;
- identity/security audit and telemetry policy;
- any future OAuth, passkey, 2FA, or multi-congregation expansion.`
);

replaceSection(
  "docs/auth-account-role-model.md",
  "## 17. What this enables next",
  "That implementation still requires its own Contract Gate and exact-head acceptance before merge.",
  `## 17. What this enables next

With protected staff authentication implemented by Phase 31.28, later access work can stay separated into smaller concerns:

- congregation nickname-only voter creation/reuse and own-preference authorization;
- final admin-facing account/role administration, including last-active-admin protection;
- credential-delivery, recovery/reset, and any forced-first-change policy;
- production deployment/secrets/backup/restore and operational hardening;
- identity/security logging policy;
- future optional OAuth/passkey/2FA only if separately accepted.

Phase 31.28 does not make the application production-deployed; it closes the protected staff authentication implementation slice only.`
);
replaceExact(
  "docs/auth-account-role-model.md",
  "That implementation still requires its own Contract Gate and exact-head acceptance before merge.\n",
  ""
);

replaceExact(
  "docs/production-auth-decision.md",
  "Better Auth remains the selected authentication/session candidate with the existing PostgreSQL direction through the Better Auth Drizzle adapter and database-backed sessions. The intended Better Auth capability set is username support over password credentials with public signup disabled. The exact package/configuration is reverified and pinned only in the implementation phase.",
  "Phase 31.28 implements the protected staff authentication/session layer with Better Auth 1.6.25 and @better-auth/drizzle-adapter 1.6.25 over PostgreSQL/Drizzle database-backed sessions. The protected handler accepts username + password only; public protected signup, email/password sign-in, and username enumeration are disabled."
);

replaceSection(
  "docs/production-auth-decision.md",
  "## Better Auth implementation caveat",
  "## Audit and security boundary",
  `## Better Auth implementation result

Phase 31.28 completed the compatibility proof that Phase 31.27 required.

- Better Auth and its Drizzle adapter are pinned at 1.6.25 for this slice.
- Drizzle ORM is aligned to 0.45.2 and drizzle-kit to 0.31.10.
- Better Auth's mandatory email field is populated with a unique synthetic \`auth-…@organy.invalid\` value created server-side.
- That synthetic email is not requested from staff, not displayed by the staff-session API/UI, not verified, not accepted for protected sign-in, and not used for recovery.
- Protected public signup and email/password sign-in are disabled.
- Username/password login, PostgreSQL-backed sessions, logout, and signed-in own-password change are implemented.
- Better Auth identity is linked one-to-one to an existing active \`app_users\` Actor; current roles are reloaded from \`app_user_roles\` for protected authorization on every request.
- An explicit bootstrap command establishes initial protected staff identities without a repository-stored default password; an authenticated domain admin server endpoint can provision later protected staff Accounts.

The accepted user experience therefore remains username + password. The internal synthetic email exists only to satisfy the current library schema contract.`
);

replaceExact(
  "docs/production-auth-decision.md",
  "The exact library version is intentionally not frozen by this documentation-only phase and must be pinned and reverified in the implementation PR.",
  "Phase 31.28 pins and verifies the protected-staff implementation at Better Auth 1.6.25 with @better-auth/drizzle-adapter 1.6.25, Drizzle ORM 0.45.2, and drizzle-kit 0.31.10."
);

replaceExact(
  "docs/roadmap.md",
  "- Production access direction is resolved in Phase 31.27: admin-provisioned username/password protected Accounts for admin/priest/organist, no public privileged signup, PostgreSQL/Drizzle-backed sessions and server-side authorization through the existing Actor/RoleAssignment model; congregation preference voting is nickname-only with no protected Account/password. Implementation mechanics remain later work.",
  "- Production access direction is resolved in Phase 31.27, and Phase 31.28 implements the protected admin/priest/organist slice: pinned username/password auth, PostgreSQL/Drizzle-backed sessions, auth persistence/migration, Account→Actor linkage, server-side current-role authorization, bootstrap/server provisioning, login/logout, and own password change. Congregation preference voting remains a separate nickname-only flow with no protected Account/password and is not implemented by 31.28."
);
replaceExact(
  "docs/roadmap.md",
  "- Authentication/account implementation mechanics (auth package installation/version and Better Auth compatibility proof, physical auth schema, protected login/account-admin/password-change UI, nickname-voter UI/persistence, secrets), deployment, operations, backups, or observability; the production access direction is resolved in Phase 31.27.",
  "- Remaining authentication/account work after Phase 31.28: congregation nickname-voter UI/persistence, final admin-facing account/role/username management, credential delivery/recovery/forced-first-change policy, production secrets/cutover, and identity/security telemetry. Protected staff package/version compatibility, auth schema/migration, login/logout, own-password change, bootstrap/server provisioning, and session→Actor/current-role authorization are implemented by Phase 31.28. Deployment, operations, backups, and observability remain later work."
);

replaceExact(
  "docs/backlog.md",
  `### IP-009 — Compare future authentication providers

- **Type:** Product backlog item
- **Goal:** Compare authentication provider options without selecting a concrete provider or login method.
- **Source / traceability:** \`docs/auth-account-role-model.md\`; \`docs/deployment-assumptions.md\`; Architecture Roles and Permissions module; ADR authorization boundary.
- **Acceptance direction:** Future comparison evaluates how options support direct access for priest, organist, admin, and congregation member roles while keeping provider selection out of current implementation tasks.
- **Status:** Proposed`,
  `### IP-009 — Establish protected staff authentication

- **Type:** Product backlog item
- **Goal:** Provide production-capable protected username/password authentication for admin, priest, and organist without turning authentication-library identity into the church-domain role model.
- **Source / traceability:** Phase 31.27 Contract Gate #166; Phase 31.28 Contract Gate #168; \`docs/auth-account-role-model.md\`; \`docs/production-auth-decision.md\`; REQ-012.
- **Acceptance direction:** Better Auth 1.6.25 provides username/password protected login, PostgreSQL-backed sessions, logout and own-password change; public signup/email login are disabled; the mandatory synthetic email stays internal; each auth identity links one-to-one to an active \`app_users\` Actor; protected authorization reloads current \`app_user_roles\` server-side and ignores client Actor IDs as authority.
- **Status:** Accepted`
);
replaceExact(
  "docs/backlog.md",
  `### IP-011 — Map first-slice authorization checks to actor-role subset

- **Type:** Product backlog item
- **Goal:** Map Planning Lifecycle First authorization checks to the minimal Person / Actor / RoleAssignment or equivalent actor-role subset before implementation design.
- **Source / traceability:** \`docs/auth-account-role-model.md\`; \`docs/planning-lifecycle-first-schema-subset.md\`; REQ-012; Architecture Roles and Permissions module; ADR authorization boundary.
- **Acceptance direction:** Future authorization design identifies how priest, organist, admin, and congregation member checks are resolved at state-changing boundaries without selecting an auth provider or treating UI hiding as sufficient enforcement.
- **Status:** Proposed`,
  `### IP-011 — Enforce protected authorization through Actor and current roles

- **Type:** Product backlog item
- **Goal:** Keep protected authorization server-authoritative while preserving the Person / Account / Actor / RoleAssignment separation.
- **Source / traceability:** Phase 31.28 Contract Gate #168; \`docs/auth-account-role-model.md\`; \`docs/planning-lifecycle-first-schema-subset.md\`; REQ-012; Architecture Roles and Permissions module.
- **Acceptance direction:** Protected DB mutations validate a real auth session, resolve exactly one active \`app_users\` Actor, reload current \`app_user_roles\`, enforce the requested action there, and never treat UI hiding or client-supplied Actor IDs/roles as authorization authority.
- **Status:** Accepted`
);
replaceExact(
  "docs/backlog.md",
  "- authentication infrastructure;",
  "- remaining congregation nickname-voter access, final protected account/role administration UI, credential recovery/delivery policy, and production auth cutover/operations beyond the accepted Phase 31.28 staff slice;"
);

replaceExact(
  "docs/implementation-preparation.md",
  "remaining production-readiness concerns include production database/provider and hosting choices, production auth implementation beyond the Phase 31.27 accepted direction, local/production operations, backup/export/restore design, seed policy, and broader test/operations strategy.",
  "remaining production-readiness concerns include production database/provider and hosting choices, congregation nickname-voter access and final account/role administration beyond the Phase 31.28 protected staff slice, local/production operations, backup/export/restore design, seed policy, and broader test/operations strategy."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- **Authentication infrastructure.** Phase 31.27 selects admin-provisioned username/password protected Accounts for admin/priest/organist, PostgreSQL/Drizzle-backed sessions, no public privileged signup, and server-authoritative Account → active Actor → current `app_user_roles` authorization. Congregation preference voting is nickname-only with no protected Account/password. Package installation/version, physical auth schema/migration, login/account-admin UI, bootstrap implementation, password-recovery mechanics, nickname UI details, deployment secrets, and production cutover are not implemented yet. Better Auth remains the selected candidate only if its mandatory internal email field can stay out of the required user-facing flow.",
  "- **Remaining authentication/account work.** Phase 31.28 implements protected admin/priest/organist username/password auth with pinned Better Auth/Drizzle dependencies, physical auth schema/migration, PostgreSQL sessions, one-to-one auth identity → `app_users` linkage, server-side current-role authorization, login/logout, own-password change, explicit bootstrap, and authenticated-admin server provisioning. The mandatory Better Auth email field is proven internal-only. Still not implemented here are congregation nickname-voter UI/persistence, final admin-facing account/role/username management, credential delivery/recovery/forced-first-change policy, deployment secrets/cutover, and identity/security telemetry."
);
replaceExact(
  "docs/implementation-preparation.md",
  "3. **Authentication/authorization implementation.** Phase 31.27 resolves the product approach: admin-provisioned username/password protected Accounts for admin/priest/organist, no public privileged signup, protected database sessions resolving to `app_users`, `app_user_roles` as sole church-domain role authority, and nickname-only congregation voters with no protected Account. Later implementation must pin/prove the auth package, add auth persistence, implement bootstrap/login/account-admin/password-change UI, implement nickname voter persistence, and replace client-selected protected production identity with server session-derived Actor resolution.",
  "3. **Authentication/authorization implementation.** Phase 31.28 completes the protected staff slice selected in Phase 31.27: Better Auth 1.6.25 is pinned/proven, auth persistence and migration exist, username login/logout/own-password change are implemented, explicit bootstrap and authenticated-admin server provisioning exist, and protected DB identity now comes from server session → active `app_users` Actor → current `app_user_roles` rather than client-selected user IDs. Remaining implementation decisions are the congregation nickname-voter flow, final admin-facing account/role/username management, credential delivery/recovery policy, deployment secrets/cutover, and identity/security logging."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- Production authentication implementation mechanics beyond the Phase 31.27 accepted direction.",
  "- Congregation nickname-voter access and final protected account/role administration beyond the implemented Phase 31.28 staff-auth slice."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- Production readiness still depends on later operational concerns such as authentication implementation, deployment, backup/restore, and broader production test strategy.",
  "- Production readiness still depends on later access/operational concerns such as congregation nickname voting, final account/role administration, deployment, backup/restore, and broader production test strategy."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- [ ] Production auth implementation completed: package/config pin and Better Auth compatibility proof, auth schema+migration, bootstrap and initial staff provisioning, login/account-admin/own-password-change UI, session-derived Actor integration, nickname-only voter flow, and cutover tests.",
  "- [x] Protected staff auth implementation completed in Phase 31.28: package/config pin and Better Auth compatibility proof, auth schema+migration, explicit bootstrap/server provisioning, username login/logout/own-password-change UI, and session-derived active Actor/current-role integration.\n- [ ] Remaining access work completed: congregation nickname-only voter flow, final admin-facing protected account/role/username administration including last-active-admin enforcement, credential recovery/delivery policy, and production auth cutover/operations."
);

rmSync("scripts/phase-31-28-doc-sync.mjs", { force: true });
rmSync(".github/workflows/phase-31-28-doc-sync.yml", { force: true });
