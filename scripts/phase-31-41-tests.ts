import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { auth, authPool } from "../src/auth/server";
import { ProtectedActorError, resolveProtectedUser } from "../src/application/protected-actor";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Phase 31.41 acceptance.`);
  return value;
}

const databaseUrl = required("DATABASE_URL");
const directUrl = required("DATABASE_URL_UNPOOLED");
required("BETTER_AUTH_SECRET");
required("BETTER_AUTH_URL");
const bootstrapScript = "scripts/production-protected-identity-bootstrap.ts";
const source = readFileSync(bootstrapScript, "utf8");
const runbook = readFileSync("docs/production-protected-identity-bootstrap-runbook.md", "utf8");

for (const forbidden of ["demo-admin-user", "demo-priest-user", "demo-organist-user", "Demo Admin", "Demo Priest", "Demo Organist"]) {
  assert.equal(source.includes(forbidden), false, `Production bootstrap must not contain demo fallback ${forbidden}`);
}
for (const requiredText of [
  "DATABASE_URL_UNPOOLED",
  "ORGANY_BOOTSTRAP_ACTOR_ID",
  "ORGANY_BOOTSTRAP_DISPLAY_NAME",
  "ORGANY_BOOTSTRAP_USERNAME",
  "ORGANY_BOOTSTRAP_PASSWORD",
  "ORGANY_BOOTSTRAP_ROLES",
  "ORGANY_BOOTSTRAP_PERSON_ID",
  "ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY",
  "--apply",
  "exact accepted Production Reference snapshot",
  "partial or unexpected identity state",
  "password and identity state were not overwritten",
]) {
  assert.ok(source.includes(requiredText), `Production bootstrap source must contain ${requiredText}`);
}
for (const requiredText of [
  "Contract Gate #196",
  "dry-run",
  "must never be pasted into chat",
  "direct/unpooled",
  "no demo/default identity fallback",
  "--apply",
  "sign-in",
  "sign-out",
]) {
  assert.ok(runbook.includes(requiredText), `Phase 31.41 runbook must contain ${requiredText}`);
}
assert.equal(/postgres(?:ql)?:\/\/[^\s<]+/i.test(runbook), false, "runbook must not contain a concrete PostgreSQL URL");
assert.equal(/ORGANY_BOOTSTRAP_PASSWORD\s*=\s*[^<\s`]+/i.test(runbook), false, "runbook must not contain a concrete bootstrap password");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const baseEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  DATABASE_URL_UNPOOLED: directUrl,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL!,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
};
const adminPassword = "Phase31-41-Admin-Initial!";
const adminEnv = {
  ...baseEnv,
  ORGANY_BOOTSTRAP_ACTOR_ID: "acceptance-admin-actor",
  ORGANY_BOOTSTRAP_DISPLAY_NAME: "Acceptance Admin",
  ORGANY_BOOTSTRAP_USERNAME: "acceptance.admin",
  ORGANY_BOOTSTRAP_ROLES: "admin",
};
const organistEnv = {
  ...baseEnv,
  ORGANY_BOOTSTRAP_ACTOR_ID: "acceptance-organist-actor",
  ORGANY_BOOTSTRAP_DISPLAY_NAME: "Acceptance Organist",
  ORGANY_BOOTSTRAP_USERNAME: "acceptance.organist",
  ORGANY_BOOTSTRAP_ROLES: "organist",
  ORGANY_BOOTSTRAP_PERSON_ID: "acceptance-organist-person",
  ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME: "Acceptance Organist Person",
  ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY: "organist",
  ORGANY_BOOTSTRAP_PASSWORD: "Phase31-41-Organist-Initial!",
};

function bootstrap(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(npx, ["tsx", bootstrapScript, ...args], { env, stdio: "pipe" });
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  const cookie = values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  assert.ok(cookie, "successful protected sign-in must return a session cookie");
  return cookie;
}

async function identityCounts(db: Pool) {
  return (await db.query(`
    select
      (select count(*)::int from app_users) app_users,
      (select count(*)::int from app_user_roles) app_user_roles,
      (select count(*)::int from catalog_persons) catalog_persons,
      (select count(*)::int from auth_users) auth_users,
      (select count(*)::int from auth_accounts) auth_accounts,
      (select count(*)::int from protected_account_actor_links) links,
      (select count(*)::int from auth_sessions) sessions,
      (select count(*)::int from auth_verifications) verifications
  `)).rows[0];
}

async function main() {
  const db = new Pool({ connectionString: databaseUrl });
  try {
    const initial = await identityCounts(db);
    for (const key of Object.keys(initial)) assert.equal(Number(initial[key]), 0, `initial ${key} must be zero`);

    bootstrap([], adminEnv);
    const afterDryRun = await identityCounts(db);
    for (const key of Object.keys(afterDryRun)) assert.equal(Number(afterDryRun[key]), 0, `dry-run must not write ${key}`);

    bootstrap(["--apply"], { ...adminEnv, ORGANY_BOOTSTRAP_PASSWORD: adminPassword });
    const afterAdmin = await identityCounts(db);
    assert.equal(Number(afterAdmin.app_users), 1);
    assert.equal(Number(afterAdmin.app_user_roles), 1);
    assert.equal(Number(afterAdmin.catalog_persons), 0, "admin-only bootstrap must not invent a Person");
    assert.equal(Number(afterAdmin.auth_users), 1);
    assert.equal(Number(afterAdmin.auth_accounts), 1);
    assert.equal(Number(afterAdmin.links), 1);
    assert.equal(Number(afterAdmin.sessions), 0, "signup session must be removed");
    assert.equal(Number(afterAdmin.verifications), 0);

    const adminRow = (await db.query(`
      select u.id actor_id, u.display_name, u.active, au.username, r.role, au.email, aa.password
      from app_users u
      join app_user_roles r on r.user_id=u.id
      join protected_account_actor_links l on l.app_user_id=u.id
      join auth_users au on au.id=l.auth_user_id
      join auth_accounts aa on aa.user_id=au.id and aa.provider_id='credential'
      where u.id='acceptance-admin-actor'
    `)).rows[0];
    assert.equal(adminRow.actor_id, "acceptance-admin-actor");
    assert.equal(adminRow.display_name, "Acceptance Admin");
    assert.equal(adminRow.active, true);
    assert.equal(adminRow.username, "acceptance.admin");
    assert.equal(adminRow.role, "admin");
    assert.match(String(adminRow.email), /^protected-[0-9a-f-]+@organy\.invalid$/i);
    const originalHash = String(adminRow.password);
    assert.ok(originalHash.length > 20, "credential password must be stored as a hash");

    bootstrap(["--apply"], { ...adminEnv, ORGANY_BOOTSTRAP_PASSWORD: "Phase31-41-Must-Not-Overwrite!" });
    const unchangedHash = String((await db.query(`
      select aa.password
      from auth_accounts aa
      join protected_account_actor_links l on l.auth_user_id=aa.user_id
      where l.app_user_id='acceptance-admin-actor' and aa.provider_id='credential'
    `)).rows[0].password);
    assert.equal(unchangedHash, originalHash, "idempotent rerun must not overwrite the established password");

    const signIn = await auth.api.signInUsername({ body: { username: "acceptance.admin", password: adminPassword }, asResponse: true });
    assert.equal(signIn.status, 200, "initial admin credentials must sign in through Better Auth");
    const cookie = cookieHeader(signIn);
    const headers = new Headers({ cookie });
    const resolved = await resolveProtectedUser(headers, db);
    assert.equal(resolved.id, "acceptance-admin-actor");
    assert.deepEqual(resolved.roles, ["admin"]);

    const signOut = await auth.api.signOut({ headers, asResponse: true });
    assert.equal(signOut.status, 200, "protected sign-out must succeed");
    let signedOutError: unknown;
    try { await resolveProtectedUser(headers, db); } catch (error) { signedOutError = error; }
    assert.ok(signedOutError instanceof ProtectedActorError);
    assert.equal(signedOutError.code, "unauthenticated");
    assert.equal(Number((await db.query("select count(*)::int n from auth_sessions")).rows[0].n), 0, "sign-out must leave no acceptance session");

    bootstrap([], organistEnv);
    bootstrap(["--apply"], organistEnv);
    const organist = (await db.query(`
      select u.id actor_id, u.person_id, r.role, p.display_name person_display_name, p.priest, p.organist
      from app_users u
      join app_user_roles r on r.user_id=u.id
      join catalog_persons p on p.id=u.person_id
      where u.id='acceptance-organist-actor'
    `)).rows[0];
    assert.equal(organist.actor_id, "acceptance-organist-actor");
    assert.equal(organist.person_id, "acceptance-organist-person");
    assert.equal(organist.role, "organist");
    assert.equal(organist.person_display_name, "Acceptance Organist Person");
    assert.equal(organist.priest, false);
    assert.equal(organist.organist, true);

    const missingExplicitIdentity = spawnSync(npx, ["tsx", bootstrapScript], {
      env: {
        ...baseEnv,
        ORGANY_BOOTSTRAP_ACTOR_ID: "",
        ORGANY_BOOTSTRAP_DISPLAY_NAME: "",
        ORGANY_BOOTSTRAP_USERNAME: "",
        ORGANY_BOOTSTRAP_ROLES: "",
      },
      encoding: "utf8",
    });
    assert.notEqual(missingExplicitIdentity.status, 0, "Production bootstrap must fail closed when explicit identity input is absent");

    const reference = (await db.query(`
      select
        (select count(*)::int from reference_catalog_songs) songs,
        (select count(*)::int from reference_antiphons) antiphons,
        (select count(*)::int from reference_melody_classes) melody_classes,
        (select count(*)::int from reference_song_melody_memberships) memberships,
        (select count(*)::int from reference_thematic_sections) thematic_sections,
        (select count(*)::int from reference_thematic_ranges) thematic_ranges,
        (select count(*)::int from melody_non_repetition_config where id='global' and months=2) config_ok,
        (select count(*)::int from preference_profiles) preferences,
        (select count(*)::int from reference_organist_repertoire) repertoire,
        (select count(*)::int from service_contexts) services
    `)).rows[0];
    assert.equal(Number(reference.songs), 1798);
    assert.equal(Number(reference.antiphons), 232);
    assert.equal(Number(reference.melody_classes), 1798);
    assert.equal(Number(reference.memberships), 1798);
    assert.equal(Number(reference.thematic_sections), 71);
    assert.equal(Number(reference.thematic_ranges), 71);
    assert.equal(Number(reference.config_ok), 1);
    assert.equal(Number(reference.preferences), 0);
    assert.equal(Number(reference.repertoire), 0);
    assert.equal(Number(reference.services), 0);

    console.log("Phase 31.41 protected Production identity bootstrap acceptance: PASS");
    console.log("Explicit dry-run/apply, idempotent password preservation, Person linkage, sign-in/sign-out, and Production data isolation verified.");
  } finally {
    await db.end();
    await authPool.end().catch(() => undefined);
  }
}

main().catch(async (error) => {
  console.error("Phase 31.41 protected Production identity bootstrap acceptance: FAIL");
  console.error(error);
  await authPool.end().catch(() => undefined);
  process.exitCode = 1;
});