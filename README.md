# organy-app

Administration and communication of the musical part of church masses SCEAV.

## Local Development

This repository contains a minimal Next.js App Router scaffold for the Organ Planner Phase 2 baseline.

```bash
npm install
npm run dev
```

The development server starts the placeholder Organ Planner / Planning Lifecycle First page.

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
