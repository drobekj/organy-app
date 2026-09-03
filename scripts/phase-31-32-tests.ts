import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  ProductionRuntimeConfigError,
  formatProductionRuntimeIssues,
  resolveApplicationRuntimeMode,
  validateProductionRuntimeConfig,
  type RuntimeEnvironment,
} from "../src/config/production-runtime";

const VALID_SECRET = "phase-31-32-random-looking-secret-0123456789abcdef";
const SENSITIVE_SECRET = "super-sensitive-phase-31-32-secret-0123456789abcdef";
const SENSITIVE_DATABASE = "postgres://private-user:private-password@db.internal.example/organy";

const validEnv: RuntimeEnvironment = {
  ORGANY_RUNTIME: "db",
  DATABASE_URL: "postgres://organy_app:organy_app@localhost:5432/organy_app",
  BETTER_AUTH_SECRET: VALID_SECRET,
  BETTER_AUTH_URL: "https://organy.example.test",
  RESEND_API_KEY: "re_phase_31_32_safe_test_key",
  CONGREGATION_EMAIL_FROM: "Organy App <preferences@organy.example.test>",
  CONGREGATION_BASE_URL: "https://organy.example.test",
  CONGREGATION_SECURITY_SECRET: "phase-31-32-congregation-secret-0123456789",
};

function issues(overrides: RuntimeEnvironment): ReturnType<typeof validateProductionRuntimeConfig> {
  return validateProductionRuntimeConfig({ ...validEnv, ...overrides });
}

function hasIssue(result: ReturnType<typeof validateProductionRuntimeConfig>, key: string): boolean {
  return result.some((issue) => issue.key === key);
}

assert.deepEqual(validateProductionRuntimeConfig(validEnv), []);
assert.deepEqual(validateProductionRuntimeConfig({ ...validEnv, BETTER_AUTH_URL: "http://localhost:3000", CONGREGATION_BASE_URL: "http://localhost:3000" }), []);
assert.deepEqual(validateProductionRuntimeConfig({ ...validEnv, BETTER_AUTH_URL: "http://127.0.0.1:3000", CONGREGATION_BASE_URL: "http://127.0.0.1:3000" }), []);
assert.deepEqual(validateProductionRuntimeConfig({ ...validEnv, BETTER_AUTH_URL: "http://[::1]:3000", CONGREGATION_BASE_URL: "http://[::1]:3000" }), []);

assert.ok(hasIssue(issues({ ORGANY_RUNTIME: "memory" }), "ORGANY_RUNTIME"));
assert.ok(hasIssue(issues({ DATABASE_URL: "" }), "DATABASE_URL"));
assert.ok(hasIssue(issues({ DATABASE_URL: "   " }), "DATABASE_URL"));
assert.ok(hasIssue(issues({ BETTER_AUTH_SECRET: "" }), "BETTER_AUTH_SECRET"));
assert.ok(hasIssue(issues({ BETTER_AUTH_SECRET: "short-secret" }), "BETTER_AUTH_SECRET"));
assert.ok(hasIssue(issues({ BETTER_AUTH_SECRET: "organy-build-placeholder-secret-not-for-runtime" }), "BETTER_AUTH_SECRET"));
assert.ok(hasIssue(issues({ BETTER_AUTH_SECRET: "replace-me-with-a-placeholder-secret-value-123456" }), "BETTER_AUTH_SECRET"));
assert.ok(hasIssue(issues({ BETTER_AUTH_URL: "" }), "BETTER_AUTH_URL"));
assert.ok(hasIssue(issues({ BETTER_AUTH_URL: "not-a-url" }), "BETTER_AUTH_URL"));
assert.ok(hasIssue(issues({ BETTER_AUTH_URL: "http://organy.example.test" }), "BETTER_AUTH_URL"));
assert.ok(hasIssue(issues({ BETTER_AUTH_URL: "ftp://organy.example.test" }), "BETTER_AUTH_URL"));
assert.ok(hasIssue(issues({ RESEND_API_KEY: "" }), "RESEND_API_KEY"));
assert.ok(hasIssue(issues({ CONGREGATION_EMAIL_FROM: "invalid" }), "CONGREGATION_EMAIL_FROM"));
assert.ok(hasIssue(issues({ CONGREGATION_BASE_URL: "http://organy.example.test" }), "CONGREGATION_BASE_URL"));
assert.ok(hasIssue(issues({ CONGREGATION_BASE_URL: "https://other.example.test" }), "CONGREGATION_BASE_URL"));
assert.ok(hasIssue(issues({ CONGREGATION_SECURITY_SECRET: "short" }), "CONGREGATION_SECURITY_SECRET"));

assert.equal(resolveApplicationRuntimeMode(validEnv, "production"), "db");
assert.throws(
  () => resolveApplicationRuntimeMode({ ...validEnv, ORGANY_RUNTIME: "memory" }, "production"),
  ProductionRuntimeConfigError,
);
assert.throws(
  () => resolveApplicationRuntimeMode({ ...validEnv, ORGANY_RUNTIME: "invalid" }, "production"),
  ProductionRuntimeConfigError,
);
assert.throws(
  () => resolveApplicationRuntimeMode({ ...validEnv, DATABASE_URL: "" }, "production"),
  ProductionRuntimeConfigError,
);
assert.equal(resolveApplicationRuntimeMode({ ORGANY_RUNTIME: "db" }, "development"), "db");
assert.equal(resolveApplicationRuntimeMode({ ORGANY_RUNTIME: "memory" }, "development"), "memory");
assert.equal(resolveApplicationRuntimeMode({ ORGANY_RUNTIME: "invalid" }, "development"), "memory");
assert.equal(resolveApplicationRuntimeMode({}, "development"), "memory");
assert.equal(resolveApplicationRuntimeMode({}, "test"), "memory");

const redactionIssues = validateProductionRuntimeConfig({
  ORGANY_RUNTIME: "memory",
  DATABASE_URL: SENSITIVE_DATABASE,
  BETTER_AUTH_SECRET: SENSITIVE_SECRET,
  BETTER_AUTH_URL: "http://public.example.test",
  RESEND_API_KEY: "re_sensitive",
  CONGREGATION_EMAIL_FROM: "Organy App <preferences@public.example.test>",
  CONGREGATION_BASE_URL: "http://public.example.test",
  CONGREGATION_SECURITY_SECRET: SENSITIVE_SECRET,
});
const formatted = formatProductionRuntimeIssues(redactionIssues).join("\n");
assert.ok(!formatted.includes(SENSITIVE_SECRET));
assert.ok(!formatted.includes(SENSITIVE_DATABASE));
assert.ok(!formatted.includes("private-password"));

const envExample = readFileSync(".env.example", "utf8");
for (const key of ["ORGANY_RUNTIME", "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "RESEND_API_KEY", "CONGREGATION_EMAIL_FROM", "CONGREGATION_BASE_URL", "CONGREGATION_SECURITY_SECRET"]) {
  assert.match(envExample, new RegExp(`^${key}=`, "m"));
}
for (const forbidden of ["Phase31Admin!2026", "Phase31Priest!2026", "Phase31Organist!2026", "Phase31InactiveReset!2026", "ORGANY_BOOTSTRAP_ADMIN_PASSWORD", "ORGANY_RECOVERY_PASSWORD"]) {
  assert.ok(!envExample.includes(forbidden), `.env.example must not contain ${forbidden}`);
}

const pass = spawnSync(process.execPath, ["--import", "tsx", "scripts/production-preflight.ts"], {
  encoding: "utf8",
  env: {
    ...process.env,
    ORGANY_RUNTIME: "db",
    DATABASE_URL: SENSITIVE_DATABASE,
    BETTER_AUTH_SECRET: SENSITIVE_SECRET,
    BETTER_AUTH_URL: "https://organy.example.test",
    RESEND_API_KEY: "re_phase_31_32_safe_test_key",
    CONGREGATION_EMAIL_FROM: "Organy App <preferences@organy.example.test>",
    CONGREGATION_BASE_URL: "https://organy.example.test",
    CONGREGATION_SECURITY_SECRET: "phase-31-32-congregation-secret-0123456789",
  },
});
assert.equal(pass.status, 0, pass.stderr);
assert.match(pass.stdout, /preflight: PASS/);
assert.ok(!(pass.stdout + pass.stderr).includes(SENSITIVE_SECRET));
assert.ok(!(pass.stdout + pass.stderr).includes(SENSITIVE_DATABASE));

const failEnv = { ...process.env };
delete failEnv.BETTER_AUTH_URL;
Object.assign(failEnv, {
  ORGANY_RUNTIME: "db",
  DATABASE_URL: SENSITIVE_DATABASE,
  BETTER_AUTH_SECRET: SENSITIVE_SECRET,
  RESEND_API_KEY: "re_phase_31_32_safe_test_key",
  CONGREGATION_EMAIL_FROM: "Organy App <preferences@organy.example.test>",
  CONGREGATION_BASE_URL: "https://organy.example.test",
  CONGREGATION_SECURITY_SECRET: "phase-31-32-congregation-secret-0123456789",
});
const fail = spawnSync(process.execPath, ["--import", "tsx", "scripts/production-preflight.ts"], { encoding: "utf8", env: failEnv });
assert.notEqual(fail.status, 0);
assert.match(fail.stderr, /BETTER_AUTH_URL/);
assert.ok(!(fail.stdout + fail.stderr).includes(SENSITIVE_SECRET));
assert.ok(!(fail.stdout + fail.stderr).includes(SENSITIVE_DATABASE));

console.log("Phase 31.32 production runtime preflight acceptance: PASS");
