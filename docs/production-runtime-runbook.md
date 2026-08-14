# Production runtime configuration preflight

## Purpose

Phase 31.32 defines the minimal vendor-neutral runtime/secrets boundary required before a production deployment may be treated as correctly configured. It does not select a host, PostgreSQL provider, secret manager, backup product, release mechanism, or monitoring stack.

## Required production runtime variables

The operator must provide all of the following outside the repository:

- `ORGANY_RUNTIME=db`
- `DATABASE_URL` — the production PostgreSQL connection string
- `BETTER_AUTH_SECRET` — a non-placeholder secret with at least 32 characters
- `BETTER_AUTH_URL` — the externally meaningful absolute application/auth URL

A public/non-loopback `BETTER_AUTH_URL` must use HTTPS. Loopback HTTP is accepted only for local development or local acceptance.

Never commit production values, bootstrap passwords, replacement/recovery passwords, or database credentials. `.env.example` contains only local/safe examples and placeholders.

## Preflight

Before production migration/startup, run:

```sh
npx tsx scripts/production-preflight.ts
```

A valid configuration exits successfully and prints only a PASS summary. Invalid configuration exits non-zero and identifies the variable name and reason. The command deliberately does not print environment-variable values.

The preflight checks configuration syntax/presence only. It does not need database connectivity and does not mutate application data.

## Production startup order

At a high level, the operator sequence is:

1. Provide the required production runtime variables through the deployment environment/secrets mechanism.
2. Run the production runtime preflight and require PASS.
3. Run database migrations with the intended production `DATABASE_URL`.
4. If and only if the congregation is being initialized and protected staff Accounts do not yet exist, perform the explicit one-time protected-auth bootstrap using separately supplied bootstrap credentials.
5. Start the application.
6. Confirm protected sign-in and the separate congregation nickname flow through the deployed URL.

Catalog seed/sync commands, demo seed commands, and acceptance fixtures are not part of normal production startup and must not be run implicitly as part of deployment.

## Runtime fail-closed boundary

Protected production requests continue through the existing Better Auth session → active application Actor → current `app_user_roles` authorization chain. Before protected auth/session work in production, the application requires the Phase 31.32 configuration contract. Missing or unsafe production configuration is rejected rather than silently accepted through localhost/default credential fallbacks.

The Better Auth local/build fallback values remain module-construction compatibility only for non-runtime build/test paths; they do not satisfy the production request-time guard or the production preflight.

## Local development

The existing local Docker PostgreSQL workflow remains valid. Local development may use:

- `ORGANY_RUNTIME=db`
- the repository's local Docker `DATABASE_URL`
- an explicitly supplied local test `BETTER_AUTH_SECRET` of at least 32 characters
- `BETTER_AUTH_URL=http://localhost:3000`

The placeholder secret shown in `.env.example` must be replaced before running the production preflight.

## Still deferred

Phase 31.32 does not make the application fully production-ready. Separate accepted work is still required for:

- hosting/provider and production database selection;
- backup/export/restore design and recovery testing;
- release/rollback automation;
- secret-manager integration and rotation automation;
- observability, monitoring, alerting, and identity/security telemetry;
- concrete real-world credential-delivery operations;
- any future forced-first-change or stronger public recovery policy.
