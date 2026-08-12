import fs from "node:fs";

function replaceExact(path, from, to) {
  const before = fs.readFileSync(path, "utf8");
  if (!before.includes(from)) {
    throw new Error(`Expected text not found in ${path}: ${from.slice(0, 120)}`);
  }
  const after = before.replace(from, to);
  if (after === before) throw new Error(`No change made in ${path}`);
  fs.writeFileSync(path, after);
}

const architecture = "docs/architecture.md";
replaceExact(
  architecture,
  "- This document does not choose an authentication provider, account technology, authentication mechanism, account model, or security infrastructure.",
  "- Phase 31.27 selects the production authentication/session direction as Better Auth with PostgreSQL/Drizzle-backed sessions and invitation-only email magic links. Physical auth schema, account/invitation UI, email transport, deployment secrets, and security operations remain later implementation concerns."
);
replaceExact(
  architecture,
  "This does not create schema files, migrations, SQL, package installation, provider selection, hosting selection, auth selection, or implementation. Schema/tooling must keep domain/application lifecycle validation explicit and must not replace it with generated/schema models. Physical schema files, migrations, exact package/version/configuration, hosting provider, database provider, connection management, local development workflow, backup/export/restore design, and auth provider remain unresolved.",
  "This does not create schema files, migrations, SQL, package installation, hosting selection, auth implementation, or deployment. Schema/tooling must keep domain/application lifecycle validation explicit and must not replace it with generated/schema models. Phase 31.27 separately selects Better Auth with the existing PostgreSQL/Drizzle direction, database-backed sessions, and invitation-only email magic links while preserving `app_users` / `app_user_roles` as application Actor/RoleAssignment authority. Physical auth schema, exact auth package version/configuration, email-delivery provider, hosting provider, database provider, connection management, local development workflow, and backup/export/restore design remain later implementation/operations decisions."
);
replaceExact(
  architecture,
  "- authorization enforcement for accepted role permissions;",
  "- server-side authorization enforcement from authenticated Account → active `app_user` Actor → current `app_user_roles`, according to `docs/production-auth-decision.md`;"
);

const roadmap = "docs/roadmap.md";
replaceExact(
  roadmap,
  "- Audit/change-history product policy is resolved: successful state-changing business actions are recorded as append-only explanatory history, separate from Completed-service business history; implementation mechanics remain later work.",
  "- Audit/change-history product policy is resolved: successful state-changing business actions are recorded as append-only explanatory history, separate from Completed-service business history; implementation mechanics remain later work.\n- Production authentication direction is resolved in Phase 31.27: Better Auth, PostgreSQL/Drizzle-backed database sessions, invitation-only passwordless email magic links, and server-side authorization through the existing Actor/RoleAssignment model; implementation mechanics remain later work."
);
replaceExact(
  roadmap,
  "- Authentication, account infrastructure, deployment, operations, backups, or observability.",
  "- Authentication/account implementation mechanics (auth package installation/version, physical auth schema, invitations/login UI, email transport and secrets), deployment, operations, backups, or observability; the production auth direction is resolved in Phase 31.27."
);

const prep = "docs/implementation-preparation.md";
replaceExact(
  prep,
  "- `docs/auth-account-role-model.md`",
  "- `docs/auth-account-role-model.md`\n- `docs/production-auth-decision.md`"
);
replaceExact(
  prep,
  "- **Authentication infrastructure.** Roles and permissions are accepted conceptually, but the authentication approach, auth provider, account model, and authorization mechanism have not been chosen.",
  "- **Authentication infrastructure.** Phase 31.27 selects Better Auth with the existing PostgreSQL/Drizzle direction, database-backed sessions, invitation-only passwordless email magic links, and server-authoritative Account → active Actor → current `app_user_roles` authorization. Package installation/version, physical auth schema/migration, invitation/login/account-admin UI, email delivery, bootstrap implementation, deployment secrets, and production cutover are not implemented yet."
);
replaceExact(
  prep,
  "- **Automatic final-set completion details.** Timing, triggering, safeguards, and exception handling for automatic conversion of final sets to completed-service records still need clarification.\n- **Multi-congregation support.** The current scope is one local congregation; multi-congregation behavior remains intentionally deferred.\n- **Audit/change-history behavior.** Expectations for auditability, version history, undo, attribution, and change review are not yet defined.",
  "- **Multi-congregation support.** The current scope is one local congregation; multi-congregation behavior remains intentionally deferred.\n- **Audit/change-history implementation.** Phase 31.26 resolves the product policy, but physical audit schema/storage, UI, retention/privacy operations, and identity/security telemetry remain later work."
);
replaceExact(
  prep,
  "3. **Authentication/authorization approach.** Decide how users authenticate and how accepted role permissions will be enforced, based on the logical auth/account/role model and evaluated against the accepted direct-access roles: priest, organist, admin, and congregation member. Authentication approach remains unresolved.",
  "3. **Authentication/authorization implementation.** Phase 31.27 resolves the approach: Better Auth, PostgreSQL/Drizzle-backed database sessions, invitation-only passwordless email magic links, `app_users` as Actor, and `app_user_roles` as sole church-domain role authority. Later implementation must pin packages, add auth/invitation persistence, choose email transport, implement bootstrap/login/admin UI, and replace client-selected production identity with server session-derived Actor resolution."
);
replaceExact(
  prep,
  "5. **Audit/change-history expectations.** Decide what changes must be attributable, reviewable, restorable, or historically visible.\n6. **Automatic final-set completion timing and safeguards.** Decide when final sets become completed-service records, what confirmation or automation is allowed, and how exceptions are handled.\n7. **First implementation slice / MVP boundary.** Selected as Planning Lifecycle First; keep excluded scope visible while technical design proceeds.",
  "5. **Audit/change-history implementation mechanics.** Product policy is resolved by Phase 31.26; later work must choose physical audit persistence/UI/retention/privacy mechanics without turning audit into undo/event sourcing.\n6. **Identity/security logging boundary.** Phase 31.27 does not decide whether account/role administration and failed authentication events belong in business audit, security logging, or both.\n7. **First implementation slice / MVP boundary.** Selected as Planning Lifecycle First; keep excluded scope visible while technical design proceeds."
);
replaceExact(
  prep,
  "- Automatic final-set completion remains open and should not block the first manual lifecycle slice.",
  "- Automatic Final → Completed reconciliation is resolved and implemented by Phase 31.25; it no longer blocks the lifecycle slice."
);
replaceExact(
  prep,
  "- Automatic final-set completion details.",
  "- Production authentication implementation mechanics beyond the Phase 31.27 accepted direction."
);
replaceExact(
  prep,
  "- [ ] Authorization model mapped from accepted permissions and `docs/auth-account-role-model.md`; authentication approach remains unresolved.",
  "- [x] Production authentication/authorization direction selected in Phase 31.27: Better Auth + PostgreSQL/Drizzle DB sessions + invitation-only email magic links + server-side Actor/current-role authorization.\n- [ ] Production auth implementation completed: package/config pin, auth/invitation schema+migration, bootstrap, email transport, login/admin UI, session-derived Actor integration, and cutover tests."
);

console.log("Phase 31.27 documentation transform applied.");
