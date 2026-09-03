import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { POST as congregationPost } from "../app/api/congregation-preferences/route";
import { POST as interactionPost } from "../app/api/interaction/route";
import { PostgresCongregationPreferenceService } from "../src/application/congregation-preference-voter";
import { PostgresReferenceCatalogProvider } from "../src/application/postgres-reference-catalog";
import { seedDemoInteractionKnowledge } from "../src/application/interaction-seed";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Phase 31.29 acceptance.`);
  return value;
}

const databaseUrl = requiredEnv("DATABASE_URL");
const referenceSongId = "czech:999999";
const polishReferenceSongId = "polish:999998";
const phaseReferenceSongIds = [referenceSongId, polishReferenceSongId];
const createdVoterIds = new Set<string>();

function formRequest(fields: Record<string, string>, cookie?: string) {
  const body = new URLSearchParams(fields);
  return new NextRequest("http://localhost/api/congregation-preferences", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie ? { cookie } : {}),
    },
    body,
  });
}

function congregationJsonRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/congregation-preferences", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function interactionRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/interaction", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function responseCookie(response: Response): string {
  const raw = response.headers.get("set-cookie");
  assert.ok(raw, "nickname entry must set a voter context cookie");
  const first = raw.split(";", 1)[0];
  assert.match(first, /^organy_congregation_voter=congregation-voter%3A|^organy_congregation_voter=congregation-voter:/);
  const [name, value] = first.split("=", 2);
  const decoded = decodeURIComponent(value);
  createdVoterIds.add(decoded);
  return `${name}=${value}`;
}

function tokenFromCookie(cookie: string): string {
  return decodeURIComponent(cookie.split("=", 2)[1]);
}

async function main() {
  const db = new Pool({ connectionString: databaseUrl });
  try {
    await seedDemoInteractionKnowledge(db);
    await db.query(
      `insert into reference_catalog_songs (id, language, canonical_number, source_id, title, source_url)
       values
         ($1, 'czech', 999999, 'phase-31-29-acceptance-cz', 'Phase 31.29 acceptance Czech song', 'https://example.invalid/czech'),
         ($2, 'polish', 999998, 'phase-31-29-acceptance-pl', 'Phase 31.29 acceptance Polish song', 'https://example.invalid/polish')
       on conflict (id) do nothing`,
      phaseReferenceSongIds,
    );

    const catalog = new PostgresReferenceCatalogProvider(db);
    const allCatalog = await catalog.listAll("all");
    assert.ok(allCatalog.some((record) => record.id === referenceSongId && record.sourceUrl === "https://example.invalid/czech"));
    assert.ok(allCatalog.some((record) => record.id === polishReferenceSongId && record.language === "polish"));
    assert.ok((await catalog.listAll("czech")).every((record) => record.language === "czech"));
    assert.ok((await catalog.listAll("polish")).every((record) => record.language === "polish"));

    const authCountsBefore = await authCounts(db);

    const blank = await congregationPost(formRequest({ action: "enterNickname", nickname: "   " }));
    assert.equal(blank.status, 400, "blank-after-trim nickname is rejected");

    const enterA = await congregationPost(formRequest({ action: "enterNickname", nickname: "  Phase31 Member A  " }));
    assert.equal(enterA.status, 303, "first valid nickname entry creates a voter context");
    const cookieA = responseCookie(enterA);
    const tokenA = tokenFromCookie(cookieA);
    const service = new PostgresCongregationPreferenceService(db);
    const contextA = await service.resolveContext(tokenA);
    assert.equal(contextA.nickname, "Phase31 Member A", "nickname normalization trims only surrounding whitespace");
    assert.equal(contextA.role, "congregationMember");

    const actorA = await db.query("select display_name, active from app_users where id = $1", [contextA.userId]);
    assert.equal(actorA.rows.length, 1);
    assert.equal(actorA.rows[0].display_name, "Phase31 Member A");
    assert.equal(actorA.rows[0].active, true);
    const rolesA = await db.query("select role from app_user_roles where user_id = $1 order by role", [contextA.userId]);
    assert.deepEqual(rolesA.rows.map((row) => row.role), ["congregation_member"], "nickname voter has exactly one congregation-member role");
    const profileA = await db.query("select id, category from preference_profiles where user_id = $1", [contextA.userId]);
    assert.equal(profileA.rows.length, 1);
    assert.equal(profileA.rows[0].id, contextA.profileId);
    assert.equal(profileA.rows[0].category, "congregation_member");
    assert.equal(Number((await db.query("select count(*)::int n from protected_account_actor_links where app_user_id = $1", [contextA.userId])).rows[0].n), 0);
    assert.deepEqual(await authCounts(db), authCountsBefore, "nickname entry creates no Better Auth account, link, or session");

    const enterAAgain = await congregationPost(formRequest({ action: "enterNickname", nickname: "Phase31 Member A" }));
    assert.equal(enterAAgain.status, 303);
    const cookieAAgain = responseCookie(enterAAgain);
    assert.equal(tokenFromCookie(cookieAAgain), tokenA, "same accepted nickname reuses the same Actor context");
    assert.equal(Number((await db.query("select count(*)::int n from app_users where id = $1", [contextA.userId])).rows[0].n), 1);

    const enterB = await congregationPost(formRequest({ action: "enterNickname", nickname: "Phase31 Member B" }));
    assert.equal(enterB.status, 303);
    const cookieB = responseCookie(enterB);
    const tokenB = tokenFromCookie(cookieB);
    const contextB = await service.resolveContext(tokenB);
    assert.notEqual(contextB.userId, contextA.userId, "different nicknames create distinct voter profiles");
    assert.equal((await service.getOwnReferencePreference(tokenB, referenceSongId)).score, null);

    const noContextSave = await congregationPost(formRequest({ action: "saveOwnPreference", referenceSongId, score: "1" }));
    assert.equal(noContextSave.status, 401, "own-preference mutation requires an entered nickname context");

    const invalidScore = await congregationPost(formRequest({ action: "saveOwnPreference", referenceSongId, score: "2" }, cookieA));
    assert.equal(invalidScore.status, 400, "congregation preference is restricted to 0..1");

    const saveA = await congregationPost(formRequest({
      action: "saveOwnPreference",
      referenceSongId,
      score: "1",
      userId: contextB.userId,
      role: "admin",
    }, cookieA));
    assert.equal(saveA.status, 303, "client-supplied foreign identity fields are not authorization authority");
    assert.equal((await service.getOwnReferencePreference(tokenA, referenceSongId)).score, 1);
    assert.deepEqual(
      (await service.listOwnReferencePreferences(tokenA)).filter((entry) => phaseReferenceSongIds.includes(entry.referenceSongId)),
      [{ referenceSongId, score: 1 }],
      "voter workspace can load the complete existing own-preference set",
    );
    assert.equal((await service.getOwnReferencePreference(tokenB, referenceSongId)).score, null, "voter A cannot mutate voter B through the own-preference boundary");
    assert.deepEqual((await db.query("select role from app_user_roles where user_id = $1 order by role", [contextA.userId])).rows.map((row) => row.role), ["congregation_member"], "nickname flow cannot grant protected roles");

    const jsonOff = await congregationPost(congregationJsonRequest({
      action: "saveOwnPreference",
      referenceSongId,
      score: 0,
      userId: contextB.userId,
      role: "admin",
    }, cookieA));
    assert.equal(jsonOff.status, 200, "toggle JSON save returns an in-place response");
    assert.deepEqual((await jsonOff.json()).preference, { referenceSongId, score: 0 });
    assert.equal((await service.getOwnReferencePreference(tokenA, referenceSongId)).score, 0);
    assert.equal((await service.getOwnReferencePreference(tokenB, referenceSongId)).score, null, "JSON toggle cannot mutate another nickname");

    const jsonOn = await congregationPost(congregationJsonRequest({
      action: "saveOwnPreference",
      referenceSongId,
      score: 1,
    }, cookieA));
    assert.equal(jsonOn.status, 200);
    assert.deepEqual((await jsonOn.json()).preference, { referenceSongId, score: 1 });

    const saveB = await congregationPost(formRequest({ action: "saveOwnPreference", referenceSongId, score: "0" }, cookieB));
    assert.equal(saveB.status, 303);
    assert.equal((await service.getOwnReferencePreference(tokenB, referenceSongId)).score, 0);
    assert.equal((await service.getOwnReferencePreference(tokenA, referenceSongId)).score, 1, "different nickname preferences remain separate");

    const protectedAttempt = await interactionPost(interactionRequest({
      action: "setMelodyWindow",
      input: { months: 1 },
      actor: { role: "admin" },
    }, cookieA));
    assert.equal(protectedAttempt.status, 401, "nickname voter cookie is never a protected staff session");
    assert.deepEqual(await authCounts(db), authCountsBefore, "nickname voting leaves Better Auth persistence untouched");

    const clear = await congregationPost(formRequest({ action: "clearNickname" }, cookieA));
    assert.equal(clear.status, 303);
    assert.match(clear.headers.get("set-cookie") ?? "", /organy_congregation_voter=;/, "changing nickname clears the browser voter context");

    console.log("Phase 31.29 nickname-only congregation preference voter acceptance: PASS");
  } finally {
    if (createdVoterIds.size > 0) await db.query("delete from app_users where id = any($1::text[])", [[...createdVoterIds]]).catch(() => undefined);
    await db.query(
      "delete from reference_catalog_songs where id = any($1::text[]) and source_id like 'phase-31-29-acceptance-%'",
      [phaseReferenceSongIds],
    ).catch(() => undefined);
    await db.end();
  }
}

async function authCounts(db: Pool) {
  const [users, accounts, sessions, links] = await Promise.all([
    db.query("select count(*)::int n from auth_users"),
    db.query("select count(*)::int n from auth_accounts"),
    db.query("select count(*)::int n from auth_sessions"),
    db.query("select count(*)::int n from protected_account_actor_links"),
  ]);
  return {
    users: Number(users.rows[0].n),
    accounts: Number(accounts.rows[0].n),
    sessions: Number(sessions.rows[0].n),
    links: Number(links.rows[0].n),
  };
}

main().catch((error) => {
  console.error("Phase 31.29 nickname-only congregation preference voter acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
});
