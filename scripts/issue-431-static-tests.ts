import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("app/congregation-preferences/page.tsx");
const route = read("app/api/congregation-preferences/route.ts");
const confirmRoute = read("app/api/congregation-preferences/confirm/route.ts");
const service = read("src/application/congregation-preference-voter.ts");
const mailer = read("src/application/congregation-voter-mailer.ts");
const schema = read("src/db/schema/index.ts");
const migration = read("drizzle/0023_stable_congregation_voters.sql");
const css = read("app/globals.css");
const demo = read("src/config/application-experience.ts");
const cron = read("vercel.json");
const adminService = read("src/application/congregation-preference-admin.ts");
const adminPage = read("app/admin/preferences/page.tsx");

for (const text of [
  "Congregation Preferences",
  "Vote for your favorite songs to be considered.",
  "Nickname",
  "Sign in",
  "Register",
  "Recover nickname",
  "Staff sign in",
  "if you haven't registered yet",
  "if you forgot your nickname",
  "if you are a priest, organist or admin",
]) assert.ok(page.includes(text), `entry UI must retain: ${text}`);

for (const text of [
  "This registration has not been confirmed yet. Check your email.",
  "Registration request created. Check your email and confirm your registration.",
  "You are already registered. Sign in using the nickname you just entered.",
  "This nickname is already reserved. Choose another nickname.",
  "This email address is already registered. Use Recover nickname to recover your existing nickname.",
  "Enter a valid email address.",
  "This confirmation link is invalid.",
]) assert.ok(page.includes(text), `approved response copy must retain: ${text}`);

assert.match(css, /\.congregation-entry-button \{[\s\S]*?justify-content: center;[\s\S]*?text-align: center;[\s\S]*?width: 11rem;/);
assert.match(css, /\.congregation-entry-option \{[\s\S]*?grid-template-columns: 11rem minmax\(0, 1fr\);/);
assert.match(page, /className="congregation-entry-divider"/);

assert.doesNotMatch(service, /identityForNickname|createHash\("sha256"\)\.update\(nickname/);
assert.match(service, /userId = `congregation-voter:\$\{identityId\}`/);
assert.match(service, /value\.trim\(\)\.normalize\("NFC"\)/);
assert.match(service, /toLocaleLowerCase\("cs-CZ"\)\.normalize\("NFC"\)/);
assert.match(service, /const token = `cvs_\$\{randomBytes\(32\)/);
assert.match(service, /token_hash = \$1 and expires_at > \$2/);
assert.match(service, /CONFIRMATION_TTL_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(service, /pg_advisory_xact_lock\(hashtext\('organy-congregation-registration'\)\)/);
assert.match(service, /Europe\/Prague/);
assert.match(service, /BOOTSTRAP_REGISTRATION_LIMIT = 50/);
assert.match(service, /WEEKLY_REGISTRATION_LIMIT = 10/);
assert.doesNotMatch(route, /enterNickname/);
assert.match(route, /preferenceService\.signIn/);
assert.match(confirmRoute, /confirmRegistration/);

assert.match(mailer, /https:\/\/api\.resend\.com\/emails/);
assert.match(mailer, /"idempotency-key"/);
assert.match(mailer, /Confirm registration/);
assert.match(mailer, /requireCanonicalBaseUrl/);
assert.doesNotMatch(mailer, /request\.headers|get\("host"\)/i);

for (const table of [
  "congregation_voter_accounts",
  "congregation_confirmation_tokens",
  "congregation_voter_sessions",
  "congregation_rate_limit_buckets",
  "congregation_registration_control",
]) {
  assert.ok(schema.includes(table));
  assert.ok(migration.includes(table));
}
assert.match(migration, /'legacy_unverified'/);
assert.match(migration, /u\.id,[\s\S]*?u\.display_name/);
assert.doesNotMatch(migration, /delete from "?(?:app_users|preference_profiles|reference_song_preferences)"?/i);

for (const key of ["RESEND_API_KEY", "CONGREGATION_EMAIL_FROM", "CONGREGATION_BASE_URL", "CONGREGATION_SECURITY_SECRET"]) {
  assert.ok(demo.includes(key), `Demo must forbid ${key}`);
}
assert.match(adminService, /recordSuspiciousRegistrationActivity/);
assert.match(adminService, /congregation\.registration\.suspicious-activity/);
assert.match(adminPage, /Record suspicious activity/);
const vercel = JSON.parse(cron) as { crons: { path: string; schedule: string }[] };
assert.equal(vercel.crons.length, 2, "Vercel Hobby maximum remains respected");
assert.ok(vercel.crons.some((item) => item.path === "/api/maintenance/congregation-registration" && item.schedule === "15 2 * * *"));

console.log("Issue 431 stable voter static acceptance: PASS");
