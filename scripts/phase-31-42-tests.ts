import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Phase 31.42 acceptance.`);
  return value;
}

const databaseUrl = required("DATABASE_URL");
const directUrl = required("DATABASE_URL_UNPOOLED");
const secret = required("BETTER_AUTH_SECRET");
const authUrl = required("BETTER_AUTH_URL");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const bootstrapScript = "scripts/production-protected-identity-bootstrap.ts";
const baseEnv = { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: directUrl, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: authUrl };

const adminPassword = "Phase31-42-Admin-Initial!";
const priestPassword = "Phase31-42-Priest-Initial!";
const adminEnv = {
  ...baseEnv,
  ORGANY_BOOTSTRAP_ACTOR_ID: "staff-phase-31-42-admin",
  ORGANY_BOOTSTRAP_DISPLAY_NAME: "Phase 31.42 Admin",
  ORGANY_BOOTSTRAP_USERNAME: "phase3142admin",
  ORGANY_BOOTSTRAP_ROLES: "admin,organist",
  ORGANY_BOOTSTRAP_PERSON_ID: "person-phase-31-42-admin",
  ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME: "Phase 31.42 Admin",
  ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY: "organist",
};
const priestEnv = {
  ...baseEnv,
  ORGANY_BOOTSTRAP_ACTOR_ID: "staff-phase-31-42-priest",
  ORGANY_BOOTSTRAP_DISPLAY_NAME: "Phase 31.42 Priest",
  ORGANY_BOOTSTRAP_USERNAME: "phase3142priest",
  ORGANY_BOOTSTRAP_ROLES: "priest",
  ORGANY_BOOTSTRAP_PERSON_ID: "person-phase-31-42-priest",
  ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME: "Phase 31.42 Priest",
  ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY: "priest",
};

function bootstrap(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(npx, ["tsx", bootstrapScript, ...args], { env, stdio: "pipe" });
}

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).sort();
  return String(value ?? "").replace(/[{}]/g, "").split(",").map((item) => item.trim()).filter(Boolean).sort();
}

async function counts(db: Pool) {
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
    bootstrap(["--apply"], { ...adminEnv, ORGANY_BOOTSTRAP_PASSWORD: adminPassword });
    assert.deepEqual(await counts(db), {
      app_users: 1,
      app_user_roles: 2,
      catalog_persons: 1,
      auth_users: 1,
      auth_accounts: 1,
      links: 1,
      sessions: 0,
      verifications: 0,
    });

    const adminBefore = (await db.query(`
      select au.username, aa.password,
        array_agg(r.role order by r.role) roles,
        u.person_id, p.priest, p.organist
      from app_users u
      join app_user_roles r on r.user_id=u.id
      join protected_account_actor_links l on l.app_user_id=u.id
      join auth_users au on au.id=l.auth_user_id
      join auth_accounts aa on aa.user_id=au.id and aa.provider_id='credential'
      join catalog_persons p on p.id=u.person_id
      where u.id=$1
      group by u.id,au.id,aa.id,p.id
    `, [adminEnv.ORGANY_BOOTSTRAP_ACTOR_ID])).rows[0];
    assert.equal(adminBefore.username, adminEnv.ORGANY_BOOTSTRAP_USERNAME);
    assert.deepEqual(normalizeTextArray(adminBefore.roles), ["admin", "organist"]);
    assert.equal(adminBefore.person_id, adminEnv.ORGANY_BOOTSTRAP_PERSON_ID);
    assert.equal(adminBefore.priest, false);
    assert.equal(adminBefore.organist, true);
    const adminPasswordHash = String(adminBefore.password);

    bootstrap([], priestEnv);
    assert.deepEqual(await counts(db), {
      app_users: 1,
      app_user_roles: 2,
      catalog_persons: 1,
      auth_users: 1,
      auth_accounts: 1,
      links: 1,
      sessions: 0,
      verifications: 0,
    }, "priest dry-run must not write identity rows");

    bootstrap(["--apply"], { ...priestEnv, ORGANY_BOOTSTRAP_PASSWORD: priestPassword });
    assert.deepEqual(await counts(db), {
      app_users: 2,
      app_user_roles: 3,
      catalog_persons: 2,
      auth_users: 2,
      auth_accounts: 2,
      links: 2,
      sessions: 0,
      verifications: 0,
    });

    const priest = (await db.query(`
      select u.id actor_id, u.display_name, u.active, u.person_id, p.display_name person_display_name,
        p.priest, p.organist, au.username, aa.password,
        array_agg(r.role order by r.role) roles
      from app_users u
      join catalog_persons p on p.id=u.person_id
      join protected_account_actor_links l on l.app_user_id=u.id
      join auth_users au on au.id=l.auth_user_id
      join auth_accounts aa on aa.user_id=au.id and aa.provider_id='credential'
      join app_user_roles r on r.user_id=u.id
      where u.id=$1
      group by u.id,p.id,au.id,aa.id
    `, [priestEnv.ORGANY_BOOTSTRAP_ACTOR_ID])).rows[0];
    assert.equal(priest.actor_id, priestEnv.ORGANY_BOOTSTRAP_ACTOR_ID);
    assert.equal(priest.display_name, priestEnv.ORGANY_BOOTSTRAP_DISPLAY_NAME);
    assert.equal(priest.active, true);
    assert.equal(priest.person_id, priestEnv.ORGANY_BOOTSTRAP_PERSON_ID);
    assert.equal(priest.person_display_name, priestEnv.ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME);
    assert.equal(priest.priest, true);
    assert.equal(priest.organist, false);
    assert.equal(priest.username, priestEnv.ORGANY_BOOTSTRAP_USERNAME);
    assert.deepEqual(normalizeTextArray(priest.roles), ["priest"]);
    const priestPasswordHash = String(priest.password);
    assert.ok(priestPasswordHash.length > 20);

    const adminAfter = (await db.query(`
      select aa.password, array_agg(r.role order by r.role) roles
      from app_users u
      join app_user_roles r on r.user_id=u.id
      join protected_account_actor_links l on l.app_user_id=u.id
      join auth_accounts aa on aa.user_id=l.auth_user_id and aa.provider_id='credential'
      where u.id=$1
      group by aa.id
    `, [adminEnv.ORGANY_BOOTSTRAP_ACTOR_ID])).rows[0];
    assert.equal(String(adminAfter.password), adminPasswordHash, "priest bootstrap must not overwrite the existing admin credential");
    assert.deepEqual(normalizeTextArray(adminAfter.roles), ["admin", "organist"], "priest bootstrap must not alter existing admin roles");

    bootstrap(["--apply"], { ...priestEnv, ORGANY_BOOTSTRAP_PASSWORD: "Phase31-42-Must-Not-Overwrite!" });
    const priestHashAfterRerun = String((await db.query(`
      select aa.password from auth_accounts aa
      join protected_account_actor_links l on l.auth_user_id=aa.user_id
      where l.app_user_id=$1 and aa.provider_id='credential'
    `, [priestEnv.ORGANY_BOOTSTRAP_ACTOR_ID])).rows[0].password);
    assert.equal(priestHashAfterRerun, priestPasswordHash, "idempotent priest rerun must not overwrite the established password");

    const reference = (await db.query(`
      select
        (select count(*)::int from reference_catalog_songs) songs,
        (select count(*)::int from reference_antiphons) antiphons,
        (select count(*)::int from reference_melody_classes) melody_classes,
        (select count(*)::int from reference_melody_edges) melody_edges,
        (select count(*)::int from reference_song_melody_memberships) memberships,
        (select count(*)::int from reference_thematic_parents) thematic_parents,
        (select count(*)::int from reference_thematic_sections) thematic_sections,
        (select count(*)::int from reference_thematic_ranges) thematic_ranges,
        (select count(*)::int from melody_non_repetition_config where id='global' and months=2) config_ok,
        (select count(*)::int from service_contexts) service_contexts,
        (select count(*)::int from service_sets) service_sets,
        (select count(*)::int from completed_services) completed_services,
        (select count(*)::int from song_preferences) song_preferences,
        (select count(*)::int from organist_repertoire) organist_repertoire,
        (select count(*)::int from reference_antiphon_recommendations) recommendations
    `)).rows[0];
    assert.deepEqual(reference, {
      songs: 1798,
      antiphons: 232,
      melody_classes: 1798,
      melody_edges: 0,
      memberships: 1798,
      thematic_parents: 6,
      thematic_sections: 71,
      thematic_ranges: 71,
      config_ok: 1,
      service_contexts: 0,
      service_sets: 0,
      completed_services: 0,
      song_preferences: 0,
      organist_repertoire: 0,
      recommendations: 0,
    });

    console.log("Phase 31.42 Production priest identity handoff acceptance: PASS");
    console.log("Second protected identity dry-run/apply, existing-admin preservation, priest Person linkage, idempotence, and Production data isolation verified.");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("Phase 31.42 Production priest identity handoff acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
});
