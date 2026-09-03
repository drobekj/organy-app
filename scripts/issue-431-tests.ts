import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  CongregationVoterError,
  PostgresCongregationPreferenceService,
} from "../src/application/congregation-preference-voter";
import type {
  CongregationConfirmationMessage,
  CongregationRecoveryMessage,
  CongregationVoterMailer,
} from "../src/application/congregation-voter-mailer";
import { runCongregationRegistrationMaintenance } from "../src/application/congregation-registration-maintenance";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for issue 431 acceptance.");

class FakeMailer implements CongregationVoterMailer {
  confirmations: CongregationConfirmationMessage[] = [];
  recoveries: CongregationRecoveryMessage[] = [];
  fail = false;
  async sendConfirmation(message: CongregationConfirmationMessage) {
    if (this.fail) throw new Error("synthetic mail failure");
    this.confirmations.push(message);
  }
  async sendNicknameRecovery(message: CongregationRecoveryMessage) {
    if (this.fail) throw new Error("synthetic mail failure");
    this.recoveries.push(message);
  }
}

let now = new Date("2026-09-01T10:00:00.000Z");
const mailer = new FakeMailer();
const db = new Pool({ connectionString: databaseUrl });
const service = new PostgresCongregationPreferenceService(db, {
  mailer,
  canonicalBaseUrl: "http://localhost:3000",
  securitySecret: "issue-431-acceptance-security-secret-0123456789",
  now: () => new Date(now),
});

async function main() {
  await db.query(`insert into reference_catalog_songs (id, language, canonical_number, source_id, title)
    values ('czech:999999','czech',999999,'issue-431-song','Issue 431 song') on conflict (id) do nothing`);

  const appUsersBefore = await count("app_users");
  assert.deepEqual(await service.signIn("Missing voter"), { kind: "missing", nickname: "Missing voter" });
  assert.equal(await count("app_users"), appUsersBefore, "sign in never creates a voter");

  assert.deepEqual(await service.requestRegistration("  Voter One  ", "Voter.One+tag@Example.test", request("1")), { kind: "created" });
  assert.equal(mailer.confirmations.length, 1);
  assert.equal(await countWhere("congregation_voter_accounts", "status='pending'"), 1);
  assert.equal(await count("app_users"), appUsersBefore, "pending registration creates no voter identity");
  assert.equal((await service.signIn("voter one")).kind, "pending");
  assert.deepEqual(await service.requestRegistration("VOTER ONE", "voter.one+tag@example.test", request("2")), { kind: "awaitingConfirmation", nickname: "Voter One" });

  const firstToken = confirmationToken(mailer.confirmations.at(-1)!);
  assert.deepEqual(await service.resendConfirmation("voter one", request("3")), { kind: "sent" });
  const resentToken = confirmationToken(mailer.confirmations.at(-1)!);
  assert.notEqual(firstToken, resentToken);
  assert.deepEqual(await service.confirmRegistration(firstToken, request("4")), { kind: "invalid" }, "resend invalidates the previous link");
  const confirmed = await service.confirmRegistration(resentToken, request("5"));
  assert.equal(confirmed.kind, "confirmed");
  if (confirmed.kind !== "confirmed") throw new Error("new registration was not confirmed");
  assert.match(confirmed.session.context.userId, /^congregation-voter:[0-9a-f-]{36}$/);
  assert.match(confirmed.session.token, /^cvs_/);
  assert.equal((await db.query("select count(*)::int n from congregation_voter_sessions where token_hash=$1", [confirmed.session.token])).rows[0].n, 0, "raw session token is never stored");
  assert.deepEqual(await service.confirmRegistration(resentToken, request("6")), { kind: "alreadyConfirmed" });
  const signedIn = await service.signIn("VOTER ONE");
  assert.equal(signedIn.kind, "signedIn", "nickname comparison is case-insensitive");
  if (signedIn.kind !== "signedIn") throw new Error("active voter sign-in failed");
  await service.saveOwnReferencePreference(signedIn.session.token, "czech:999999", 1);
  assert.equal((await service.getOwnReferencePreference(signedIn.session.token, "czech:999999")).score, 1);
  assert.deepEqual(
    (await service.listOwnReferencePreferences(signedIn.session.token)).filter((entry) => entry.referenceSongId === "czech:999999"),
    [{ referenceSongId: "czech:999999", score: 1 }],
    "voter workspace can load the complete existing own-preference set",
  );
  assert.equal((await service.saveOwnReferencePreference(signedIn.session.token, "czech:999999", 0)).score, 0, "toggle JSON save returns an in-place response");
  const isolation = await service.requestRegistration("Isolated voter", "isolated@example.test", request("isolation-register"));
  assert.deepEqual(isolation, { kind: "created" });
  const isolatedConfirmation = await service.confirmRegistration(confirmationToken(mailer.confirmations.at(-1)!), request("isolation-confirm"));
  assert.equal(isolatedConfirmation.kind, "confirmed");
  if (isolatedConfirmation.kind !== "confirmed") throw new Error("isolated voter was not confirmed");
  assert.equal((await service.getOwnReferencePreference(isolatedConfirmation.session.token, "czech:999999")).score, null, "JSON toggle cannot mutate another nickname");

  assert.deepEqual(await service.requestRegistration("Voter One", "voter.one+tag@example.test", request("7")), { kind: "alreadyRegistered" });
  assert.deepEqual(await service.requestRegistration("Voter One", "different@example.test", request("8")), { kind: "reservedNickname" });
  assert.deepEqual(await service.requestRegistration("Different voter", "voter.one+tag@example.test", request("9")), { kind: "registeredEmail" });

  assert.deepEqual(await service.recoverNickname("VOTER.ONE+TAG@EXAMPLE.TEST", request("10")), { kind: "sent" });
  assert.equal(mailer.recoveries.at(-1)?.nickname, "Voter One");
  assert.deepEqual(await service.recoverNickname("missing@example.test", request("11")), { kind: "missing" });
  await expectVoterError(() => service.recoverNickname("invalid", request("12")), "invalidInput");

  mailer.fail = true;
  await expectVoterError(() => service.requestRegistration("Mail Failure", "mail-failure@example.test", request("13")), "mailUnavailable");
  assert.equal(await countWhere("congregation_voter_accounts", "nickname_normalized='mail failure' and status='pending'"), 1);
  assert.equal(await countWhere("app_users", "display_name='Mail Failure'"), 0, "mail failure never activates a voter");
  mailer.fail = false;

  assert.deepEqual(await service.requestRegistration("Expiring voter", "expiring@example.test", request("14")), { kind: "created" });
  const expiringToken = confirmationToken(mailer.confirmations.at(-1)!);
  now = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1);
  assert.equal((await service.confirmRegistration(expiringToken, request("15"))).kind, "expired");
  assert.deepEqual(await service.confirmRegistration("cvc_invalid_invalid_invalid_invalid_invalid_invalid", request("16")), { kind: "invalid" });

  await seedLegacy();
  const legacySignIn = await service.signIn("Legacy Voter");
  assert.equal(legacySignIn.kind, "signedIn");
  if (legacySignIn.kind !== "signedIn") throw new Error("legacy sign-in failed");
  assert.deepEqual(await service.requestRegistration("Legacy Voter", "legacy@example.test", request("17")), { kind: "reservedNickname" }, "remote legacy claim is rejected");
  assert.deepEqual(await service.requestRegistration("Legacy Voter", "legacy@example.test", { ...request("18"), currentSessionToken: legacySignIn.session.token }), { kind: "legacyClaimCreated" });
  const legacyToken = confirmationToken(mailer.confirmations.at(-1)!);
  const legacyConfirmed = await service.confirmRegistration(legacyToken, request("19"));
  assert.equal(legacyConfirmed.kind, "confirmed");
  const legacyState = (await db.query(`select a.user_id, p.id profile_id, rsp.score from congregation_voter_accounts a
    join preference_profiles p on p.user_id=a.user_id
    join reference_song_preferences rsp on rsp.profile_id=p.id and rsp.reference_song_id='czech:999999'
    where a.nickname_normalized='legacy voter'`)).rows[0];
  assert.deepEqual(legacyState, { user_id: "congregation-voter:legacy-431", profile_id: "congregation-pref:legacy-431", score: 1 }, "legacy claim preserves exact identity, profile and preference");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await service.requestRegistration("Rate Limited", "rate-limited@example.test", request(`rate-${attempt}`));
    assert.ok(result.kind === "created" || result.kind === "awaitingConfirmation");
  }
  await expectVoterError(() => service.requestRegistration("Rate Limited", "rate-limited@example.test", request("rate-6")), "rateLimited");

  await fillBootstrapToFifty();
  assert.equal(await countWhere("congregation_voter_accounts", "status='active' and is_new_registration=true"), 50);
  assert.deepEqual(await service.requestRegistration("Bootstrap blocked", "bootstrap-blocked@example.test", request("bootstrap-pending")), { kind: "created" });
  await expectVoterError(() => service.confirmRegistration(confirmationToken(mailer.confirmations.at(-1)!), request("bootstrap-confirm")), "quotaReached");

  now = new Date("2026-09-03T10:00:00.000Z");
  for (let index = 0; index < 9; index += 1) await registerAndConfirm(`Weekly ${index}`, `weekly-${index}@example.test`, `weekly-${index}`);
  await service.requestRegistration("Weekly race A", "weekly-race-a@example.test", request("weekly-race-a"));
  const raceAToken = confirmationToken(mailer.confirmations.at(-1)!);
  await service.requestRegistration("Weekly race B", "weekly-race-b@example.test", request("weekly-race-b"));
  const raceBToken = confirmationToken(mailer.confirmations.at(-1)!);
  const race = await Promise.allSettled([
    service.confirmRegistration(raceAToken, request("weekly-race-confirm-a")),
    service.confirmRegistration(raceBToken, request("weekly-race-confirm-b")),
  ]);
  assert.equal(race.filter((item) => item.status === "fulfilled").length, 1, "quota lock admits only one concurrent tenth weekly activation");
  assert.equal(race.filter((item) => item.status === "rejected" && item.reason instanceof CongregationVoterError && item.reason.code === "quotaReached").length, 1);

  await db.query("update congregation_registration_control set registration_frozen=true where id='global'");
  await expectVoterError(() => service.requestRegistration("Frozen", "frozen@example.test", request("frozen")), "frozen");
  await db.query("update congregation_registration_control set registration_frozen=false where id='global'");

  await db.query(`insert into congregation_voter_accounts
    (id,nickname,nickname_normalized,email,email_normalized,status,is_new_registration,created_at,updated_at)
    values ('congregation-account:old-pending','Old Pending','old pending','old-pending@example.test','old-pending@example.test','pending',true,now()-interval '31 days',now()-interval '31 days')`);
  const maintenance = await runCongregationRegistrationMaintenance(db);
  assert.ok(maintenance.abandonedPendingRegistrations >= 1);
  assert.equal(await countWhere("congregation_voter_accounts", "id='congregation-account:old-pending'"), 0);

  console.log("Issue 431 stable voter registration acceptance: PASS");
}

async function fillBootstrapToFifty() {
  const current = await countWhere("congregation_voter_accounts", "status='active' and is_new_registration=true");
  for (let index = current; index < 50; index += 1) await registerAndConfirm(`Bootstrap ${index}`, `bootstrap-${index}@example.test`, `bootstrap-${index}`);
}

async function registerAndConfirm(nickname: string, email: string, marker: string) {
  assert.deepEqual(await service.requestRegistration(nickname, email, request(`${marker}-register`)), { kind: "created" });
  const result = await service.confirmRegistration(confirmationToken(mailer.confirmations.at(-1)!), request(`${marker}-confirm`));
  assert.equal(result.kind, "confirmed");
}

async function seedLegacy() {
  await db.query(`insert into app_users (id,display_name,active) values ('congregation-voter:legacy-431','Legacy Voter',true);
    insert into app_user_roles (user_id,role) values ('congregation-voter:legacy-431','congregation_member');
    insert into preference_profiles (id,user_id,category) values ('congregation-pref:legacy-431','congregation-voter:legacy-431','congregation_member');
    insert into reference_song_preferences (profile_id,reference_song_id,score) values ('congregation-pref:legacy-431','czech:999999',1);
    insert into congregation_voter_accounts (id,user_id,nickname,nickname_normalized,status,is_new_registration)
    values ('congregation-account:legacy-431','congregation-voter:legacy-431','Legacy Voter','legacy voter','legacy_unverified',false);`);
}

function confirmationToken(message: CongregationConfirmationMessage): string {
  const token = new URL(message.confirmationUrl).searchParams.get("token");
  assert.ok(token);
  return token;
}

function request(marker: string) { return { ipAddress: `acceptance-${marker}` }; }
async function count(table: string) { return Number((await db.query(`select count(*)::int n from ${table}`)).rows[0].n); }
async function countWhere(table: string, where: string) { return Number((await db.query(`select count(*)::int n from ${table} where ${where}`)).rows[0].n); }

async function expectVoterError(action: () => Promise<unknown>, code: CongregationVoterError["code"]) {
  await assert.rejects(action, (error) => error instanceof CongregationVoterError && error.code === code);
}

main().catch((error) => {
  console.error("Issue 431 stable voter registration acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.end());
