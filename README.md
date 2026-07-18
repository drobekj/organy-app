# organy-app

Administration and communication of the musical part of church masses SCEAV.

## Local Development

This repository contains a minimal Next.js App Router scaffold for the Organ Planner local development baseline, including a single mounted workspace shell for Planning, Plans, History, Catalog, and Development. The default runtime is intentionally **local in-memory only**: planned data is not durable yet and can be lost after refresh, browser/session restart, or app restart.

### Setup

```bash
git clone <repository-url>
cd organy-app
npm install
npm run dev
```

Open the local Next.js development server at <http://localhost:3000>. If port `3000` is already in use, use the localhost URL printed by `npm run dev`.

Use the explicit TypeScript check before review when dependencies are installed:

```bash
npm run typecheck
```

`package-lock.json` is expected to be committed with dependency changes so a fresh checkout can install the same dependency graph. TypeScript is an explicit `devDependency`; `npm run typecheck` uses `tsc --noEmit` rather than relying on an implicit Next.js install.


## Local Database Setup

The default application runtime remains intentionally **local in-memory only**. A plain `npm run dev` does not use PostgreSQL. Use the steps below only when you want the DB-backed Planning Lifecycle workspace.

### Reproducible DB-backed local workflow

1. Install dependencies from the committed lockfile:

   ```bash
   npm install
   ```

2. Start the local PostgreSQL container:

   ```bash
   npm run db:start
   ```

   This uses `docker-compose.yml` to run one local PostgreSQL service with database `organy_app`, development-only credentials `organy_app` / `organy_app`, port `5432`, and a persistent Docker volume.

3. Apply the committed Drizzle migrations:

   ```bash
   DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app npm run db:migrate
   ```

   `npm run db:migrate` uses `DATABASE_URL` and applies the versioned SQL migrations already committed under `drizzle/`. It does not generate new migration files. Use `npm run db:generate` only when intentionally creating a new schema migration from `src/db/schema/index.ts`.

4. Run the DB-backed Planning Lifecycle smoke test:

   ```bash
   DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app npm run db:lifecycle-smoke
   ```

   The lifecycle smoke check saves two working sets, lists and loads saved sets, updates one set, finalizes and completes it, verifies the second set remains available, and cleans up its test records. It exits with readable errors when `DATABASE_URL` is missing, PostgreSQL is unavailable, or the committed migrations have not been applied.

5. Start the application in DB runtime mode:

   ```bash
   ORGANY_RUNTIME=db DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app npm run dev
   ```

   Open the local Next.js development server at <http://localhost:3000>, or use the localhost URL printed by `npm run dev` if port `3000` is already in use.

For shell-based setup, copy `.env.example` to a local `.env` if useful, but keep real secrets out of committed files. The example file contains only local development placeholders:

```bash
ORGANY_RUNTIME=db
DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app
```

### DB runtime behavior

When `ORGANY_RUNTIME=db` is set, Planning Lifecycle actions are routed through the DB-backed service. The application shell separates the editor from Plans, History, Catalog, and Development workspaces while keeping the same client-side controller mounted so local state is not reset merely by changing workspaces. Use **Start new set** in Plans to detach from the opened DB set without deleting it, then open any saved working, final, or completed record to reload its service date, service language, priest, organist, and rows in Planning. Saved DB records remain available after browser refreshes and dev-server restarts as long as the same migrated database is used.

Readable DB setup errors are intentionally surfaced for the local workflow:

- Missing `DATABASE_URL`: set `DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app` before running DB scripts or DB runtime.
- Unavailable PostgreSQL: start the container with `npm run db:start` and verify Docker exposes port `5432`.
- Unapplied migrations: run `DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app npm run db:migrate` before smoke tests or DB runtime.

The development server starts the Organ Planner / Planning Lifecycle First page with an in-memory working service set flow unless `ORGANY_RUNTIME=db` is explicitly set.

The Development workspace includes a local role selector for `priest`, `organist`, `admin`, and `congregationMember` so the local version can exercise the permission matrix without authentication. The selected role is also shown compactly in the application header. This selector is a development-only mechanism and is not a session, account model, auth provider, or durable role source.

### Local Drizzle Planning Set Adapter Verification

For a smaller direct repository check after migrations are applied, run:

```bash
DATABASE_URL=postgres://organy_app:organy_app@localhost:5432/organy_app npm run db:smoke
```

Expected result: the smoke checks create numeric database-backed planning set ids, verify saved sets can be listed and loaded, update persisted rows and language, and delete their test data. Rows are persisted in `service_set_rows`, the set status and context reference in `service_sets`, and the planning-set service date, service language, priest, and organist display data in `service_contexts`.


## First Local Release Acceptance Checklist

Use this checklist for the first locally usable in-memory Planning Lifecycle First release:

- [ ] App starts locally.
- [ ] Working set can be created and saved.
- [ ] Final set can be created.
- [ ] Completed service record can be created.
- [ ] Delete works for a saved non-completed set.
- [ ] `congregationMember` cannot perform planning actions.
- [ ] Data is not durable across refresh/session restart.


## Manual Local Acceptance Report

Manual acceptance report for the current Planning Lifecycle First in-memory release:

| Check | Result | Notes |
| --- | --- | --- |
| `npm install` / `npm run dev` status | Not verified | Not rerun for this documentation-only report to avoid changing dependency or lockfile state. |
| App starts locally | Not verified | Local browser startup was not rechecked in this change. |
| Save working set | Not verified | Manual browser flow was not rechecked in this change. |
| Finalize set | Not verified | Manual browser flow was not rechecked in this change. |
| Complete service | Not verified | Manual browser flow was not rechecked in this change. |
| Delete saved non-completed set | Not verified | Manual browser flow was not rechecked in this change. |
| `congregationMember` permission denial | Not verified | Manual role-based denial flow was not rechecked in this change. |
| Data lost after refresh/session restart | Not verified | Persistence loss after refresh or session restart was not rechecked in this change. |

DB persistence remains blocked by the current npm registry, lockfile, and migration state; this release report covers only the in-memory path and does not add application code or change runtime behavior.

## Known Limitations

- No durable DB persistence.
- No auth/session/account model.
- No candidate selection.
- No melody rules.
- No antiphon/season highlighting.
- No preference system.

## Manual Smoke-Test Checklist

Use this short checklist to smoke-test the current local in-memory Planning Lifecycle version after starting the app with `npm run dev`:

- [ ] App loads at <http://localhost:3000> or the localhost URL printed by Next.js.
- [ ] Role selection is visible for the development roles.
- [ ] The working draft area is visible for the service being planned.
- [ ] Basic lifecycle buttons respond in the browser flow, including saving a working draft, finalizing a saved set, completing a finalized set, and deleting a saved non-completed set.

Known limitations and observed issues for this in-memory baseline:

- No durable persistence yet; data can be lost after refresh, browser/session restart, or app restart.
- Delete does not clear the protocol/log.
- Set numbering may keep increasing after delete.
- Saving without service context is currently possible.
- Only one set can be inserted.
- Role-specific button enablement still needs tightening.

## Phase 13 Closure

Phase 13 — Local development baseline stabilization should be closed after this local setup, dependency baseline, and smoke-test documentation change is merged.

## Phase 21 Closure

Phase 21 — Reproducible Local DB Release Setup should be closed after this reproducible local PostgreSQL setup, committed migration command, DB smoke workflow, and README update are merged.

## Project Documentation

This repository is prepared for long-term AI-assisted software development. The documentation files below each have a distinct responsibility so that analytical discoveries, product intent, domain understanding, technical direction, planning, and collaboration rules stay easy to find as the project evolves.

## Documentation Flow

Use the core documentation in this order so that each level of detail is grounded in the previous one:

```text
Conversation / Analytical Discussion
↓
Analysis Log
↓
Product Vision
↓
Domain Analysis
↓
Requirements
↓
Architecture
↓
Implementation
```

- Analytical discussions produce discoveries, assumptions, open questions, and reasoning.
- Analysis Log preserves those discoveries chronologically before they are refined into stable documents.
- Product Vision explains why the product should exist and what outcomes it should support.
- Domain Analysis explores the real-world domain, language, stakeholders, processes, decisions, rules, constraints, and open questions before solution details are chosen.
- Requirements translate validated product and domain understanding into expected system behavior and quality expectations.
- Architecture records technical structure and rationale for satisfying the requirements.
- Implementation work should be selected from the backlog only after the relevant product, domain, requirements, and architecture context is clear enough for reviewable changes.

## Documentation Map

- `AGENTS.md` — collaboration and working rules for Codex and other AI assistants. Keep repository workflow guidance here, not product, domain, requirements, architecture, or implementation decisions.
- `docs/analysis-log.md` — chronological analytical discoveries captured after analytical discussion before they are refined into product vision, domain analysis, requirements, architecture, or implementation work. Treat this log as append-only in spirit: add new analytical sessions chronologically and only rewrite existing entries to correct clear errors.
- `docs/product-vision.md` — product intent and direction, including goals, target users, value proposition, scope boundaries, assumptions, and open product questions.
- `docs/domain-analysis.md` — exploratory domain understanding, including terminology, stakeholders, roles, domain knowledge, business processes, decision making, business rules, constraints, and open questions before requirements or architecture are finalized.
- `docs/requirements.md` — functional and non-functional requirements, acceptance criteria, constraints, and traceability once requirements are known.
- `docs/architecture.md` — technical structure and rationale, including system context, components, technology choices, integration boundaries, data flow, operations, and known legacy constraints.
- `docs/domain-model.md` — shared domain language, key concepts, relationships, business rules, states, and events without committing to a database design too early. Use this when domain analysis has matured into a more structured conceptual model.
- `docs/workflows.md` — user, administrative, system, and development workflows described at the process level.
- `docs/decisions.md` — decision records for product and technical choices, including context, options considered, outcomes, and consequences.
- `docs/roadmap.md` — high-level planning themes, milestones, dependencies, sequencing, and changes to product direction over time.
- `docs/backlog.md` — candidate work items, prioritization notes, readiness criteria, technical debt, and parked ideas.

These documents are intentionally templates or evolving analytical records. Add project-specific content as decisions are made and requirements become clear. Do not add detailed product requirements, architecture, implementation tasks, or database design until those topics are ready for deliberate discussion.

- `docs/phase-30-1-interaction-data-contract.md` — Phase 30.1 interaction/data-contract foundation, synthetic data boundary, rollback, and final checkpoint.
