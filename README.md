# organy-app

Administration and communication of the musical part of church masses SCEAV.

## Local Development

This repository contains a minimal Next.js App Router scaffold for the Organ Planner local development baseline, including the current in-memory Planning Lifecycle flow. The runtime is intentionally **local in-memory only**: planned data is not durable yet and can be lost after refresh, browser/session restart, or app restart.

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

The application runtime remains intentionally **local in-memory only**. The database setup below prepares the Drizzle migration foundation for future persistence work; it does not wire the UI or application runtime to PostgreSQL yet.

Recommended local database: PostgreSQL. A local database named `organy_app` with the default development credentials below is sufficient for migration generation and later local migration testing:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/organy_app
```

Install dependencies from the committed lockfile before running Drizzle tooling:

```bash
npm install
```

Generate Drizzle migration artifacts from the schema with:

```bash
npm run db:generate
```

`npm run db:generate` reads `drizzle.config.ts`, uses `src/db/schema/index.ts` as the schema source, and writes migration artifacts under `drizzle/`. After generation, the expected versioned outputs are:

- SQL migration files such as `drizzle/0000_gigantic_wild_child.sql`.
- Drizzle metadata snapshots under `drizzle/meta/`, including `_journal.json` and numbered snapshot files.

The initial schema covers only the minimal Planning Lifecycle persistence subset. Database constraints provide basic consistency checks for persisted rows, but they do not replace domain or application validation. Repository adapters may remain unused until a later phase deliberately switches runtime persistence from in-memory storage to the database.

Application-level Planning Lifecycle services and repository ports live under `src/application/planning-lifecycle`. They define dependency-free TypeScript use cases for saving working sets, finalizing them, deleting working or final sets, reordering working rows, and completing final sets without wiring any database runtime. The ready application implementation remains the in-memory repository; the Drizzle `PlanningSetRepository` adapter now performs real database create, read, update, and delete operations for planning sets, but the UI is intentionally not switched to DB runtime yet.

### Local Drizzle Planning Set Adapter Verification

The adapter expects a Drizzle database object supplied by the caller and does not create a runtime connection for the web app. Start PostgreSQL, set `DATABASE_URL`, apply the committed SQL migrations in `drizzle/`, then run the repository smoke check with `npm run db:smoke` or the end-to-end lifecycle smoke check with:

```bash
npm run db:lifecycle-smoke
```

The lifecycle smoke check saves a working set, finalizes it, completes the final set, verifies cleanup state, and exits with a readable error if `DATABASE_URL` or the migrated database is unavailable. A minimal direct repository flow is:

```ts
const created = await repository.saveWorkingSet({
  status: "working",
  language: "mixed",
  rows: [
    { song: { language: "czech", number: "101" }, note: "Entrance" },
    { note: "Psalm placeholder" },
  ],
});

const loaded = await repository.findById(created.id);

const updated = await repository.saveWorkingSet(
  {
    status: "working",
    language: "czech",
    rows: [{ song: { language: "czech", number: "202" }, note: "Updated entrance" }],
  },
  created.id,
);

await repository.deleteById(updated.id);
const deleted = await repository.findById(updated.id);
```

Expected result: `created.id` is a numeric database-backed planning set id, `loaded` matches the inserted working set, `updated` reflects the replacement rows and language, and `deleted` is `undefined`. The rows are persisted in `service_set_rows`, the set status and context reference in `service_sets`, and the planning-set service language in `service_contexts`.

The development server starts the Organ Planner / Planning Lifecycle First page with an in-memory working service set flow.

The page includes a local role selector for `priest`, `organist`, `admin`, and `congregationMember` so the first in-memory version can exercise the permission matrix without authentication. This selector is a development-only mechanism and is not a session, account model, auth provider, or durable role source.


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
