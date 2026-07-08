# Authentication, Account, Actor, and Role Model

## 1. Purpose

This document defines the logical authentication, account, actor, and role model for the future app. It connects the accepted single-congregation deployment assumption with the accepted roles and permissions without selecting any authentication provider, login method, account technology, storage technology, database schema, or implementation approach.

The model is intended to guide later ADRs and technical design so that authentication, authorization, account storage, legacy people mapping, and preference behavior remain aligned with the accepted domain model.

## 2. Non-goals

This document does not:

- choose an authentication provider, login method, account framework, or account recovery mechanism;
- select Auth.js, NextAuth, OAuth, password login, magic links, email login, or any other concrete authentication technology;
- select a hosting provider or storage technology;
- define physical database tables, migrations, Prisma schema, SQL, API endpoints, UI components, application code, or tests;
- create or accept an authentication ADR;
- mark any existing ADR as accepted;
- introduce multi-congregation support;
- equate legacy people records with authenticated users.

## 3. Accepted deployment and role context

The accepted first production-oriented deployment assumption is a single hosted web app for one congregation. The app must support direct access for the following roles:

- priest;
- organist;
- admin;
- congregation member / sborovník.

Congregation member access is needed so members can enter their own preference votes. This access does not imply planning permissions. A real person can hold multiple roles, and multi-congregation support remains out of scope.

Authentication provider, account technology, storage, account creation flow, and role assignment ownership remain unresolved.

## 4. Core logical concepts

### Person

A person is a real-world individual or named participant relevant to the congregation, planning process, preferences, repertoire, service history, or legacy records.

A person may be active, inactive, historical, login-capable, or not login-capable depending on later design decisions. The logical concept of person should not be reduced to an authentication account.

### Account

An account is a login-capable identity if the later authentication design requires one. It represents a way to authenticate access to the app, not necessarily the full real-world person.

One person may have one account, multiple accounts, or no login account depending on the future account model and authentication provider decision.

### Actor

An actor is the identity used when enforcing permissions and attributing actions. In many future designs an actor may correspond to a logged-in account connected to a person, but this document does not require that implementation.

The authorization model should reason about what the actor is allowed to do at the moment of a state-changing action.

### Role

A role is a domain-level responsibility or access category used for authorization. The accepted roles are priest, organist, admin, and congregation member.

Roles are logical authorization concepts and are not tied to a specific authentication provider or storage representation.

### Role assignment

A role assignment links an actor, person, or account-related identity to one or more roles, depending on later design. One actor may hold multiple roles.

Whether role assignments are time-versioned, who may assign them, and how role changes affect existing records remain open questions.

### Permission

A permission is an allowed action or behavior derived from the actor's assigned role or roles. Permissions should be enforced by application/domain behavior, not only by user interface visibility.

### Historical person reference

A historical person reference is a preserved name or reference needed to understand past services, repertoire, or imported legacy knowledge even when the person has no active account or no longer holds a role.

Historical references allow service history and legacy-derived records to remain meaningful without treating every named legacy participant as an authenticated user.

## 5. Person vs account vs actor

A person is a real-world individual or named participant. An account is a login-capable identity, if the future authentication design requires login accounts. An actor is the identity used when enforcing permissions and attributing actions.

These concepts should remain distinct:

- one person may have one account, multiple accounts, or no login account depending on later design;
- one account may be associated with a person if the chosen authentication and account model supports that relationship;
- one actor may hold multiple roles;
- a historical person may appear in service history or legacy-derived data without having a current login account;
- authorization should use the actor and current role assignments, not assumptions based only on a person's name or legacy record.

## 6. Role model

The accepted logical roles are:

- **priest** — participates in planning, final-set decisions, completed-service conversion, and own preference voting;
- **organist** — participates in working-set planning, repertoire management, and own preference voting;
- **admin** — manages knowledge/configuration, may manage congregation preferences, participates in planning where accepted, and has no own preference vote;
- **congregation member** — enters own preference votes and has no planning permissions.

A real person may hold multiple roles. For example, a person may be both organist and admin, or priest and admin, if later role assignment decisions allow that combination. The admin role does not automatically imply priest or organist responsibilities.

Role changes over time remain an open question. Later design should decide whether role assignments are current-only, time-versioned, or otherwise preserved for audit and historical interpretation.

## 7. Permission model summary

### Planning permissions

For service-set planning:

- priest, organist, and admin may create, edit, and delete a working set;
- priest and admin may save or delete a final set;
- priest, admin, or a later system process may convert a final set to a completed-service record;
- congregation members have no planning permissions.

### Knowledge-management permissions

Admin manages shared knowledge and configuration. Admin-only knowledge includes:

- melody equivalence;
- base song catalog;
- antiphon mappings;
- liturgical-season mappings;
- non-repetition period.

### Repertoire permissions

Organist and admin may manage repertoire. Later design should clarify whether an organist manages only their own repertoire or whether additional delegated repertoire administration is needed.

### Preference permissions

Priest, organist, and congregation member may manage their own song preferences. Admin may manage congregation preferences, but admin has no own preference vote.

Preference permissions apply to concrete songs according to the accepted preference model. Congregation member preference entry must not grant planning, repertoire, or shared-knowledge administration rights.

### Completed-service permissions

Completed-service records are historical records. Converting a final set to a completed-service record is allowed for priest, admin, or a later system process. Direct editing, correction, or audit behavior for completed-service records remains a later design question unless already covered by accepted lifecycle behavior.

## 8. Congregation member access

Congregation member / sborovník access is needed for entering own preference votes. This direct access is part of the accepted single hosted one-congregation deployment assumption.

Congregation member access is limited by default:

- congregation members have no planning permissions;
- congregation members do not manage repertoire;
- congregation members do not manage shared knowledge or configuration;
- congregation members manage only their own song preferences unless a later accepted decision expands capabilities.

Future capabilities for congregation members require later accepted decisions and should not be inferred from the existence of direct app access.

## 9. Admin role

The admin role manages shared knowledge and configuration. Admin-only responsibilities include melody equivalence, base song catalog, antiphon mappings, liturgical-season mappings, and the non-repetition period.

Admin may manage congregation preferences. Admin has no own preference vote in the accepted preference model.

The admin role does not automatically mean the person is a priest or organist. If an admin also needs priest or organist permissions, that should be represented through multiple role assignments rather than by expanding the meaning of admin.

## 10. Legacy people mapping

The legacy SQL Server database contains `Kazatele` and `Varhanici`. These records may inform future priest/preacher references and organist references, but they must not be assumed to equal authenticated users.

Legacy people records can be useful as source knowledge for:

- named participants in historical services;
- possible future person records;
- possible role assignment candidates;
- repertoire or planning context.

However, a legacy `Kazatele` or `Varhanici` record does not automatically create a login account, authenticated actor, or active role assignment. Historical service records may need preserved historical names or references even when no active account exists.

## 11. Authorization enforcement

UI hiding is not sufficient authorization enforcement. The application and domain behavior must enforce permissions for state-changing actions.

Every state-changing action should be checked against the actor's roles and the accepted permission model. Future API routes, server actions, command handlers, or equivalent server-side behaviors must not trust UI-only constraints.

Authorization checks should be designed so that role combinations are handled explicitly and predictably. A person or actor with multiple roles should receive the union of allowed permissions only where those permissions are accepted for the assigned roles.

## 12. Attribution and audit readiness

Future design should be able to attribute important changes to an actor where needed. This is especially relevant for planning lifecycle transitions, knowledge changes, repertoire changes, preference administration, and completed-service conversion.

Exact audit and change-history requirements remain open. This logical model only requires that later design not prevent attribution to an actor when attribution is needed.

## 13. First-slice implications

Planning Lifecycle First needs enough actor and role representation to enforce working-set, final-set, and completed-service permissions.

Preference voting may not be implemented in the first slice, but the authentication and role model must not exclude congregation members. The future model must leave room for congregation members to access the app directly for own preference votes.

Development and demo mode may use seeded or fake actors, but production-oriented design must support real role-bearing actors for priest, organist, admin, and congregation member access.

## 14. Open questions

- What is the account creation and invitation flow?
- Do congregation members self-register, or are they created by admin?
- Which login method or provider will be used?
- How does account recovery work?
- Who owns role assignment and role removal?
- Are role assignments time-versioned?
- What audit and change-history behavior is expected?
- Do historical people without accounts remain separately stored?

## 15. What this enables for later ADR/design

This logical model enables later work on:

- auth provider comparison;
- account schema design;
- authorization test strategy;
- mapping from legacy `Kazatele` and `Varhanici` records;
- storage and schema design for people, accounts, roles, and preferences.

Later ADRs and designs should use this document as a boundary: they may choose concrete technologies and storage structures only when those decisions are explicitly in scope, and they should preserve the distinction between person, account, actor, role assignment, and historical person reference.
