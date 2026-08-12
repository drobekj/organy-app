import fs from "node:fs";

function replaceExactly(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one target, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

// Phase 31.24: preserve historical API permission checks behind an explicit in-process test resolver.
replaceExactly(
  "scripts/phase-31-24-tests.ts",
  `import type { ActorIdentity } from "../src/application/interaction-contracts";`,
  `import type { ActorIdentity } from "../src/application/interaction-contracts";\nimport { useLocalActorSimulatorForAcceptance } from "../src/application/protected-actor";`,
);
replaceExactly(
  "scripts/phase-31-24-tests.ts",
  `async function apiContractChecks() {\n  const restorePool = useInteractionPoolForAcceptance(pool);`,
  `async function apiContractChecks() {\n  const restorePool = useInteractionPoolForAcceptance(pool);\n  const restoreActor = useLocalActorSimulatorForAcceptance();`,
);
replaceExactly(
  "scripts/phase-31-24-tests.ts",
  `  } finally {\n    restorePool();`,
  `  } finally {\n    restoreActor();\n    restorePool();`,
);

// Phase 31.25: its route assertion tests reconciliation only, so inject a fixed acceptance admin actor.
replaceExactly(
  "scripts/phase-31-25-tests.ts",
  `import type { PlanningSet, ServiceContext } from "../src/planning-lifecycle";`,
  `import type { PlanningSet, ServiceContext } from "../src/planning-lifecycle";\nimport { useProtectedActorForAcceptance } from "../src/application/protected-actor";`,
);
replaceExactly(
  "scripts/phase-31-25-tests.ts",
  `  const pool = new Pool({ connectionString: databaseUrl });\n  const db = drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;`,
  `  const pool = new Pool({ connectionString: databaseUrl });\n  const restoreActor = useProtectedActorForAcceptance(async () => ({ userId: "phase31.25-acceptance", displayName: "Phase 31.25 acceptance", role: "admin" }));\n  const db = drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;`,
);
replaceExactly(
  "scripts/phase-31-25-tests.ts",
  `  } finally {\n    if (rollbackTriggerName)`,
  `  } finally {\n    restoreActor();\n    if (rollbackTriggerName)`,
);

// Phase 31.4: retain its pre-auth business-authority scenarios through the same explicit legacy adapter.
replaceExactly(
  "scripts/verify-phase-31-4.ts",
  `import { apiFailure } from "../src/application/api-error";`,
  `import { apiFailure } from "../src/application/api-error";\nimport { useLocalActorSimulatorForAcceptance } from "../src/application/protected-actor";`,
);
replaceExactly(
  "scripts/verify-phase-31-4.ts",
  `      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n\n      const actors = await invoke(interactionPost, "listLocalActors", {});\n      assert.equal(actors.status, 200); assert.deepEqual(actors.body.value.map((u: any) => u.id).sort(), ["demo-admin-user", "demo-member-user", "demo-organist-user", "demo-priest-user", "second-organist-user"]);\n      assert.deepEqual(actors.body.value.find((u: any) => u.id === "demo-admin-user").roles, ["priest", "admin"]);`,
  `      process.env.DATABASE_URL = isolatedUrl; process.env.ORGANY_RUNTIME = "db";\n      const restoreActor = useLocalActorSimulatorForAcceptance({ userId: "demo-admin-user", role: "admin" });\n\n      const actors = await invoke(interactionPost, "listLocalActors", {});\n      assert.equal(actors.status, 200); assert.deepEqual(actors.body.value.map((u: any) => u.id), ["demo-admin-user"]);\n      assert.deepEqual(actors.body.value[0].roles, ["admin"]);`,
);
replaceExactly(
  "scripts/verify-phase-31-4.ts",
  `      for (const actor of [undefined, null, {}, { userId: "" }, { userId: "demo-admin-user", role: "bogus" }]) { const result = await invoke(interactionPost, "setMelodyWindow", { months: 1 }, actor); assert.equal(result.status, 400); assert.equal(result.body.error.code, "invalidInput"); }`,
  `      for (const actor of [null, {}, { userId: "" }, { userId: "demo-admin-user", role: "bogus" }]) { const result = await invoke(interactionPost, "setMelodyWindow", { months: 1 }, actor); assert.equal(result.status, 400); assert.equal(result.body.error.code, "invalidInput"); }`,
);
replaceExactly(
  "scripts/verify-phase-31-4.ts",
  `      const memory = new InMemoryInteractionRepository();\n      assert.equal(memory.resolveActor("demo-organist-user", "organist")?.personId, "demo-organist");\n      assert.equal(memory.setRepertoire(memory.resolveActor("demo-organist-user", "organist")!, "demo-organist", "demo-pl-101", true), true);\n    }, async () => {`,
  `      const memory = new InMemoryInteractionRepository();\n      assert.equal(memory.resolveActor("demo-organist-user", "organist")?.personId, "demo-organist");\n      assert.equal(memory.setRepertoire(memory.resolveActor("demo-organist-user", "organist")!, "demo-organist", "demo-pl-101", true), true);\n      restoreActor();\n    }, async () => {`,
);

console.log("Historical auth-bound route tests adapted to Phase 31.28 acceptance seam.");
