# Browser-bound congregation voter mode

The current Congregation Preferences access mode intentionally favors a low-friction browser-bound voter identity. The more robust registered-email implementation remains in the repository as a dormant alternative behind the centralized voter-mode switch.

## Product boundary

- No nickname, email, registration, confirmation or recovery is required in the active browser-bound mode.
- The main `/sign-in` surface exposes a direct **Vote for Songs** action alongside staff **Sign In**.
- **Vote for Songs** uses the existing `startTemporaryVoting` action and enters the voting workspace directly; there is no temporary-mode intermediary entry panel.
- Preferences are bound to one browser through an opaque HttpOnly voter-session cookie.
- Losing browser state, using another browser, or using another device may create another temporary voter identity.
- No device fingerprinting, IP-based deduplication, anti-abuse identity matching or additional voter metadata is used.

## Product interpretation

Congregation preference aggregates are an engagement and preference signal, not a guaranteed unique-person vote count.

A person who loses browser state or deliberately votes from another browser/device may therefore contribute through more than one temporary identity. This is accepted behavior in the current product mode. The application does not attempt to detect or suppress those cases, and aggregate totals must be interpreted with that limitation in mind.

The priest remains the decision maker; congregation preferences are supporting information rather than an automatic rule for service planning.

## Identity shape

The browser-bound layer deliberately reuses the permanent voter data shape rather than introducing a parallel preference model:

- random `app_users` identity;
- exactly one `congregation_member` role;
- random congregation preference profile;
- random congregation voter account;
- random opaque browser session token, with only its SHA-256 hash stored server-side.

Temporary identities use explicit `:temporary:` ID prefixes and `is_new_registration=false`. The existing `legacy_unverified` account state is reused because migration 0023 already defines it as the email-free state with an owned stable voter/profile identity. Browser-bound rows therefore do not affect confirmed-registration quotas and remain distinguishable from registered-email voters.

The browser session expires after 180 days. The cookie uses HttpOnly, SameSite=Lax and Secure in Production. Re-entering voting with the same valid cookie reuses the same voter/profile rather than creating another identity.

## Isolation from registered-email voting

The product mode switch is centralized in `src/application/congregation-voter-mode.ts`.

While browser-bound mode is active:

- nickname sign-in is not exposed;
- registration, resend and recovery actions are rejected server-side;
- confirmation links do not execute registration confirmation;
- Resend and congregation mail/security configuration are not required for creating browser-bound voters;
- protected staff authentication is unchanged.

The registered-email implementation, database shape and registration/recovery UI remain in the repository for a possible later cutover. They must not be deleted merely because the browser-bound mode is currently active.

## Future cutover

A later change to `registeredEmail` remains an explicit product decision. Because both modes use the same preference ownership model, the registered-email path can be re-enabled without redesigning the preference schema or staff authentication architecture.

Any Production migration, cleanup or voter reset remains a separate HUMAN checkpoint.
