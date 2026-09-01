import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DATA_BACKENDS,
  DEMO_CAPABILITIES,
  DEMO_WRITE_DENIED_CODE,
  DemoWriteDeniedError,
  EXPERIENCE_MODES,
  runPersistentMutation,
} from "../src/application/demo-safety";

async function main() {
  assert.deepEqual(DATA_BACKENDS, ["memory", "db"], "DATA BACKEND must remain memory | db.");
  assert.deepEqual(EXPERIENCE_MODES, ["standard", "demo"], "EXPERIENCE must remain standard | demo.");

  assert.equal(DEMO_CAPABILITIES.localDraftEditing, true);
  for (const [key, value] of Object.entries(DEMO_CAPABILITIES)) {
    if (key === "localDraftEditing") continue;
    assert.equal(value, false, `Demo capability '${key}' must remain denied in D0.`);
  }

  let demoMutationInvoked = false;
  await assert.rejects(
    runPersistentMutation("demo", "planning.saveWorking", async () => {
      demoMutationInvoked = true;
      return { success: true };
    }),
    (error: unknown) => {
      assert.ok(error instanceof DemoWriteDeniedError);
      assert.equal(error.code, DEMO_WRITE_DENIED_CODE);
      assert.equal(error.operation, "planning.saveWorking");
      return true;
    },
  );
  assert.equal(demoMutationInvoked, false, "Demo denial must happen before mutation execution.");

  let standardMutationInvoked = false;
  const standardResult = await runPersistentMutation("standard", "acceptance.passThrough", async () => {
    standardMutationInvoked = true;
    return "unchanged";
  });
  assert.equal(standardMutationInvoked, true);
  assert.equal(standardResult, "unchanged", "Standard experience must remain pass-through.");

  const model = readFileSync("src/planning-lifecycle/model.ts", "utf8");
  const contracts = readFileSync("src/application/interaction-contracts.ts", "utf8");
  const productionRuntime = readFileSync("src/config/production-runtime.ts", "utf8");
  const planningClient = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
  const home = readFileSync("app/page.tsx", "utf8");
  const catalogRoute = readFileSync("app/api/catalog/route.ts", "utf8");
  const interactionRoute = readFileSync("app/api/interaction/route.ts", "utf8");
  const planningRoute = readFileSync("app/api/planning-lifecycle/route.ts", "utf8");

  const planningRole = model.match(/export type PlanningRole = ([^;]+);/)?.[1] ?? "";
  assert.ok(planningRole, "PlanningRole declaration must remain present.");
  assert.doesNotMatch(planningRole, /demo/i, "Demo must not become a PlanningRole.");
  assert.match(contracts, /ActorIdentity = \{[^}]*role: PlanningRole/, "ActorIdentity must remain based on PlanningRole.");

  assert.match(productionRuntime, /ApplicationRuntimeMode = "db" \| "memory"/);
  assert.match(planningClient, /RuntimeMode = "memory" \| "db"/);
  assert.doesNotMatch(productionRuntime, /ApplicationRuntimeMode = [^;]*demo/i);
  assert.doesNotMatch(planningClient, /RuntimeMode = [^;]*demo/i);

  assert.match(home, /resolveProtectedUser\(await headers\(\), authPool\)/);
  assert.match(home, /ProtectedActorError\) redirect\("\/sign-in"\)/);

  for (const [label, source] of [
    ["Catalog", catalogRoute],
    ["Interaction", interactionRoute],
    ["Planning Lifecycle", planningRoute],
  ] as const) {
    assert.match(source, /resolveProtectedActor\(request\.headers, pool, body\.actor\)/, `${label} API must keep protected actor resolution.`);
    assert.doesNotMatch(source, /demo-safety|ExperienceMode|DEMO_CAPABILITIES/, `${label} Production API must not import Demo safety code in D0.`);
  }

  assert.doesNotMatch(home, /demo-safety|ExperienceMode|DEMO_CAPABILITIES/, "Production root must not import Demo safety code in D0.");

  assert.match(planningRoute, /getWorkspaceSnapshot/);
  assert.match(planningRoute, /finalSetCompletion\.completeFinalSet/);
  assert.match(planningRoute, /auditEvents/);

  console.log("Issue 402 Stage D0 pure safety contract acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
