import fs from "node:fs";

function replaceExact(path, from, to) {
  const before = fs.readFileSync(path, "utf8");
  if (!before.includes(from)) throw new Error(`Expected text not found in ${path}`);
  const after = before.replace(from, to);
  if (after === before) throw new Error(`No change made in ${path}`);
  fs.writeFileSync(path, after);
}

replaceExact(
  "docs/architecture.md",
  "It defines logical modules, responsibilities, boundaries, and data flow only. It does not choose technologies, design a database schema, define frontend components, create implementation tasks, or replace the accepted product, domain, decision, requirement, and workflow documents.",
  "It defines logical modules, responsibilities, boundaries, and data flow. Concrete technology directions are selected only by explicit accepted decision/implementation documents and may then be reflected here; this architecture does not independently invent technology choices, design a database schema, define frontend components, create implementation tasks, or replace the accepted product, domain, decision, requirement, and workflow documents."
);
replaceExact(
  "docs/architecture.md",
  "## Technology Choices\n\nNo languages, frameworks, storage systems, infrastructure services, or deployment platforms are selected in this document.\n\nTechnology choices should be made later only when they can be traced to accepted requirements, decisions, constraints, and implementation goals.",
  "## Technology Choices\n\nTechnology directions are accepted only through explicit traced decisions/phases rather than being invented by this conceptual architecture. Current accepted directions reflected here include the existing Next.js/TypeScript application scaffold, PostgreSQL/Drizzle persistence direction, and Phase 31.27 Better Auth production authentication/session direction.\n\nExact package versions, production providers, hosting, physical auth schema, email delivery, deployment secrets, and other implementation/operations details remain governed by their own later Contract Gates and accepted decisions."
);
replaceExact(
  "docs/implementation-preparation.md",
  "Technical architecture remains unchecked for runtime persistence; physical schema files, migrations, database provider, hosting, auth, local database setup workflow, backup/export/restore design, seed strategy, and test strategy remain unresolved until later ADR/design work is complete.",
  "This readiness text predates substantial runtime persistence implementation; remaining production-readiness concerns include production database/provider and hosting choices, production auth implementation beyond the Phase 31.27 accepted direction, local/production operations, backup/export/restore design, seed policy, and broader test/operations strategy."
);

console.log("Phase 31.27 documentation fixup applied.");
