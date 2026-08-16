import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function requireText(haystack: string, needles: string[], label: string): void {
  for (const needle of needles) {
    assert.ok(haystack.includes(needle), `${label} must contain: ${needle}`);
  }
}

const providerState = read("docs/vercel-production-provider-state.md");
const neonState = read("docs/neon-production-provider-state.md");
const runbook = read("docs/production-runtime-runbook.md");
const recovery = read("scripts/lib/postgres-recovery.ts");
const vercel = JSON.parse(read("vercel.json")) as {
  regions?: string[];
  git?: { deploymentEnabled?: boolean };
};
const pkg = JSON.parse(read("package.json")) as {
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
};

requireText(
  providerState,
  [
    "Current state: **PROJECT CREATED / ZERO DEPLOYMENTS / PRODUCTION ENV BOUNDARY ESTABLISHED**",
    "Contract Gate: #188",
    "Dashboard checkpoint — fail-closed history",
    "There was no separate create-only action",
    "operator did **not** click Deploy",
    "create-only CLI command `vercel project add <project-name>`",
    "exactly one intended project named `organy-app` exists",
    "framework preset: **Next.js**",
    "project `live`: **false**",
    "latest deployment: **none**",
    "deployment count: **0**",
    "`package.json` pins Node.js `22.x`",
    "Frankfurt `fra1`",
    "`git.deploymentEnabled=false`",
    "No Vercel Pro trial, paid plan, payment method",
    "The HUMAN CLI checkpoint established the following Vercel **Production-only** variables",
    "`ORGANY_RUNTIME` — value `db`",
    "`DATABASE_URL` — Neon pooled/serverless runtime connection",
    "`BETTER_AUTH_SECRET` — stable cryptographically generated Production secret",
    "Preview and Development were not targeted",
    "`BETTER_AUTH_URL` remains deliberately **deferred**",
    "`DATABASE_URL_UNPOOLED` remains outside ordinary Vercel request-runtime configuration",
    "non-system/application tables: **0**",
    "`neon_auth` schema: **absent**",
    "Data API roles `authenticated` / `anonymous`: **absent**",
    "Phase 31.37 alone is not a production deployment or cutover",
  ],
  "Vercel provider state",
);

requireText(
  runbook,
  [
    "Vercel Hobby for the Next.js application and Neon Free for PostgreSQL",
    "automatic Git deployments disabled",
    "manual Vercel environment-variable connection",
    "DATABASE_URL=<Neon pooled connection>",
    "DATABASE_URL_UNPOOLED=<Neon direct connection>",
    "BETTER_AUTH_URL` must be the exact stable public Vercel production alias",
    "Preview deployments, if used later, must not receive the production database credential by default",
    "explicitly deploy the exact reviewed revision to Vercel Production",
    "Phase 31.37",
  ],
  "production runtime runbook",
);

requireText(
  neonState,
  [
    "Current state: **PROVISIONED / READ-ONLY PROBE PASS**",
    "project name: `organy-app-production`",
    "PostgreSQL major: **16**",
    "Result: **PASS**",
  ],
  "Neon provider state regression",
);

assert.equal(pkg.engines?.node, "22.x", "Node 22.x production pin must remain unchanged");
assert.ok(pkg.dependencies?.pg, "pg must remain a production dependency");
assert.deepEqual(vercel.regions, ["fra1"], "Vercel Frankfurt configuration must remain unchanged");
assert.equal(vercel.git?.deploymentEnabled, false, "automatic Git deployment must remain disabled");
assert.ok(recovery.includes("pg_control_system()"), "Phase 31.33 source/target identity guard must remain in recovery code");

for (const text of [providerState, runbook]) {
  assert.ok(!/postgres(?:ql)?:\/\/[^\s<]+/i.test(text), "provider docs must not contain concrete PostgreSQL credential URLs");
  assert.ok(!/\.neon\.tech\b/i.test(text), "provider docs must not contain concrete Neon hostnames");
  assert.ok(!/\b(?:VERCEL|NEON)_(?:TOKEN|API_KEY)\s*=\s*\S+/i.test(text), "provider docs must not contain provider token values");
  assert.ok(!/BETTER_AUTH_SECRET\s*=\s*[^<\s`]+/i.test(text), "provider docs must not contain a concrete Better Auth secret");
}

assert.equal(existsSync(".env.production"), false, "production credentials must not be committed");
assert.equal(existsSync(".vercel/project.json"), false, "Vercel local-link metadata must not be committed");

console.log("Phase 31.37 Vercel Hobby project/manual environment boundary acceptance: PASS");
console.log("Create-only project and Production secret boundary are recorded without deployment or secret disclosure.");
