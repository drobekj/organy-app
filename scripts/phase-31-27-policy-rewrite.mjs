import fs from "node:fs";

const contractPath = "docs/phase-31-27-contract.md";
const decisionPath = "docs/production-auth-decision.md";
const modelPath = "docs/auth-account-role-model.md";

function requireContains(path, needle) {
  const text = fs.readFileSync(path, "utf8");
  if (!text.includes(needle)) {
    throw new Error(`${path}: expected text not found: ${needle}`);
  }
  return text;
}

function replaceExact(path, oldText, newText) {
  const text = requireContains(path, oldText);
  const count = text.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected exactly one occurrence, found ${count}: ${oldText}`);
  }
  fs.writeFileSync(path, text.replace(oldText, newText));
}

requireContains(contractPath, "passwordless email magic-link sign-in");
requireContains(decisionPath, "The first supported sign-in method is **passwordless email magic link**.");
requireContains(modelPath, "sign-in is passwordless email magic link");

fs.writeFileSync(contractPath, `# Phase 31.27 — resolve production authentication and account/role model

Baseline: \`main\` \`2a76dfcf8aedb72012e71491457e6484d7ab8bf2\` after merged Phase 31.26. The two commits after the Phase 31.26 merge are an accidental placeholder create/delete pair with zero net tree diff.

Authority: Contract Gate #166; \`docs/auth-account-role-model.md\`; REQ-012; backlog RP-001/RP-002; current Account/Actor/Person/RoleAssignment separation; user correction on 2026-08-12.

## Scope

Phase 31.27 is documentation/technical-decision work only.

It selects the first production authentication and voter-identity direction as:

- login-capable protected accounts for admin, priest, and organist;
- classic username + password sign-in for those accounts;
- no public self-registration for admin/priest/organist;
- admin-owned provisioning of protected accounts, including username and initial password;
- logged-in protected-account users may change their own password;
- first production setup provisions the initial admin and the current priest/organist protected accounts before handoff;
- Better Auth remains the selected authentication/session candidate with PostgreSQL/Drizzle-backed database sessions, username support, password credentials, and public signup disabled, subject to implementation proof that its mandatory internal email field does not leak into the required user-facing login/provisioning flow;
- \`app_users\` remains the application Actor concept and \`app_user_roles\` remains the sole church-domain role source of truth;
- congregation-member voting uses a nickname-only lightweight Actor with the \`congregation_member\` role and **no login-capable Account, password, or identity verification**;
- entering a nickname creates or reuses that nickname voter profile; the system intentionally does not prevent one human from using multiple nicknames and does not prove ownership of a nickname;
- a nickname-only congregation Actor may mutate only that profile's own accepted preference votes and has no planning, repertoire, knowledge, or account-administration permissions;
- protected production mutations use server-side authenticated session → active Actor → current roles authorization;
- demo \`Change user\` remains only in memory development/test runtime.

## Explicit exclusions

No auth package installation/version pin, physical auth schema/migration, login/account-admin UI, exact first-admin bootstrap tooling, password-recovery/reset policy, nickname normalization/UI persistence details, deployment cutover, hosting choice, OAuth/passkey/2FA, security telemetry, or multi-congregation behavior is implemented.

Magic-link/email login, public privileged signup, and password-protected congregation-member accounts are explicitly **not** the selected first production behavior.

## Acceptance

- \`docs/production-auth-decision.md\` records the corrected username/password and nickname-only product direction;
- \`docs/auth-account-role-model.md\` distinguishes protected login-capable Accounts from nickname-only congregation Actors;
- architecture/implementation-preparation/roadmap no longer describe invitation/magic-link behavior as the selected direction;
- Account, Actor, Person and application RoleAssignment remain distinct;
- \`app_user_roles\` remains authoritative for church-domain roles, including the automatically assigned \`congregation_member\` role for nickname-only voter Actors;
- production protected authorization never trusts client role/actor claims;
- congregation-member nickname identity is explicitly non-authenticated and abuse-resistant identity proof is out of scope by design;
- documentation-only final diff;
- fresh review finds no blocking inconsistency.

Never merge without exact user command \`MERGOVAT\`.
`);

fs.writeFileSync(decisionPath, `# Production Authentication Decision

Authority: Phase 31.27 Contract Gate #166; \`docs/auth-account-role-model.md\`; REQ-012; backlog RP-001/RP-002; current Next.js + Drizzle + PostgreSQL implementation direction; user correction on 2026-08-12.

## Decision

The first production access model has **two deliberately different levels**.

### Protected staff access

Admin, priest, and organist use login-capable protected Accounts.

The user-facing sign-in method is **username + password**. There is no public self-registration for these roles.

Admin provisions a protected Account, chooses its username, sets an initial password, links it to the appropriate application Actor/Person context, and assigns accepted church-domain roles. The credentials are handed to the user outside the application. Once signed in, the user may change their own password.

The first production handoff must already have the initial admin and current priest/organist protected Accounts provisioned. When a new priest or organist later needs access, an admin provisions that Account; the newcomer does not register themselves.

Better Auth remains the selected authentication/session candidate with the existing PostgreSQL direction through the Better Auth Drizzle adapter and database-backed sessions. The intended Better Auth capability set is username support over password credentials with public signup disabled. The exact package/configuration is reverified and pinned only in the implementation phase.

### Congregation-member voting access

A congregation member does **not** receive a login-capable Account.

To enter the voting interaction, the visitor supplies only a nickname. The application creates or reuses a lightweight application Actor associated with that nickname and the \`congregation_member\` role, then stores that Actor's own accepted song-preference votes.

This nickname is deliberately **not authenticated identity**:

- there is no password;
- there is no email verification;
- there is no privileged account signup;
- the system does not attempt to prove that the nickname belongs to one real person;
- the system does not attempt to prevent one real person from using multiple nicknames;
- if another person enters the same nickname, the system has no basis to distinguish them and treats the nickname as the same lightweight voter profile.

This is an accepted simplicity/trust trade-off for congregation preference voting. The nickname-only profile never grants planning, repertoire, knowledge, or account-administration permissions.

## Why this fits the current application

The application already separates:

- \`catalog_persons\` — real-world Person records;
- \`app_users\` — application Actors;
- \`app_user_roles\` — church-domain authorization role assignments.

The authentication library therefore supplies only the missing credential/session layer for protected Accounts. It does not replace the domain model.

A protected Account maps to exactly one active \`app_user\` Actor. A nickname-only congregation Actor has no login-capable Account at all.

\`app_user_roles\` remains the single church-domain role authority. Better Auth roles, if any exist internally for technical reasons, must not become the authority for priest/organist/admin/congregation-member application permissions.

## Protected sign-in flow

1. User opens the protected sign-in screen.
2. User enters username and password.
3. The authentication layer validates the password and creates the database-backed session.
4. The server resolves the authentication identity to exactly one active \`app_user\` Actor.
5. Current church-domain roles are read from \`app_user_roles\`.
6. Each protected action is authorized server-side from those current roles.

There is no email magic-link step and no public signup screen.

## Protected account provisioning

1. An authenticated application admin chooses the Person/Actor context and accepted initial roles.
2. Admin chooses a unique username and initial password.
3. The server provisions the credential Account and links it to exactly one application Actor.
4. Church-domain roles are persisted only in \`app_user_roles\`.
5. Admin communicates the username and initial password to the person outside the application.
6. After sign-in, the account owner may change their own password.

Exact password-generation policy, forced-first-change policy, forgotten-password/reset policy, and credential-delivery procedure are later implementation/operations details unless separately accepted.

## Congregation nickname flow

1. Visitor opens the preference-voting interaction.
2. If no nickname voter context is active, the UI asks only for a nickname.
3. The server creates or reuses the lightweight Actor for that nickname.
4. That Actor has only the \`congregation_member\` role.
5. The visitor may read/change only the accepted own preference votes for that nickname profile.
6. No authenticated Account or protected session is created by this flow.

Exact nickname normalization, collision presentation, and whether the browser remembers the last nickname for convenience are later UI/implementation details. Such convenience state must never become proof of real-world identity.

## Identity boundaries

### Person

\`catalog_persons\` remains the real-world participant/catalog concept. Historical persons may exist without Accounts.

### Account

A protected Account is the login-capable credential/session identity used by admin/priest/organist. It authenticates username + password and owns protected session state.

A congregation nickname profile is **not** an Account.

### Actor

\`app_users\` remains the application Actor used for role assignment and attribution.

- a protected login-capable Account maps to one active Actor;
- a nickname-only congregation voter is represented by a lightweight Actor without an Account.

### Role assignment

\`app_user_roles\` remains the single source of truth for church-domain roles. Multiple roles per protected Actor remain valid.

A newly created nickname voter Actor receives only \`congregation_member\`; that assignment may be system-created as part of the nickname flow and cannot be used to escalate to protected roles.

Priest/organist authorization roles do not silently mutate \`catalog_persons.priest\` or \`catalog_persons.organist\`. Person-catalog eligibility and account authorization remain distinct. Person-bound priest/organist workflows require a suitable linked Person.

## Account and role administration

Protected Account provisioning and privileged role administration are admin-owned.

Admin may later, through accepted administration UI/behavior:

- create protected Accounts for priest/organist/admin access;
- deactivate protected account-linked Actors;
- assign or remove accepted privileged application roles;
- set initial credentials and perform any separately accepted admin password-reset operation.

Normal administration must prevent removing or deactivating the **last active admin**.

There is no public privileged signup, seeded shared production password, or permanent bootstrap bypass. Initial deployment requires an explicit one-off setup that establishes the first admin and provisions the current priest/organist Accounts before production handoff.

Nickname-only congregation Actors are not provisioned by admin; they arise from nickname entry and remain constrained to congregation preference behavior.

## Password ownership

A signed-in protected account owner may change their own password by proving the current password through the authentication layer.

The product does not require the user to change their username. Username administration remains admin-owned unless a later decision changes it.

Forgotten-password recovery is not silently invented by this phase. It requires a later explicit implementation policy.

## Authorization boundary

Protected production authorization is server-authoritative.

For protected state-changing actions the server must:

1. validate the authenticated session;
2. resolve the session to the linked \`app_user\` Actor;
3. require that Actor to be active;
4. load current roles from authoritative \`app_user_roles\` state;
5. enforce the accepted application permission rule for the requested action.

Client-supplied actor IDs, role names, or permission claims are never authorization authority for protected operations.

For nickname-only congregation preference changes, the server accepts only the narrow preference-voting behavior for the nickname profile. Nickname possession is not elevated into protected authentication and cannot authorize planning, repertoire, knowledge, or account administration.

## Development/runtime boundary

\`ORGANY_RUNTIME=memory\` may retain seeded demo Actors and the development \`Change user\` selector for deterministic local/HUMAN acceptance testing.

Database-backed production operation must not expose that selector as protected authentication. Protected production identity comes from authenticated server sessions; congregation voting uses the separate nickname-only flow.

## Explicitly not selected

The first production access slice does not select or require:

- email magic-link sign-in;
- public self-registration for protected roles;
- congregation-member passwords or protected Accounts;
- social OAuth;
- passkeys;
- two-factor authentication;
- multi-congregation identity behavior;
- a hosting provider.

These may be revisited only by a later accepted decision.

## Better Auth implementation caveat

Current Better Auth documentation confirms username + password sign-in, disabling email/password signup, and changing the signed-in user's own password.

Better Auth also currently requires an email field on its auth user record even when username authentication is used. The product **does not** therefore gain an email-login or email-verification requirement. The implementation phase must prove a clean non-user-facing treatment of that library field. If Better Auth would force email into the admin/user workflow in a way that conflicts with this accepted username/password product model, the authentication library choice must be revisited rather than changing the product behavior to fit the library.

## Audit and security boundary

Phase 31.26 defines business audit history for its accepted business domains. This auth decision does not silently redefine that scope.

Whether protected account creation, role administration, password changes/failures, sign-in failures, or nickname-voter changes belong in business audit history, a security log, or both remains a later explicit identity/security decision.

## External technical basis checked 2026-08-12

The corrected direction was checked against current official Better Auth documentation for:

- username-based sign-in over password credentials;
- disabling public email/password signup;
- signed-in user password change;
- PostgreSQL/Drizzle-backed authentication/session direction;
- the current mandatory auth-user email field.

The exact library version is intentionally not frozen by this documentation-only phase and must be pinned and reverified in the implementation PR.
`);

fs.writeFileSync(modelPath, `# Authentication, Account, Actor, and Role Model

## 1. Purpose

This document defines the logical authentication, account, actor, voter-identity, and role model for the app and records the production access direction corrected in Phase 31.27.

The first production model deliberately distinguishes protected staff access from low-friction congregation voting:

- admin, priest, and organist use admin-provisioned username/password Accounts;
- congregation members vote under an unverified nickname and do not receive login-capable Accounts.

Authentication identity remains separate from the application's Person, Actor, and RoleAssignment concepts so that authentication technology does not become the domain model.

## 2. Non-goals

This document does not:

- install or pin an auth package version;
- define physical auth tables, migrations, SQL, API routes, or final UI components;
- define exact password-generation, credential-delivery, forgotten-password, or forced-first-change policy;
- define exact nickname normalization or browser convenience persistence;
- select a hosting provider or production database provider;
- introduce email magic links, public privileged signup, social OAuth, passkeys, or 2FA;
- introduce multi-congregation identity/tenancy behavior;
- equate legacy people records with authenticated users;
- add anti-abuse identity proof for congregation nickname voting;
- define security telemetry or account/role audit persistence.

Those implementation and operations details require later accepted work.

## 3. Accepted access context

The accepted first production-oriented deployment assumption remains a single hosted web app for one congregation.

Protected login-capable access exists for:

- admin;
- priest;
- organist.

Congregation member access exists for own preference voting only, through a nickname-only voter profile rather than a protected Account.

One protected Actor may have multiple accepted application roles. Multi-congregation behavior remains out of scope.

## 4. Core logical concepts

### Person

A Person is a real-world individual or named participant relevant to the congregation, planning process, repertoire, service history, or legacy records.

The current implementation concept is \`catalog_persons\`. A Person may remain meaningful historically even when they have no login Account.

### Account

An Account is a login-capable protected authentication identity.

In the first production model, Accounts are used for admin/priest/organist access and authenticate with username + password. Account creation is admin-owned; there is no public self-registration for protected roles.

A congregation nickname voter has no Account.

### Actor

An Actor is the application identity used for role assignment and attribution. The current implementation concept is \`app_users\`.

Two Actor forms are accepted:

- **protected Actor** — linked to exactly one login-capable Account;
- **nickname voter Actor** — lightweight congregation Actor with no Account, identified only by an unverified nickname for preference voting.

### Role

A Role is a domain-level authorization responsibility. The accepted roles remain:

- priest;
- organist;
- admin;
- congregation member.

### Role assignment

A RoleAssignment connects an Actor to one or more accepted Roles. The current implementation concept is \`app_user_roles\`.

\`app_user_roles\` remains the sole source of truth for church-domain roles. Authentication-library roles must not become a parallel church-domain role source.

Protected privileged role assignments are admin-owned. A newly created nickname voter Actor receives exactly the \`congregation_member\` role from the system as part of the nickname flow; that flow cannot grant protected roles.

### Permission

A Permission is an allowed application action derived from an Actor's accepted current RoleAssignments and the accepted permission model.

Protected permissions are enforced server-side behind authenticated Account sessions. Nickname-only congregation Actors are restricted to the narrow own-preference behavior and cannot cross into protected permissions.

### Historical person reference

A historical Person reference preserves a name or identity needed to understand past services, repertoire, or imported legacy knowledge even when that Person has no active Account or current RoleAssignment.

## 5. Person vs Account vs Actor

These concepts remain distinct:

- a Person may exist without any Account;
- a protected Account maps to one active application Actor;
- a protected Actor may hold multiple Roles;
- a nickname voter Actor has no Account and only the congregation-member role;
- a historical Person may appear in service history or legacy-derived data without being login-capable;
- protected authorization uses the authenticated Account only to resolve the active Actor, then uses current authoritative \`app_user_roles\`;
- nickname voting does not authenticate a real-world Person and must not be promoted to protected Account identity;
- authentication identity must not be inferred from a Person name or legacy record.

The first production slice does not need multiple Accounts for one protected Actor or multiple protected Actors for one Account.

## 6. Role model

The accepted logical roles are:

- **priest** — participates in planning, final-set decisions, completed-service conversion, and own preference voting;
- **organist** — participates in working-set planning, repertoire management, and own preference voting;
- **admin** — manages shared knowledge/configuration and congregation preferences, participates in planning where accepted, and has no own preference vote;
- **congregation member** — enters own preference votes and has no planning permissions.

An authenticated protected Actor may hold multiple roles. Admin does not automatically imply priest or organist permissions.

Priest/organist authorization roles and \`catalog_persons.priest\` / \`catalog_persons.organist\` planning-selector eligibility are intentionally distinct. Assigning an application role does not silently rewrite Person catalog eligibility. Person-bound priest/organist workflows require a suitable linked Person.

## 7. Permission model summary

### Planning permissions

- priest, organist, and admin may create, edit, and delete a working set;
- priest and admin may save or delete a final set;
- priest, admin, or the accepted system process may convert eligible final sets to completed-service records;
- congregation members have no planning permissions.

### Knowledge-management permissions

Admin manages shared knowledge and configuration, including melody equivalence, base song catalog knowledge, Antiphon/Topic mappings where administration exists, and non-repetition configuration.

### Repertoire permissions

Organist and admin may manage repertoire according to accepted repertoire rules. Person linkage remains necessary where repertoire is tied to an organist Person.

### Preference permissions

Priest and organist may manage their authenticated own song preferences according to accepted score ranges. A nickname-only congregation Actor may manage only the own congregation preference profile stored under that nickname. Admin may manage congregation preferences but has no own preference vote.

### Completed-service permissions

Completed-service records are historical records. Manual completion remains priest/admin behavior and automatic completion remains the accepted system behavior from Phase 31.25.

## 8. Protected account provisioning and sign-in

### No public protected signup

There is no production signup flow that allows a visitor to become admin, priest, or organist.

Admin owns protected Account provisioning:

1. admin selects/creates the relevant application Actor/Person linkage;
2. admin chooses the username;
3. admin sets an initial password;
4. admin assigns the accepted church-domain roles in \`app_user_roles\`;
5. credentials are handed to the person outside the application;
6. the person signs in with username + password.

The first production setup must establish the initial admin and provision the current priest/organist protected Accounts before handoff.

When a new priest or organist later arrives, admin repeats this provisioning process. The new person does not self-register.

### Existing protected-account sign-in

An existing protected user enters username + password. Successful authentication creates the protected database-backed session. The server resolves that session to the active Actor and reads current roles from \`app_user_roles\`.

### Password change

A signed-in protected user may change their own password by providing the current password and a new password through the authentication layer.

Username changes are not a user self-service requirement in this phase. Forgotten-password/reset and forced-first-change behavior are later explicit decisions.

## 9. Congregation nickname voting

A congregation member does not create a protected Account and does not receive a password.

When the visitor enters the preference-voting interaction:

1. the UI asks for a nickname when no nickname voter context is active;
2. the server creates or reuses the lightweight Actor for that nickname;
3. that Actor has exactly the \`congregation_member\` role;
4. the visitor may add/change only that nickname profile's own accepted preference votes;
5. no protected authentication session is created.

The nickname model deliberately accepts weak identity:

- no email or identity verification;
- no password;
- no proof that one nickname belongs to one person;
- no prevention of one person using several nicknames;
- reuse of an existing nickname is treated as the same voter profile because the application intentionally has no stronger identity proof.

Exact nickname syntax/normalization and browser remembering of the nickname are implementation/UI details. They must not be mistaken for security boundaries.

## 10. Admin account and role administration

Admin owns protected Account provisioning and privileged role administration.

Normal administration must not be able to remove or deactivate the **last active admin**.

There is no public privileged signup, shared default production password, or permanent bootstrap backdoor. The first admin is established through an explicit one-off production setup procedure; that setup also provisions the current priest/organist protected Accounts before handoff.

Protected Account deactivation causes the linked Actor to fail server authorization even if the browser still holds an otherwise valid session.

Nickname-only congregation Actors are not admin-provisioned Accounts and remain outside protected account administration.

## 11. Legacy people mapping

Legacy \`Kazatele\` and \`Varhanici\` records may inform Person records and historical references but do not automatically create protected Accounts, Actors, or current RoleAssignments.

Historical service/person data remains meaningful without forcing every legacy participant to become login-capable.

## 12. Authorization enforcement

Protected production authorization is derived server-side.

For a protected state-changing action the server must:

1. validate the authenticated Account session;
2. resolve the Account to the linked \`app_users\` Actor;
3. reject missing or inactive Actors;
4. read current authoritative roles from \`app_user_roles\`;
5. enforce the accepted permission rule for the requested action.

Client-supplied Actor IDs, role names, or permission claims are not authorization authority for protected operations.

Nickname-only congregation preference operations use a separate narrow boundary: the nickname profile can affect only its own accepted congregation preference votes. Nickname identity cannot authorize planning, repertoire, shared knowledge, privileged role changes, or protected Account administration.

UI hiding remains convenience only for protected permissions. Server-side mutation boundaries perform their own authorization checks.

## 13. Attribution, audit, and security boundary

Phase 31.26 resolved business audit/change-history policy for its accepted business domains. This model preserves stable protected Actor identity for privileged attribution and a deliberately weak nickname Actor identity for congregation votes.

Phase 31.27 does not silently widen business-audit scope. Account provisioning, password administration, RoleAssignment changes, failed sign-ins, and nickname-voter changes remain later audit/security-policy questions unless already covered by accepted business audit behavior.

## 14. Development and production runtime boundary

Development/test memory runtime may keep seeded fake Actors and the \`Change user\` selector for deterministic local and HUMAN acceptance testing.

Production/database-backed operation must not treat that selector as protected authentication.

Protected production Actor identity comes from authenticated username/password sessions. Congregation preference identity comes from the separate nickname-only flow.

## 15. Better Auth technical boundary

Better Auth remains the selected implementation candidate because current official documentation supports username-based password sign-in, public signup disabling, password change, and database-backed operation.

Current Better Auth documentation also requires an email field on the auth user record. This is an implementation compatibility concern only. It does **not** change the accepted product behavior into email login, email verification, or magic links. The implementation phase must prove a clean non-user-facing handling of that field; otherwise the auth-library choice is revisited.

## 16. Resolved and remaining questions

Resolved by corrected Phase 31.27:

- protected user experience — username + password;
- protected signup model — none; admin provisions accounts;
- initial access — admin/current priest/current organist Accounts exist before production handoff;
- own password change — allowed for signed-in protected users;
- congregation-member access — nickname-only voter profile, no protected Account or password;
- nickname abuse prevention — intentionally not attempted;
- domain-role authority — \`app_user_roles\`, not the auth library;
- production protected authorization source — server session → active Actor → current RoleAssignments;
- first-admin safety — explicit bootstrap plus last-active-admin protection;
- historical people without Accounts remain valid.

Still deferred:

- exact Better Auth package version and proof/handling of its mandatory internal email field;
- physical auth schema/migration;
- exact login/account-admin UI;
- initial password generation/delivery, forgotten-password/reset, and forced-first-change policy;
- nickname normalization and convenience persistence;
- production hosting/secrets/backup design;
- identity/security audit and telemetry policy;
- any future OAuth, passkey, 2FA, or multi-congregation expansion.

## 17. What this enables next

The next auth implementation phase can design and implement a bounded slice around:

- username/password authentication package/configuration and PostgreSQL/Drizzle auth persistence;
- protected Account ↔ \`app_users\` linkage;
- first-admin and initial priest/organist provisioning;
- admin protected-account creation for later priest/organist access;
- protected username/password login and own-password-change UI;
- server-side Actor resolution/authorization;
- nickname-only congregation voter creation/reuse and own preference boundary;
- removing \`Change user\` as production protected authentication while preserving memory test mode;
- tests for no public privileged signup, inactive Actors, current roles, last-admin protection, password change, and nickname-only permission isolation.

That implementation still requires its own Contract Gate and exact-head acceptance before merge.
`);

replaceExact(
  "docs/architecture.md",
  "- Phase 31.27 selects the production authentication/session direction as Better Auth with PostgreSQL/Drizzle-backed sessions and invitation-only email magic links. Physical auth schema, account/invitation UI, email transport, deployment secrets, and security operations remain later implementation concerns.",
  "- Phase 31.27 selects two production access levels: protected admin/priest/organist Accounts use admin-provisioned username/password authentication with PostgreSQL/Drizzle-backed sessions and no public privileged signup; congregation members use nickname-only preference-voter Actors with no login Account or password. Physical auth schema, login/account-admin UI, password-recovery mechanics, nickname UI details, deployment secrets, and security operations remain later implementation concerns."
);

replaceExact(
  "docs/implementation-preparation.md",
  "- **Authorization design follows the accepted production auth/account/role model.** Production authentication resolves through Better Auth Account/session identity to an active `app_user` Actor, while current church-domain permissions remain authoritative in `app_user_roles` according to Phase 31.27.",
  "- **Authorization design follows the accepted production auth/account/role model.** Protected admin/priest/organist access resolves through username/password Account sessions to an active `app_user` Actor, while current church-domain permissions remain authoritative in `app_user_roles`. Congregation voting uses a nickname-only `congregation_member` Actor with no protected Account and cannot authorize protected behavior."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- **First-slice implementation must not exclude congregation-member access.** Preference voting may be outside the first slice, but the first-slice design must leave room for direct congregation member access for own preference votes without granting planning permissions.",
  "- **First-slice implementation must not exclude congregation-member access.** Preference voting may be outside the first slice, but the design must leave room for nickname-only congregation-member own preference voting with no password Account and no planning permissions."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- **Authentication infrastructure.** Phase 31.27 selects Better Auth with the existing PostgreSQL/Drizzle direction, database-backed sessions, invitation-only passwordless email magic links, and server-authoritative Account → active Actor → current `app_user_roles` authorization. Package installation/version, physical auth schema/migration, invitation/login/account-admin UI, email delivery, bootstrap implementation, deployment secrets, and production cutover are not implemented yet.",
  "- **Authentication infrastructure.** Phase 31.27 selects admin-provisioned username/password protected Accounts for admin/priest/organist, PostgreSQL/Drizzle-backed sessions, no public privileged signup, and server-authoritative Account → active Actor → current `app_user_roles` authorization. Congregation preference voting is nickname-only with no protected Account/password. Package installation/version, physical auth schema/migration, login/account-admin UI, bootstrap implementation, password-recovery mechanics, nickname UI details, deployment secrets, and production cutover are not implemented yet. Better Auth remains the selected candidate only if its mandatory internal email field can stay out of the required user-facing flow."
);
replaceExact(
  "docs/implementation-preparation.md",
  "3. **Authentication/authorization implementation.** Phase 31.27 resolves the approach: Better Auth, PostgreSQL/Drizzle-backed database sessions, invitation-only passwordless email magic links, `app_users` as Actor, and `app_user_roles` as sole church-domain role authority. Later implementation must pin packages, add auth/invitation persistence, choose email transport, implement bootstrap/login/admin UI, and replace client-selected production identity with server session-derived Actor resolution.",
  "3. **Authentication/authorization implementation.** Phase 31.27 resolves the product approach: admin-provisioned username/password protected Accounts for admin/priest/organist, no public privileged signup, protected database sessions resolving to `app_users`, `app_user_roles` as sole church-domain role authority, and nickname-only congregation voters with no protected Account. Later implementation must pin/prove the auth package, add auth persistence, implement bootstrap/login/account-admin/password-change UI, implement nickname voter persistence, and replace client-selected protected production identity with server session-derived Actor resolution."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- [x] Production authentication/authorization direction selected in Phase 31.27: Better Auth + PostgreSQL/Drizzle DB sessions + invitation-only email magic links + server-side Actor/current-role authorization.",
  "- [x] Production access direction selected in Phase 31.27: admin-provisioned username/password protected Accounts for admin/priest/organist + PostgreSQL/Drizzle DB sessions + no public privileged signup + server-side Actor/current-role authorization; congregation voting is nickname-only with no protected Account."
);
replaceExact(
  "docs/implementation-preparation.md",
  "- [ ] Production auth implementation completed: package/config pin, auth/invitation schema+migration, bootstrap, email transport, login/admin UI, session-derived Actor integration, and cutover tests.",
  "- [ ] Production auth implementation completed: package/config pin and Better Auth compatibility proof, auth schema+migration, bootstrap and initial staff provisioning, login/account-admin/own-password-change UI, session-derived Actor integration, nickname-only voter flow, and cutover tests."
);

replaceExact(
  "docs/roadmap.md",
  "- Production authentication direction is resolved in Phase 31.27: Better Auth, PostgreSQL/Drizzle-backed database sessions, invitation-only passwordless email magic links, and server-side authorization through the existing Actor/RoleAssignment model; implementation mechanics remain later work.",
  "- Production access direction is resolved in Phase 31.27: admin-provisioned username/password protected Accounts for admin/priest/organist, no public privileged signup, PostgreSQL/Drizzle-backed sessions and server-side authorization through the existing Actor/RoleAssignment model; congregation preference voting is nickname-only with no protected Account/password. Implementation mechanics remain later work."
);
replaceExact(
  "docs/roadmap.md",
  "- Authentication/account implementation mechanics (auth package installation/version, physical auth schema, invitations/login UI, email transport and secrets), deployment, operations, backups, or observability; the production auth direction is resolved in Phase 31.27.",
  "- Authentication/account implementation mechanics (auth package installation/version and Better Auth compatibility proof, physical auth schema, protected login/account-admin/password-change UI, nickname-voter UI/persistence, secrets), deployment, operations, backups, or observability; the production access direction is resolved in Phase 31.27."
);

for (const path of ["docs/architecture.md", "docs/implementation-preparation.md", "docs/roadmap.md"]) {
  const text = fs.readFileSync(path, "utf8");
  if (/magic[- ]link|invitation-only passwordless|invitation-only email/i.test(text)) {
    throw new Error(`${path}: stale magic-link/invitation direction remains`);
  }
}

console.log("Phase 31.27 corrected policy rewrite PASS");
