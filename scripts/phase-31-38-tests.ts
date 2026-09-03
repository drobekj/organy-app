import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { validateProductionRuntimeConfig } from "../src/config/production-runtime";

const SCRIPT = "scripts/production-first-migrate.ts";
const LOCAL_DIRECT_URL = process.env.DATABASE_URL_UNPOOLED;
const SENSITIVE_URL = "postgres://private-user:private-password@private-pooler.example.test/private-db";
const CONFIG_TABLE = "melody_non_repetition_config";
const REGISTRATION_CONFIG_TABLE = "congregation_registration_control";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args: string[], directUrl: string | undefined) {
  const env = { ...process.env };
  delete env.BETTER_AUTH_URL;
  if (directUrl === undefined) delete env.DATABASE_URL_UNPOOLED;
  else env.DATABASE_URL_UNPOOLED = directUrl;
  return spawnSync(npx, ["tsx", SCRIPT, ...args], { encoding: "utf8", env });
}

function output(result: ReturnType<typeof run>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function redactedOutput(result: ReturnType<typeof run>, urlText: string): string {
  let redacted = output(result).replaceAll(urlText, "<redacted-url>");
  try {
    const url = new URL(urlText);
    for (const value of [url.username, url.password, url.hostname]) {
      if (value) redacted = redacted.replaceAll(value, "<redacted>");
    }
  } catch {
    return "<redacted diagnostic unavailable>";
  }
  return redacted.trim();
}

async function publicTables(pool: Pool): Promise<string[]> {
  return (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => String(row.tablename));
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function assertOnlyReviewedMigrationData(pool: Pool): Promise<void> {
  const nonEmpty: string[] = [];
  for (const table of await publicTables(pool)) {
    const result = await pool.query(`select count(*)::int as n from public.${quoteIdentifier(table)}`);
    if (Number(result.rows[0]?.n ?? 0) !== 0) nonEmpty.push(table);
  }
  assert.deepEqual(nonEmpty, [REGISTRATION_CONFIG_TABLE, CONFIG_TABLE], "only the two reviewed migration-owned config tables may contain rows");
  const configRows = (await pool.query(`select id, months from public.${quoteIdentifier(CONFIG_TABLE)} order by id`)).rows;
  assert.deepEqual(configRows.map((row) => ({ id: String(row.id), months: Number(row.months) })), [{ id: "global", months: 2 }], "migration-owned config singleton must match the reviewed default");
  const registrationRows = (await pool.query(`select id, registration_frozen, bootstrap_completed_at from public.${quoteIdentifier(REGISTRATION_CONFIG_TABLE)} order by id`)).rows;
  assert.deepEqual(registrationRows, [{ id: "global", registration_frozen: false, bootstrap_completed_at: null }], "registration-control singleton must match the reviewed safe default");
}

async function main(): Promise<void> {
  assert.ok(LOCAL_DIRECT_URL, "Phase 31.38 acceptance requires DATABASE_URL_UNPOOLED for disposable PostgreSQL.");

  const scriptSource = readFileSync(SCRIPT, "utf8");
  assert.ok(scriptSource.includes("DATABASE_URL_UNPOOLED"));
  assert.ok(scriptSource.includes("--apply"));
  assert.ok(scriptSource.includes("direct/unpooled"));
  assert.ok(scriptSource.includes("melody_non_repetition_config"));
  assert.ok(!scriptSource.includes("BETTER_AUTH_URL"), "first-migration operator must not depend on BETTER_AUTH_URL");
  assert.ok(!scriptSource.includes("db:bootstrap:auth"));
  assert.ok(!scriptSource.includes("db:seed"));
  assert.ok(!scriptSource.includes("db:sync"));

  const missing = run([], undefined);
  assert.notEqual(missing.status, 0);
  assert.match(output(missing), /DATABASE_URL_UNPOOLED/);

  const pooled = run([], SENSITIVE_URL);
  assert.notEqual(pooled.status, 0);
  assert.match(output(pooled), /direct\/unpooled/);
  assert.ok(!output(pooled).includes(SENSITIVE_URL));
  assert.ok(!output(pooled).includes("private-password"));
  assert.ok(!output(pooled).includes("private-pooler.example.test"));

  const fullRuntimeWithoutAuthUrl = validateProductionRuntimeConfig({
    ORGANY_RUNTIME: "db",
    DATABASE_URL: "postgres://runtime.example.test/organy",
    BETTER_AUTH_SECRET: "phase-31-38-full-runtime-secret-0123456789abcdef",
  });
  assert.ok(fullRuntimeWithoutAuthUrl.some((issue) => issue.key === "BETTER_AUTH_URL"), "full runtime preflight must still require BETTER_AUTH_URL");

  const pool = new Pool({ connectionString: LOCAL_DIRECT_URL });
  try {
    assert.deepEqual(await publicTables(pool), [], "disposable Phase 31.38 target must start empty");

    const check = run([], LOCAL_DIRECT_URL);
    assert.equal(check.status, 0, `read-only migration preflight must pass against empty disposable PostgreSQL: ${redactedOutput(check, LOCAL_DIRECT_URL)}`);
    assert.match(check.stdout, /preflight: PASS/);
    assert.match(check.stdout, /no migration was applied/);
    assert.ok(!output(check).includes(LOCAL_DIRECT_URL), "read-only preflight must not echo the connection URL");
    assert.deepEqual(await publicTables(pool), [], "read-only first-migration preflight must not create schema");

    const apply = run(["--apply"], LOCAL_DIRECT_URL);
    assert.equal(apply.status, 0, `schema-only first migration must pass against empty disposable PostgreSQL: ${redactedOutput(apply, LOCAL_DIRECT_URL)}`);
    assert.match(apply.stdout, /First production schema migration: PASS/);
    assert.ok(!output(apply).includes(LOCAL_DIRECT_URL), "migration output must not echo the connection URL");

    const migratedTables = await publicTables(pool);
    assert.ok(migratedTables.length > 0, "reviewed Drizzle migrations must create the application schema");
    assert.ok(migratedTables.includes("auth_users"), "Better Auth application table must exist after migration");
    assert.ok(migratedTables.includes("app_users"), "application Actor table must exist after migration");
    await assertOnlyReviewedMigrationData(pool);
    assert.equal(Number((await pool.query("select count(*)::int n from auth_users")).rows[0].n), 0, "auth_users must remain empty");
    assert.equal(Number((await pool.query("select count(*)::int n from app_users")).rows[0].n), 0, "app_users must remain empty");

    const providerState = (await pool.query(`
      select
        exists(select 1 from pg_namespace where nspname='neon_auth') as neon_auth_schema,
        exists(select 1 from pg_roles where rolname='authenticated') as authenticated_role,
        exists(select 1 from pg_roles where rolname='anonymous') as anonymous_role
    `)).rows[0] as Record<string, boolean>;
    assert.equal(Boolean(providerState.neon_auth_schema), false);
    assert.equal(Boolean(providerState.authenticated_role), false);
    assert.equal(Boolean(providerState.anonymous_role), false);

    const repeated = run(["--apply"], LOCAL_DIRECT_URL);
    assert.notEqual(repeated.status, 0, "first-production migration must fail closed after schema already exists");
    assert.match(output(repeated), /already contains public application tables/);
    assert.ok(!output(repeated).includes(LOCAL_DIRECT_URL), "rejected rerun must not echo the connection URL");
  } finally {
    await pool.end();
  }

  console.log("Phase 31.38 first production Neon schema migration boundary acceptance: PASS");
  console.log("The operator path is direct/unpooled, schema-only, permits only the reviewed config singleton, and is independent of deferred BETTER_AUTH_URL.");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.38 first production Neon schema migration boundary acceptance: FAIL");
  if (error instanceof assert.AssertionError) console.error(error.message);
  else console.error("Unexpected acceptance failure.");
  process.exitCode = 1;
});
