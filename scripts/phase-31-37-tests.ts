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
    "Current state: **HUMAN UI FAIL-CLOSED / PROJECT NOT YET CREATED**",
    "Contract Gate: #188",
    "intended Vercel project `organy-app`: **absent**",
    "zero because the project does not yet exist",
    "HUMAN Dashboard checkpoint — fail-closed result",
    "There was no separate create-only action",
    "operator did **not** click Deploy",
    "Dashboard import path is rejected for Phase 31.37",
    "`vercel project add <project-name>` creates a Vercel Project",
    "next authorized HUMAN provider action is the create-only CLI command `vercel project add organy-app`",
    "must not run `vercel`, `vercel deploy`, or `vercel --prod`",
    "framework: Next.js",
    "Node.js: `22.x`",
    "Functions region: Frankfurt `fra1`",
    "Git automatic deployment: disabled by `git.deploymentEnabled=false`",
    "GitHub repository does not need to be linked during the create-only CLI checkpoint",
    "No Vercel Pro trial, paid plan, payment method",
    "Manual Production environment-variable boundary",
    "`ORGANY_RUNTIME` — Production target, value `db`",
    "`DATABASE_URL` — Production-only Neon pooled/serverless runtime connection",
    "`BETTER_AUTH_SECRET` — Production-only stable secret",
    "`BETTER_AUTH_URL` — exact stable public Vercel Production alias",
    "`DATABASE_URL_UNPOOLED` — Neon direct connection retained for migration",
    "Preview and Development targets must not receive the production `DATABASE_URL`",
    "No `.env.production` or `.vercel/project.json` file belongs in Git",
    "exactly one intended `organy-app` Vercel project exists",
    "project has **zero deployments**",
    "connected Neon remains unchanged and empty of application schema/data",
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
console.log("Dashboard import failed closed; create-only provider creation remains deliberately external to CI.");
