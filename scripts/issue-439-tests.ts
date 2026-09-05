import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ProductionRuntimeConfigError,
  assertCongregationEmailRuntimeConfig,
  assertProductionCoreRuntimeConfig,
  resolveApplicationRuntimeMode,
  validateCongregationEmailRuntimeConfig,
  validateProductionCoreRuntimeConfig,
  validateProductionRuntimeConfig,
  type RuntimeEnvironment,
} from "../src/config/production-runtime";

const coreEnv: RuntimeEnvironment = {
  ORGANY_RUNTIME: "db",
  DATABASE_URL: "postgres://organy_app:organy_app@localhost:5432/organy_app",
  BETTER_AUTH_SECRET: "issue-439-core-runtime-secret-0123456789abcdef",
  BETTER_AUTH_URL: "https://organy.example.test",
};

const registeredEmailEnv: RuntimeEnvironment = {
  ...coreEnv,
  RESEND_API_KEY: "re_issue_439_test_key",
  CONGREGATION_EMAIL_FROM: "Organy App <preferences@organy.example.test>",
  CONGREGATION_BASE_URL: "https://organy.example.test",
  CONGREGATION_SECURITY_SECRET: "issue-439-congregation-secret-0123456789abcdef",
};

async function main() {
  assert.deepEqual(validateProductionCoreRuntimeConfig(coreEnv), []);
  assert.doesNotThrow(() => assertProductionCoreRuntimeConfig(coreEnv));
  assert.equal(resolveApplicationRuntimeMode(coreEnv, "production"), "db");

  const missingEmailIssues = validateCongregationEmailRuntimeConfig(coreEnv);
  assert.deepEqual(
    missingEmailIssues.map((issue) => issue.key).sort(),
    ["CONGREGATION_BASE_URL", "CONGREGATION_EMAIL_FROM", "CONGREGATION_SECURITY_SECRET", "RESEND_API_KEY"].sort(),
  );
  assert.throws(() => assertCongregationEmailRuntimeConfig(coreEnv), ProductionRuntimeConfigError);
  assert.deepEqual(validateCongregationEmailRuntimeConfig(registeredEmailEnv), []);
  assert.deepEqual(validateProductionRuntimeConfig(registeredEmailEnv), []);

  // The full release preflight remains strict even though the core application runtime is usable.
  assert.equal(validateProductionRuntimeConfig(coreEnv).length, 4);

  const authSource = readFileSync("src/auth/server.ts", "utf8");
  assert.match(authSource, /assertProductionCoreRuntimeConfig/);
  assert.doesNotMatch(authSource, /assertProductionRuntimeConfig\(process\.env\)/);

  const voterRuntimeSource = readFileSync("src/application/congregation-voter-runtime.ts", "utf8");
  assert.match(voterRuntimeSource, /assertCongregationEmailRuntimeConfig\(process\.env\)/);

  const previous = new Map<string, string | undefined>();
  for (const key of [
    "NODE_ENV",
    "ORGANY_RUNTIME",
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "RESEND_API_KEY",
    "CONGREGATION_EMAIL_FROM",
    "CONGREGATION_BASE_URL",
    "CONGREGATION_SECURITY_SECRET",
  ]) {
    previous.set(key, process.env[key]);
  }

  try {
    process.env.NODE_ENV = "production";
    for (const [key, value] of Object.entries(coreEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete process.env.RESEND_API_KEY;
    delete process.env.CONGREGATION_EMAIL_FROM;
    delete process.env.CONGREGATION_BASE_URL;
    delete process.env.CONGREGATION_SECURITY_SECRET;

    const { assertProtectedAuthConfigured, authPool } = await import("../src/auth/server");
    assert.doesNotThrow(() => assertProtectedAuthConfigured());
    await authPool.end();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  console.log("Issue #439 protected auth / congregation email runtime separation: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
