# Temporary browser-bound congregation voter mode

Issue #435 adds a deliberately temporary access layer while the congregation waits for the organizational decision about the Resend sender domain.

## Product boundary

- No nickname, email, registration, confirmation or recovery is required.
- The entry surface exposes one action: **Start voting**.
- Preferences are bound to one browser through an opaque HttpOnly voter-session cookie.
- Losing browser state means losing access to that temporary identity.
- This mode is test-only. No public voting campaign has started and all temporary votes may be reset before the permanent registration mode is released.

## Identity shape

The temporary layer deliberately reuses the permanent voter data shape rather than introducing a parallel preference model:

- random `app_users` identity;
- exactly one `congregation_member` role;
- random congregation preference profile;
- random congregation voter account;
- random opaque browser session token, with only its SHA-256 hash stored server-side.

Temporary identities use explicit `:temporary:` ID prefixes and `is_new_registration=false`. The existing `legacy_unverified` account state is reused because migration 0023 already defines it as the email-free state with an owned stable voter/profile identity. Temporary rows therefore do not affect confirmed-registration quotas and can be selected unambiguously for the later reset.

The temporary browser session expires after 180 days. The cookie uses HttpOnly, SameSite=Lax and Secure in Production.

## Isolation from permanent registration

The product mode switch is centralized in `src/application/congregation-voter-mode.ts`.

While temporary mode is active:

- nickname sign-in is not exposed;
- registration, resend and recovery actions are rejected server-side;
- confirmation links do not execute registration confirmation;
- Resend and congregation mail/security configuration are not required for creating temporary voters;
- protected staff authentication is unchanged.

The registered-email implementation remains in the repository for the later cutover.

## Cutover

Before the official registered-email launch, temporary test data may be removed by targeting the explicit temporary account/user/profile identifiers. The permanent flow can then be enabled without changing the preference schema or staff authentication architecture.

Any Production migration, reset or deployment remains a separate HUMAN checkpoint.
