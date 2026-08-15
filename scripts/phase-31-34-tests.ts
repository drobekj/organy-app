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
    "Use **Render for both the application web service and PostgreSQL**",
    "Decision date: **2026-08-15**",
    "**Frankfurt**",
    "**Basic-256mb Render Postgres**",
    "**PostgreSQL 16**",
    "NODE_VERSION=22.22.0",
    "npm ci --no-audit --no-fund && npm run build",
    "npx tsx scripts/production-preflight.ts && npm run db:migrate",
    "npm start",
    "ORGANY_RUNTIME=db",
    "DATABASE_URL=<Render Postgres internal connection URL>",
    "BETTER_AUTH_SECRET=<stable operator-supplied production secret>",
    "BETTER_AUTH_URL=https://<actual-public-service-name>.onrender.com",
    "npm run db:bootstrap:auth",
    "one persistent Production environment only",
    "pg_control_system()",
    "managed-PostgreSQL-compatible, fail-closed method",
    "USD 13/month",
    "Vercel Pro + Neon Launch",
    "Railway",
    "https://render.com/docs/deploy-nextjs-app",
    "https://render.com/docs/postgresql",
    "https://www.postgresql.org/docs/16/functions-info.html",
    "Phase 31.34 does not:",
    "create a Render account/workspace/service/database",
    "enter billing details or authorize charges",
    "deploy the application remotely",
  ],
  "hosting decision",
);

requireText(
  runbook,
  [
    "Render for the application web service and Render Postgres for PostgreSQL",
    "npm ci --no-audit --no-fund && npm run build",
    "npx tsx scripts/production-preflight.ts && npm run db:migrate",
    "npm start",
    "Packaging prerequisite before real deployment",
    "src/auth/server.ts",
    "server-external package",
    "Do not rely silently on incidental dev-dependency retention",
    "pg_control_system()",
    "no Render account/resource, billing commitment, production secret, DNS change, data cutover, or remote deployment",
  ],
  "production runtime runbook",
);

assert.equal(pkg.scripts?.build, "next build", "documented build must match package.json");
assert.equal(pkg.scripts?.start, "next start", "documented start must match package.json");
assert.equal(pkg.scripts?.["db:migrate"], "tsx scripts/db-migrate.ts", "documented migration must match package.json");
assert.equal(
  pkg.scripts?.["db:bootstrap:auth"],
  "tsx scripts/db-bootstrap-protected-auth.ts",
  "documented bootstrap must match package.json",
);

assert.ok(authServer.includes('from "pg"'), "production auth runtime must still be recognized as a pg consumer");
assert.ok(
  pkg.dependencies?.pg || pkg.devDependencies?.pg,
  "pg must remain declared while the deployment packaging location is resolved",
);
assert.ok(
  pkg.dependencies?.tsx || pkg.devDependencies?.tsx,
  "tsx must remain declared while pre-deploy/operator packaging is resolved",
);
assert.ok(
  pkg.dependencies?.pg || runbook.includes("move the runtime `pg` package to `dependencies`"),
  "if pg is not yet a production dependency, the runbook must block cutover on that packaging fix",
);

assert.ok(
  recovery.includes("pg_control_system()"),
  "Render compatibility probe must track the actual Phase 31.33 source/target identity query",
);
assert.ok(
  decision.includes("If the query is denied or otherwise unavailable") &&
    decision.includes("do not weaken or bypass the source=target protection"),
  "managed PostgreSQL compatibility uncertainty must fail closed",
);

for (const text of [decision, runbook]) {
  assert.ok(!/postgres(?:ql)?:\/\/[^\s<]+/i.test(text), "deployment documentation must not contain a concrete PostgreSQL credential URL");
}

assert.equal(existsSync("render.yaml"), false, "Phase 31.34 must not introduce a Render resource blueprint");
assert.equal(existsSync(".env.production"), false, "Phase 31.34 must not introduce production environment values");

console.log("Phase 31.34 hosting/provider decision acceptance: PASS");
console.log("Decision is preparation-only; no remote provider resource or credential is created by this acceptance.");
