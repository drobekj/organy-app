import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");

const baseEnv = {
  ...process.env,
  DATABASE_URL_UNPOOLED: databaseUrl,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? randomBytes(48).toString("base64"),
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
};

function runBootstrap(identity: Record<string, string>, apply = false) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/production-protected-identity-bootstrap.ts", ...(apply ? ["--apply"] : [])],
    {
      cwd: process.cwd(),
      env: { ...baseEnv, ...identity },
      encoding: "utf8",
    },
  );
  return result;
}

const admin = {
  ORGANY_BOOTSTRAP_ACTOR_ID: "staff-phase-31-42-admin",
  ORGANY_BOOTSTRAP_DISPLAY_NAME: "Phase 31.42 Admin",
  ORGANY_BOOTSTRAP_USERNAME: "phase3142admin",
  ORGANY_BOOTSTRAP_ROLES: "admin,organist",
  ORGANY_BOOTSTRAP_PERSON_ID: "person-phase-31-42-admin",
  ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME: "Phase 31.42 Admin",
  ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY: "organist",
  ORGANY_BOOTSTRAP_PASSWORD: "phase-31-42-admin-password",
};

const priest = {
  ORGANY_BOOTSTRAP_ACTOR_ID: "staff-phase-31-42-priest",
  ORGANY_BOOTSTRAP_DISPLAY_NAME: "Phase 31.42 Priest",
  ORGANY_BOOTSTRAP_USERNAME: "phase3142priest",
  ORGANY_BOOTSTRAP_ROLES: "priest",
  ORGANY_BOOTSTRAP_PERSON_ID: "person-phase-31-42-priest",
  ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME: "Phase 31.42 Priest",
  ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY: "priest",
  ORGANY_BOOTSTRAP_PASSWORD: "phase-31-42-priest-password",
};

const pool = new Pool({ connectionString: databaseUrl });
try {
  const initialAdmin = runBootstrap(admin, true);
  assert.equal(initialAdmin.status, 0, initialAdmin.stderr || initialAdmin.stdout);
  assert.match(initialAdmin.stdout, /Protected Production identity bootstrap: PASS/);

  const priestDryRun = runBootstrap(priest, false);
  assert.equal(priestDryRun.status, 0, priestDryRun.stderr || priestDryRun.stdout);
  assert.match(priestDryRun.stdout, /Protected Production identity bootstrap preflight: PASS/);

  const beforePriest = await pool.query(`
    select
      (select count(*)::int from app_users) app_users,
      (select count(*)::int from auth_users) auth_users,
      (select count(*)::int from auth_accounts) auth_accounts,
      (select count(*)::int from protected_account_actor_links) links
  `);
  assert.deepEqual(beforePriest.rows[0], { app_users: 1, auth_users: 1, auth_accounts: 1, links: 1 });

  const priestApply = runBootstrap(priest, true);
  assert.equal(priestApply.status, 0, priestApply.stderr || priestApply.stdout);
  assert.match(priestApply.stdout, /Protected Production identity bootstrap: PASS/);

  const snapshot = await pool.query(`
    select
      (select count(*)::int from app_users) app_users,
      (select count(*)::int from app_user_roles) app_user_roles,
      (select count(*)::int from catalog_persons) catalog_persons,
      (select count(*)::int from auth_users) auth_users,
      (select count(*)::int from auth_accounts) auth_accounts,
      (select count(*)::int from protected_account_actor_links) links,
      (select count(*)::int from auth_sessions) sessions,
      (select count(*)::int from auth_verifications) verifications,
      (select count(*)::int from reference_catalog_songs) reference_songs,
      (select count(*)::int from reference_antiphons) reference_antiphons,
      (select count(*)::int from service_sets) service_sets,
      (select count(*)::int from song_preferences) song_preferences,
      (select count(*)::int from organist_repertoire) organist_repertoire
  `);
  assert.deepEqual(snapshot.rows[0], {
    app_users: 2,
    app_user_roles: 3,
    catalog_persons: 2,
    auth_users: 2,
    auth_accounts: 2,
    links: 2,
    sessions: 0,
    verifications: 0,
    reference_songs: 1798,
    reference_antiphons: 232,
    service_sets: 0,
    song_preferences: 0,
    organist_repertoire: 0,
  });

  const priestRow = await pool.query(`
    select u.id, u.display_name, u.active, u.person_id, p.priest, p.organist, au.username,
      array_agg(r.role order by r.role) roles
    from app_users u
    join catalog_persons p on p.id=u.person_id
    join protected_account_actor_links l on l.app_user_id=u.id
    join auth_users au on au.id=l.auth_user_id
    join app_user_roles r on r.user_id=u.id
    where u.id=$1
    group by u.id,p.id,au.id
  `, [priest.ORGANY_BOOTSTRAP_ACTOR_ID]);
  assert.equal(priestRow.rows.length, 1);
  assert.equal(priestRow.rows[0].display_name, priest.ORGANY_BOOTSTRAP_DISPLAY_NAME);
  assert.equal(priestRow.rows[0].active, true);
  assert.equal(priestRow.rows[0].person_id, priest.ORGANY_BOOTSTRAP_PERSON_ID);
  assert.equal(priestRow.rows[0].priest, true);
  assert.equal(priestRow.rows[0].organist, false);
  assert.equal(priestRow.rows[0].username, priest.ORGANY_BOOTSTRAP_USERNAME);
  assert.deepEqual(priestRow.rows[0].roles, ["priest"]);

  const adminRow = await pool.query(`
    select u.id, au.username, array_agg(r.role order by r.role) roles
    from app_users u
    join protected_account_actor_links l on l.app_user_id=u.id
    join auth_users au on au.id=l.auth_user_id
    join app_user_roles r on r.user_id=u.id
    where u.id=$1
    group by u.id,au.id
  `, [admin.ORGANY_BOOTSTRAP_ACTOR_ID]);
  assert.equal(adminRow.rows.length, 1);
  assert.equal(adminRow.rows[0].username, admin.ORGANY_BOOTSTRAP_USERNAME);
  assert.deepEqual(adminRow.rows[0].roles, ["admin", "organist"]);

  const priestRerun = runBootstrap({ ...priest, ORGANY_BOOTSTRAP_PASSWORD: "different-phase-31-42-password" }, true);
  assert.equal(priestRerun.status, 0, priestRerun.stderr || priestRerun.stdout);
  assert.match(priestRerun.stdout, /Protected Production identity bootstrap: PASS/);

  const finalCounts = await pool.query(`
    select
      (select count(*)::int from app_users) app_users,
      (select count(*)::int from auth_users) auth_users,
      (select count(*)::int from auth_accounts) auth_accounts,
      (select count(*)::int from protected_account_actor_links) links,
      (select count(*)::int from auth_sessions) sessions
  `);
  assert.deepEqual(finalCounts.rows[0], { app_users: 2, auth_users: 2, auth_accounts: 2, links: 2, sessions: 0 });

  console.log("Phase 31.42 Production priest identity handoff acceptance: PASS");
} finally {
  await pool.end();
}
