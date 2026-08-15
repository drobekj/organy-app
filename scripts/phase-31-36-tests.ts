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

const providerState = read("docs/neon-production-provider-state.md");
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
    "Current state: **PROVISIONED / READ-ONLY PROBE PASS**",
    "project name: `organy-app-production`",
    "organization plan: **Free**",
    "PostgreSQL major: **16**",
    "AWS Europe (Frankfurt)** (`aws-eu-central-1`)",
    "one default root branch named `production`",
    "one default read-write compute",
    "pooled/serverless endpoint is available",
    "direct/unpooled endpoint is available",
    "no Neon Auth",
    "select current_database(),",
    "pg_control_system()",
    "Result: **PASS**",
    "No managed-PostgreSQL identity adaptation is required before cutover",
    "Phase 31.37",
  ],
  "Neon provider state",
);

requireText(
  runbook,
  [
    "Phase 31.36 creates only the Neon Free PostgreSQL provider target",
    "actual Neon provider target exists as `organy-app-production`",
    "PostgreSQL 16 in AWS Frankfurt",
    "manual Vercel environment-variable connection",
    "Neon Auth must not be provisioned",
    "compatibility PASS",
    "Phase 31.37",
    "automatic Git deployments disabled",
  ],
  "production runtime runbook",
);

assert.equal(pkg.engines?.node, "22.x", "Node 22.x production pin must remain unchanged");
assert.ok(pkg.dependencies?.pg, "pg must remain a production dependency");
assert.deepEqual(vercel.regions, ["fra1"], "Vercel Frankfurt configuration must remain unchanged");
assert.equal(vercel.git?.deploymentEnabled, false, "automatic Git deployment must remain disabled");
assert.ok(recovery.includes("pg_control_system()"), "Phase 31.33 source/target identity guard must remain in recovery code");

for (const text of [providerState, runbook]) {
  assert.ok(!/postgres(?:ql)?:\/\/[^\s<]+/i.test(text), "provider docs must not contain concrete PostgreSQL credential URLs");
  assert.ok(!/\.neon\.tech\b/i.test(text), "provider docs must not contain concrete Neon hostnames");
  assert.ok(!/\b[a-z]+-[a-z]+-\d{8}\b/i.test(text), "provider docs must not contain Neon project identifiers");
  assert.ok(!/\b\d{16,20}\b/.test(text), "provider docs must not contain PostgreSQL system identifiers");
}

assert.equal(existsSync(".env.production"), false, "production credentials must not be committed");
assert.equal(existsSync(".vercel/project.json"), false, "Phase 31.36 must not link or create a Vercel project in-repository");

console.log("Phase 31.36 Neon Free provisioning/recovery compatibility acceptance: PASS");
console.log("Provider facts are non-secret; no live Neon connection is required by CI acceptance.");
