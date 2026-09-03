# Stable congregation voter identity

Issue #431 replaces nickname-derived voter identity with a stable, email-confirmed identity. It supersedes the nickname-only identity portions of `production-auth-decision.md` and `auth-account-role-model.md`; protected staff authentication is unchanged.

## Identity and ownership

- `congregation_voter_accounts.id` is the stable voter-account key. A confirmed new voter receives a random `app_users.id` and a random preference-profile ID; neither is derived from nickname or email.
- Nickname and email are mutable identifiers protected by case-insensitive uniqueness. Email is normalized by trim plus case-folding only; provider-specific dot or plus rewriting is deliberately excluded.
- New identities become active only after a single-use, SHA-256-hashed, 24-hour confirmation token is consumed. Pending registrations create no `app_users` row and no preference profile.
- Browser sessions are random opaque tokens. Only their hashes are stored, and server-side expiry is 30 days.
- The voter boundary grants only `congregation_member`; it never creates a Better Auth account or grants staff permissions.

## Legacy migration

Migration `0023_stable_congregation_voters.sql` backfills existing `congregation-voter:%` actors as `legacy_unverified`. It preserves their exact `app_users.id`, preference-profile ID, role and all existing preferences. A legacy voter may continue voting, but only the currently signed-in legacy session may start an email claim. Confirmation upgrades the same account in place.

Unsafe legacy collisions or protected-account links fail the migration instead of guessing ownership.

## Registration and recovery

- Sign in by nickname never creates an identity. Missing and pending nicknames receive explicit UI outcomes.
- Registration handles same nickname/email, reserved nickname, and already-used email as separate outcomes.
- Resend invalidates every previous unused confirmation token before issuing a new one.
- Recovery sends the canonical nickname only to the already-confirmed address. It does not reveal it in the HTTP response.
- Mail is delivered through the Resend HTTPS API. Production requires a verified sender domain; mail errors do not activate voters.

## Abuse and quota controls

- Durable rate-limit buckets protect both source address and HMAC-blinded nickname/email identifiers.
- The first 50 actual new confirmed activations form the bootstrap allowance. Legacy claims are excluded. The 50th activation stops further confirmation until the next Europe/Prague midnight.
- Thereafter at most 10 new voters may be confirmed per ISO week. A locked control row serializes concurrent confirmation so the limit cannot be exceeded by a race.
- Admin may freeze registration without disabling existing voter sessions. The Admin Preferences page shows quota state, account-state counts, suspicious rate-limit buckets and recent state transitions without displaying email addresses.
- Daily maintenance removes pending registrations abandoned for 30 days, expired sessions, expired unused tokens and old rate-limit buckets. Vercel invokes it with the shared `CRON_SECRET` boundary.

## Production configuration

Production additionally requires:

- `RESEND_API_KEY`
- `CONGREGATION_EMAIL_FROM`
- `CONGREGATION_BASE_URL` (the same canonical origin as `BETTER_AUTH_URL`)
- `CONGREGATION_SECURITY_SECRET` (independent random secret, at least 32 characters)

The preflight fails closed when any value is missing or unsafe. Demo/memory mode forbids these values so it cannot send real email or connect to the production registration path.

## Release verification

Before public cutover: run the migration on an isolated database branch, execute `npm run test:issue-431:db`, verify the exact UI and mail links on a non-production deployment, then take a fresh production backup before applying the forward-only migration. Do not expose the registration UI until the Resend domain and all four production values are configured.
