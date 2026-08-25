import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const pkg = JSON.parse(read("package.json")) as {
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lock = JSON.parse(read("package-lock.json")) as {
  packages?: Record<string, {
    engines?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    dev?: boolean;
    devOptional?: boolean;
  }>;
};
const vercel = JSON.parse(read("vercel.json")) as {
  $schema?: string;
  regions?: string[];
  git?: { deploymentEnabled?: boolean };
};
const authServer = read("src/auth/server.ts");
const appPool = read("src/db/app-pool.ts");
const runbook = read("docs/production-runtime-runbook.md");

assert.equal(pkg.engines?.node, "22.x", "package.json must machine-pin Node 22.x");
assert.equal(pkg.dependencies?.pg, "^8.16.3", "pg must be an explicit production dependency");
assert.equal(pkg.devDependencies?.pg, undefined, "pg must not remain dev-only");
assert.ok(authServer.includes("getAppDbPool"), "production auth runtime must use the shared application DB pool");
assert.ok(appPool.includes('from "pg"'), "shared application DB pool must remain a pg consumer");
assert.ok(appPool.includes("attachDatabasePool"), "shared application DB pool must remain Vercel-managed");

const rootLock = lock.packages?.[""];
assert.equal(rootLock?.engines?.node, "22.x", "package-lock root must preserve the Node 22.x pin");
assert.equal(rootLock?.dependencies?.pg, "^8.16.3", "package-lock root must preserve pg as production dependency");
assert.equal(rootLock?.devDependencies?.pg, undefined, "package-lock root must not classify pg as dev dependency");

const pgLock = lock.packages?.["node_modules/pg"];
assert.ok(pgLock, "package-lock must contain pg runtime package");
assert.notEqual(pgLock?.dev, true, "pg runtime package must not be dev-only");
assert.notEqual(pgLock?.devOptional, true, "pg runtime package must not be dev-optional-only");

assert.equal(vercel.$schema, "https://openapi.vercel.sh/vercel.json", "vercel.json must use Vercel's published schema");
assert.deepEqual(vercel.regions, ["fra1"], "Vercel Functions must default to Frankfurt fra1");
assert.equal(vercel.git?.deploymentEnabled, false, "automatic Git deployments must remain disabled for migration-first releases");

assert.ok(runbook.includes("`package.json` now pins **Node.js 22.x**"), "runbook must record the completed Node pin");
assert.ok(runbook.includes("`pg` is now a production dependency"), "runbook must record completed pg packaging");
assert.ok(runbook.includes("`vercel.json` fixes Frankfurt (`fra1`)"), "runbook must record repository Vercel configuration");
assert.ok(runbook.includes("automatic Git deployments disabled"), "runbook must record manual deployment ordering");
assert.ok(runbook.includes("Phase 31.36"), "runbook must identify provider provisioning as the next separate phase");

for (const path of [".env.production", ".vercel/project.json"]) {
  assert.equal(existsSync(path), false, `${path} must not be introduced by Phase 31.35`);
}

for (const text of [read("vercel.json"), runbook]) {
  assert.ok(!/postgres(?:ql)?:\/\/[^\s<]+/i.test(text), "Phase 31.35 artifacts must not contain concrete PostgreSQL credentials");
}

console.log("Phase 31.35 Vercel/Neon runtime readiness acceptance: PASS");
