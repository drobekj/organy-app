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

const decision = read("docs/production-hosting-decision.md");
const runbook = read("docs/production-runtime-runbook.md");
const recovery = read("scripts/lib/postgres-recovery.ts");
const authServer = read("src/auth/server.ts");
const pkg = JSON.parse(read("package.json")) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

requireText(
  decision,
  [
    "Use **Vercel Hobby for the Next.js application and Neon Free for PostgreSQL**",
    "Decision date: **2026-08-15**",
    "USD 0 recurring provider cost",
    "personal or non-commercial use",
    "Do **not** start a Vercel Pro trial",
    "USD 0 with no time limit and no credit card required",
    "100 CU-hours",
    "0.5 GB storage",
    "5 GB monthly public network transfer",
    "Frankfurt (`fra1`)",
    "AWS Europe (Frankfurt)",
    "Node.js 22.x",
    "DATABASE_URL=<Neon pooled production connection URL>",
    "DATABASE_URL_UNPOOLED=<Neon direct production connection URL>",
    "BETTER_AUTH_URL=https://<actual-organy-project>.vercel.app",
    "git.deploymentEnabled=false",
    "npx tsx scripts/production-preflight.ts",
    "npm run db:migrate",
    "npm run db:bootstrap:auth",
    "one persistent Production environment only",
    "must not provision Neon Auth",
    "pg_control_system()",
    "do not weaken or bypass source=target protection",
    "temporary application outage if a free quota is exhausted",
    "Netlify Free + Neon Free",
    "Render Free Web + Neon Free",
    "Cloudflare Workers Free + Neon Free",
    "https://vercel.com/legal/terms",
    "https://vercel.com/docs/plans/hobby",
    "https://neon.com/pricing",
    "https://neon.com/docs/connect/connection-pooling",
    "Phase 31.34 does not:",
    "create the new Vercel `organy-app` project",
    "create a Neon project/database/branch",
    "add a payment method, start a Pro trial, or authorize any charge",
    "deploy the application remotely",
  ],
  "hosting decision",
);

requireText(
  runbook,
  [
    "Vercel Hobby for the Next.js application and Neon Free for PostgreSQL",
    "USD 0 recurring provider cost",
    "DATABASE_URL_UNPOOLED",
    "Frankfurt (`fra1`)",
    "Production does **not** run a persistent `npm start` / `next start` process",
    "Node.js 22.x",
    "move runtime `pg` to `dependencies`",
    "automatic Git deployment for `organy-app` must be disabled",
    "explicitly deploy the exact reviewed revision to Vercel Production",
    "Neon Auth must not be provisioned",
    "pg_control_system()",
    "temporary outage after free-quota exhaustion",
    "no custom domain, paid add-on, Vercel Pro trial",
    "no new Vercel project, Neon project/database, payment plan, production secret, DNS change, data cutover, or remote deployment",
  ],
  "production runtime runbook",
);

assert.equal(pkg.scripts?.build, "next build", "documented framework build must match package.json");
assert.equal(pkg.scripts?.start, "next start", "local/conventional start script remains unchanged in Phase 31.34");
assert.equal(pkg.scripts?.["db:migrate"], "tsx scripts/db-migrate.ts", "documented migration must match package.json");
assert.equal(
  pkg.scripts?.["db:bootstrap:auth"],
  "tsx scripts/db-bootstrap-protected-auth.ts",
  "documented bootstrap must match package.json",
);

assert.ok(authServer.includes('from "pg"'), "production auth runtime must still be recognized as a pg consumer");
assert.ok(
  pkg.dependencies?.pg || pkg.devDependencies?.pg,
  "pg must remain declared while the later deployment slice resolves production packaging",
);
assert.ok(
  pkg.dependencies?.pg || runbook.includes("move runtime `pg` to `dependencies`"),
  "if pg is not yet a production dependency, the runbook must block cutover on that packaging fix",
);

assert.ok(
  recovery.includes("pg_control_system()"),
  "Neon compatibility probe must track the actual Phase 31.33 source/target identity query",
);
assert.ok(
  decision.includes("If it is denied or otherwise unavailable") &&
    decision.includes("do not weaken or bypass source=target protection"),
  "managed PostgreSQL compatibility uncertainty must fail closed",
);

assert.ok(
  !decision.includes("Use **Render for both the application web service and PostgreSQL**"),
  "rejected paid Render decision must not remain authoritative",
);
assert.ok(
  !runbook.includes("paid web service's pre-deploy command"),
  "rejected Render pre-deploy contract must be removed",
);

for (const text of [decision, runbook]) {
  assert.ok(!/postgres(?:ql)?:\/\/[^\s<]+/i.test(text), "deployment documentation must not contain a concrete PostgreSQL credential URL");
}

assert.equal(existsSync(".env.production"), false, "Phase 31.34 must not introduce production environment values");

console.log("Phase 31.34 zero-cost hosting/provider decision acceptance: PASS");
console.log("Vercel Hobby + Neon Free is preparation-only; no remote resource, credential, payment plan, or deployment is created by this acceptance.");
