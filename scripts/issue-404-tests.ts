import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  ApplicationExperienceConfigError,
  DEMO_FORBIDDEN_RUNTIME_KEYS,
  assertDemoRuntimeConfig,
  resolveApplicationExperience,
  validateDemoRuntimeConfig,
} from "../src/config/application-experience";
import {
  DEMO_NETWORK_DENIED_CODE,
  DemoNetworkDeniedError,
  assertDemoNetworkTargetAllowed,
} from "../src/application/demo-network";
import { DEMO_D1_FIXTURE } from "../src/demo/d1-fixture";

assert.equal(resolveApplicationExperience({}), "standard");
assert.equal(resolveApplicationExperience({ ORGANY_EXPERIENCE: "standard" }), "standard");
assert.equal(resolveApplicationExperience({ ORGANY_EXPERIENCE: "demo" }), "demo");
assert.throws(
  () => resolveApplicationExperience({ ORGANY_EXPERIENCE: "other" }),
  ApplicationExperienceConfigError,
);

const isolatedDemoEnv = {
  ORGANY_EXPERIENCE: "demo",
  ORGANY_RUNTIME: "memory",
};
assert.deepEqual(validateDemoRuntimeConfig(isolatedDemoEnv), []);
assert.doesNotThrow(() => assertDemoRuntimeConfig(isolatedDemoEnv));

assert.ok(validateDemoRuntimeConfig({ ...isolatedDemoEnv, ORGANY_RUNTIME: "db" }).some((issue) => issue.key === "ORGANY_RUNTIME"));
for (const key of DEMO_FORBIDDEN_RUNTIME_KEYS) {
  const issues = validateDemoRuntimeConfig({ ...isolatedDemoEnv, [key]: "must-not-exist" });
  assert.ok(issues.some((issue) => issue.key === key), `${key} must be forbidden in the isolated Demo runtime.`);
}

for (const target of [
  "/api/catalog",
  "/api/interaction",
  "/api/planning-lifecycle",
  "https://organy-app.vercel.app/",
  "https://organy-app.vercel.app/api/catalog",
  "https://organy-app-drobekjs-projects.vercel.app/",
]) {
  assert.throws(
    () => assertDemoNetworkTargetAllowed(target, "https://organy-app-demo.vercel.app"),
    (error: unknown) => {
      assert.ok(error instanceof DemoNetworkDeniedError);
      assert.equal(error.code, DEMO_NETWORK_DENIED_CODE);
      return true;
    },
    `Demo network boundary must deny ${target}`,
  );
}
assert.doesNotThrow(() => assertDemoNetworkTargetAllowed("/_next/static/chunk.js", "https://organy-app-demo.vercel.app"));

assert.equal(DEMO_D1_FIXTURE.version, "d1");
assert.ok(DEMO_D1_FIXTURE.people.every((person) => person.id.startsWith("demo-fixture-")));
assert.ok(DEMO_D1_FIXTURE.plans.every((plan) => plan.id.startsWith("demo-fixture-")));

const page = readFileSync("app/page.tsx", "utf8");
const shell = readFileSync("app/demo-d1-shell.tsx", "utf8");
const model = readFileSync("src/planning-lifecycle/model.ts", "utf8");
const productionRuntime = readFileSync("src/config/production-runtime.ts", "utf8");

const demoBranch = page.indexOf('if (experience === "demo")');
const standardRuntime = page.indexOf("resolveApplicationRuntimeMode()");
assert.ok(demoBranch >= 0 && standardRuntime > demoBranch, "Demo experience must branch before the unchanged standard DATA BACKEND resolver.");
assert.match(page, /assertDemoRuntimeConfig\(\);[\s\S]*return <DemoD1Shell \/>/);
assert.match(page, /resolveProtectedUser\(await headers\(\), authPool\)/);
assert.match(page, /ProtectedActorError\) redirect\("\/sign-in"\)/);

assert.doesNotMatch(shell, /fetch\s*\(|\/api\/|authPool|resolveProtected|DATABASE_URL|getAppDbPool|Db[A-Z]/);
assert.match(shell, /Stage D1 safety shell/);
assert.match(shell, /synthetic in-memory data/);

const planningRole = model.match(/export type PlanningRole = ([^;]+);/)?.[1] ?? "";
assert.doesNotMatch(planningRole, /demo/i);
assert.match(productionRuntime, /ApplicationRuntimeMode = "db" \| "memory"/);
assert.equal(existsSync("app/demo/page.tsx"), false, "D1 must not add a /demo route.");

console.log("Issue 404 Stage D1 isolated Demo runtime acceptance passed.");
