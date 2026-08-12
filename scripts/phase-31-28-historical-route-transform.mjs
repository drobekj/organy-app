import fs from "node:fs";

function replaceExactly(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one target, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

function addImport(path, anchor) {
  replaceExactly(
    path,
    anchor,
    `${anchor}\nimport { useLocalActorSimulatorForAcceptance } from "../src/application/protected-actor";`,
  );
}

// 31.5: candidate reads historically omitted actor. Give those reads a fixed priest acceptance actor,
// while retaining explicit malformed-actor assertions for every supplied malformed envelope.
addImport("scripts/verify-phase-31-5.ts", `import { ReferencePreferenceRequestTracker } from "../src/application/reference-preference-request-tracker";`);
replaceExactly(
  "scripts/verify-phase-31-5.ts",
  `    process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n    const priest = { userId: "demo-priest-user", role: "priest" };`,
  `    process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n    useLocalActorSimulatorForAcceptance({ userId: "demo-priest-user", role: "priest" });\n    const priest = { userId: "demo-priest-user", role: "priest" };`,
);
replaceExactly(
  "scripts/verify-phase-31-5.ts",
  `    for (const actor of [undefined, null, {}, { userId: "" }, { userId: "demo-priest-user", role: "bogus" }]) { const result = await invoke("getReferenceOwnPreference", { referenceSongId: "czech:1" }, actor); assert.equal(result.status, 400); assert.equal(result.body.error.code, "invalidInput"); }`,
  `    for (const actor of [null, {}, { userId: "" }, { userId: "demo-priest-user", role: "bogus" }]) { const result = await invoke("getReferenceOwnPreference", { referenceSongId: "czech:1" }, actor); assert.equal(result.status, 400); assert.equal(result.body.error.code, "invalidInput"); }`,
);

// 31.6: every historical protected call supplies an actor.
addImport("scripts/verify-phase-31-6.ts", `import { ReferencePreferenceRequestTracker } from "../src/application/reference-preference-request-tracker";`);
replaceExactly(
  "scripts/verify-phase-31-6.ts",
  `      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n      const priest =`,
  `      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n      useLocalActorSimulatorForAcceptance();\n      const priest =`,
);

// 31.7: repertoire role/identity error matrix is itself the regression subject.
addImport("scripts/verify-phase-31-7.ts", `import { ReferencePreferenceRequestTracker } from "../src/application/reference-preference-request-tracker";`);
replaceExactly(
  "scripts/verify-phase-31-7.ts",
  `      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n      const organist =`,
  `      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n      useLocalActorSimulatorForAcceptance();\n      const organist =`,
);

// 31.8: melody route tests keep their old explicit actor envelopes.
addImport("scripts/verify-phase-31-8.ts", `import { ReferenceMelodyRequestStateController } from "../src/application/reference-melody-request-state";`);
replaceExactly(
  "scripts/verify-phase-31-8.ts",
  `  await run("db:migrate",url); await run("db:sync:reference-catalog",url); process.env.DATABASE_URL=url; process.env.ORGANY_RUNTIME="db"; const db=new Pool({connectionString:url});`,
  `  await run("db:migrate",url); await run("db:sync:reference-catalog",url); process.env.DATABASE_URL=url; process.env.ORGANY_RUNTIME="db"; useLocalActorSimulatorForAcceptance(); const db=new Pool({connectionString:url});`,
);

// 31.10a: recommendation tests use a route-pool seam already; add identity seam alongside it.
addImport("scripts/verify-phase-31-10a.ts", `import type { PlanningRole } from "../src/planning-lifecycle";`);
replaceExactly(
  "scripts/verify-phase-31-10a.ts",
  `  const restoreRoutePoolLease = useInteractionPoolForAcceptance(pool);\n  try {`,
  `  const restoreRoutePoolLease = useInteractionPoolForAcceptance(pool);\n  useLocalActorSimulatorForAcceptance();\n  try {`,
);

// 31.11: planning lifecycle test always supplies its fixed demo admin actor.
addImport("scripts/verify-phase-31-11.ts", `import { POST } from "../app/api/planning-lifecycle/route";`);
replaceExactly(
  "scripts/verify-phase-31-11.ts",
  `        process.env.DATABASE_URL = databaseUrl;\n        process.env.ORGANY_RUNTIME = "db";\n        await verifyLifecycle(pool);`,
  `        process.env.DATABASE_URL = databaseUrl;\n        process.env.ORGANY_RUNTIME = "db";\n        useLocalActorSimulatorForAcceptance();\n        await verifyLifecycle(pool);`,
);

// 31.12: candidate reads historically had no actor at all, while lifecycle calls supplied admin.
// A default admin acceptance actor preserves both historical contracts.
addImport("scripts/verify-phase-31-12.ts", `import type { CandidateQueryInput, CandidateQueryResult } from "../src/application/interaction-contracts";`);
replaceExactly(
  "scripts/verify-phase-31-12.ts",
  `        process.env.DATABASE_URL = databaseUrl;\n        process.env.ORGANY_RUNTIME = "db";\n        await seedFocusedAuthority(pool);`,
  `        process.env.DATABASE_URL = databaseUrl;\n        process.env.ORGANY_RUNTIME = "db";\n        useLocalActorSimulatorForAcceptance({ userId: "demo-admin-user", role: "admin" });\n        await seedFocusedAuthority(pool);`,
);

console.log("Phase 31.28 historical protected-route test adaptation complete.");
