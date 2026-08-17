import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validateProductionRuntimeConfig } from "../src/config/production-runtime";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function requireText(haystack: string, needles: string[], label: string): void {
  for (const needle of needles) {
    assert.ok(haystack.includes(needle), `${label} must contain: ${needle}`);
  }
}

const deployment = read("docs/production-vercel-first-deployment-runbook.md");
const providerState = read("docs/vercel-production-provider-state.md");
const runtimeRunbook = read("docs/production-runtime-runbook.md");
const vercel = JSON.parse(read("vercel.json")) as {
  regions?: string[];
  git?: { deploymentEnabled?: boolean };
};
const pkg = JSON.parse(read("package.json")) as { engines?: Record<string, string> };

requireText(
  deployment,
  [
    "Contract Gate: #194",
    "c10f3e4af380297d7d37c7c73c999b19eb0807c2",
    "control PR contains only release-boundary documentation/acceptance",
    "not** the deployment payload",
    "zero deployments and no assigned production domain",
    "`BETTER_AUTH_URL` still absent/deferred",
    "two explicit Production deployments",
    "bootstrap deployment",
    "--project organy-app",
    "No local `.vercel/project.json` link metadata is required",
    "vercel --prod --yes --project organy-app",
    "identify the actual stable Production alias from provider state",
    "vercel env add BETTER_AUTH_URL production --project organy-app",
    "same exact clean payload checkout",
    "No `--skip-domain` path is used",
    "do not bootstrap an Account",
    "Git automatic deployment remains disabled",
    "Neon remains exactly at the Phase 31.39 Reference snapshot",
  ],
  "Phase 31.40 deployment runbook",
);

requireText(
  providerState,
  [
    "deployment count: **0**",
    "`BETTER_AUTH_URL` remains deliberately **deferred**",
    "`DATABASE_URL_UNPOOLED` remains outside ordinary Vercel request-runtime configuration",
  ],
  "Phase 31.37 provider-state regression",
);

requireText(
  runtimeRunbook,
  [
    "BETTER_AUTH_URL` must be the exact stable public Vercel production alias",
    "explicitly deploy the exact reviewed revision to Vercel Production",
    "automatic Git deployments remain disabled",
  ],
  "production runtime release regression",
);

assert.equal(pkg.engines?.node, "22.x", "repository production Node pin must remain 22.x");
assert.deepEqual(vercel.regions, ["fra1"], "Vercel Function region must remain Frankfurt fra1");
assert.equal(vercel.git?.deploymentEnabled, false, "automatic Git deployment must remain disabled");

const bootstrapIssues = validateProductionRuntimeConfig({
  ORGANY_RUNTIME: "db",
  DATABASE_URL: "postgres://placeholder",
  BETTER_AUTH_SECRET: "phase-31-40-safe-test-secret-0123456789",
});
assert.ok(
  bootstrapIssues.some((issue) => issue.key === "BETTER_AUTH_URL"),
  "bootstrap configuration without BETTER_AUTH_URL must remain invalid",
);

const configuredIssues = validateProductionRuntimeConfig({
  ORGANY_RUNTIME: "db",
  DATABASE_URL: "postgres://placeholder",
  BETTER_AUTH_SECRET: "phase-31-40-safe-test-secret-0123456789",
  BETTER_AUTH_URL: "https://production-alias.example",
});
assert.equal(configuredIssues.length, 0, "complete HTTPS production runtime shape must remain valid");

assert.equal(existsSync(".env.production"), false, "production credentials must not be committed");
assert.equal(existsSync(".vercel/project.json"), false, "local Vercel link metadata must not be committed");

for (const text of [deployment, providerState, runtimeRunbook]) {
  assert.ok(!/postgres(?:ql)?:\/\/[^\s<]+/i.test(text), "release docs must not contain concrete PostgreSQL credential URLs");
  assert.ok(!/\.neon\.tech\b/i.test(text), "release docs must not contain concrete Neon hostnames");
  assert.ok(!/\b(?:VERCEL|NEON)_(?:TOKEN|API_KEY)\s*=\s*\S+/i.test(text), "release docs must not contain provider token values");
  assert.ok(!/BETTER_AUTH_SECRET\s*=\s*[^<\s`]+/i.test(text), "release docs must not contain a concrete Better Auth secret");
}

console.log("Phase 31.40 first explicit Vercel Production deployment boundary acceptance: PASS");
console.log("Two-step alias bootstrap remains explicit, exact-payload, fail-closed, and secret-safe.");
