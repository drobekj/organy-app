# AGENTS.md

## Purpose
Guidance for Codex and other AI assistants collaborating in this repository.

## Scope
- Keep this file focused on repository collaboration rules, working expectations, and review guidance for AI-assisted changes.
- Do not use this file for product requirements, architecture decisions, roadmap planning, domain modeling, or implementation design.
- Refer to `README.md` for the documentation map and to files in `docs/` for project context.

## Working Principles
- Prefer small, reviewable changes with clear rationale.
- Preserve existing behavior unless the requested change explicitly requires otherwise.
- Ask for clarification when requirements are ambiguous, risky, or likely to affect product direction.
- Avoid adding application code, dependencies, or tooling unless explicitly requested.
- Keep documentation changes aligned with the responsibility of the target document.

## Documentation Boundaries
- Update `README.md` when the repository overview or documentation map changes.
- Update files in `docs/` when their specific planning, product, technical, or workflow responsibility changes.
- Keep `AGENTS.md` limited to collaboration guidance for Codex; move project intent, requirements, architecture, and planning content to the appropriate documentation file.

## Testing and Verification
- Run relevant checks when project tooling exists.
- For documentation-only changes, verify formatting and review the changed files for clarity and consistency.
- Note any checks that could not be run because tooling has not been selected yet.

## Pull Request Guidance
- Summarize the purpose of the change and the documents updated.
- Include related decisions, requirements, or backlog references when applicable.
- Call out whether the change is documentation-only or includes implementation work.
