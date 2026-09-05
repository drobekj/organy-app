import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { congregationVoterMode, isTemporaryCongregationVoterMode } from "../src/application/congregation-voter-mode";
import {
  createTemporaryCongregationVoterSession,
  TEMPORARY_VOTER_SESSION_TTL_SECONDS,
} from "../src/application/temporary-congregation-voter";

type QueryCall = { sql: string; params: unknown[] };
const calls: QueryCall[] = [];
let released = false;
const client = {
  async query(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    return { rows: [] };
  },
  release() { released = true; },
};
const pool = { connect: async () => client } as unknown as Pool;
const now = new Date("2026-09-05T05:00:00.000Z");

assert.equal(congregationVoterMode(), "temporaryBrowser");
assert.equal(isTemporaryCongregationVoterMode(), true);
assert.equal(TEMPORARY_VOTER_SESSION_TTL_SECONDS, 180 * 24 * 60 * 60);

const session = await createTemporaryCongregationVoterSession(pool, { now: () => now });
assert.match(session.token, /^cvs_[A-Za-z0-9_-]{40,}$/);
assert.equal(session.expiresAt.getTime(), now.getTime() + TEMPORARY_VOTER_SESSION_TTL_SECONDS * 1000);
assert.equal(released, true);
assert.equal(calls[0]?.sql, "begin");
assert.equal(calls.at(-1)?.sql, "commit");
assert.equal(calls.some((call) => call.sql === "rollback"), false);

const accountInsert = calls.find((call) => call.sql.includes("insert into congregation_voter_accounts"));
assert.ok(accountInsert, "temporary voter account insert is required");
assert.match(String(accountInsert.params[0]), /^congregation-account:temporary:/);
assert.match(String(accountInsert.params[1]), /^congregation-voter:temporary:/);
assert.match(String(accountInsert.params[2]), /^Temporary voter /);
assert.match(accountInsert.sql, /'legacy_unverified',false/);

const userInsert = calls.find((call) => call.sql.includes("insert into app_users"));
const profileInsert = calls.find((call) => call.sql.includes("insert into preference_profiles"));
const sessionInsert = calls.find((call) => call.sql.includes("insert into congregation_voter_sessions"));
assert.ok(userInsert && profileInsert && sessionInsert, "stable user/profile/session rows are required");
assert.match(String(userInsert.params[0]), /^congregation-voter:temporary:/);
assert.match(String(profileInsert.params[0]), /^congregation-pref:temporary:/);
assert.match(String(sessionInsert.params[0]), /^congregation-session:temporary:/);
assert.equal(String(sessionInsert.params[2]).length, 64, "only a SHA-256 token hash is persisted");
assert.notEqual(sessionInsert.params[2], session.token);
assert.equal(JSON.stringify(calls).includes(session.token), false, "raw browser token must never enter SQL parameters");

const routeSource = readFileSync("app/api/congregation-preferences/route.ts", "utf8");
const confirmSource = readFileSync("app/api/congregation-preferences/confirm/route.ts", "utf8");
const pageSource = readFileSync("app/congregation-preferences/page.tsx", "utf8");
const temporarySource = readFileSync("src/application/temporary-congregation-voter.ts", "utf8");

assert.match(routeSource, /startTemporaryVoting/);
assert.match(routeSource, /Registration and nickname actions are disabled during temporary browser voting/);
assert.match(routeSource, /requireTemporaryVoter/);
assert.match(routeSource, /congregation-account:temporary:/);
assert.match(routeSource, /TEMPORARY_VOTER_SESSION_TTL_SECONDS/);
assert.match(confirmSource, /isTemporaryCongregationVoterMode\(\)/);
assert.match(pageSource, /Start voting/);
assert.match(pageSource, /no registration, nickname or email is required/i);
assert.match(pageSource, /TEMPORARY_ACCOUNT_PREFIX/);
assert.match(pageSource, /temporaryMode \? "Congregation Preferences" : voter\.nickname/);
assert.doesNotMatch(temporarySource, /RESEND_API_KEY|CONGREGATION_EMAIL_FROM|CONGREGATION_SECURITY_SECRET/);

console.log("Issue #435 temporary browser voter static acceptance: PASS");
