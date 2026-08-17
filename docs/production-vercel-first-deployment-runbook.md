# First explicit Vercel Production deployment

## Phase 31.40 purpose

Phase 31.40 performs the first explicit Vercel Production deployment after the production Neon schema and authoritative Reference snapshot are already complete.

Contract Gate: #194.

The deployment payload is the already merged and post-merge verified Phase 31.39 `main` revision:

`c10f3e4af380297d7d37c7c73c999b19eb0807c2`

The Phase 31.40 control PR contains only release-boundary documentation/acceptance. It is **not** the deployment payload. This avoids deploying an unmerged PR commit that would later receive a different squash-merge SHA.

## Starting provider state

Before the first provider write, connected verification must still establish:

- exactly one intended Vercel project;
- framework Next.js;
- zero deployments and no assigned production domain;
- automatic Git deployment disabled by repository configuration;
- repository runtime pin `engines.node = 22.x` and Frankfurt `fra1` unchanged;
- Production-only `ORGANY_RUNTIME`, pooled `DATABASE_URL`, and `BETTER_AUTH_SECRET` already configured from Phase 31.37;
- `BETTER_AUTH_URL` still absent/deferred;
- `DATABASE_URL_UNPOOLED` absent from ordinary Vercel runtime configuration;
- Neon still exactly matches the accepted Phase 31.39 Reference snapshot with no user/service/business data and no Neon Auth/Data API.

No provider hostname, credential, token, project/system identifier, connection string, deployment hook, or auth secret belongs in Git, CI logs, issue/PR text, or chat-visible evidence.

## Why two explicit Production deployments are required

Vercel currently reports no project domain before the first deployment. Therefore `BETTER_AUTH_URL` cannot be derived or guessed safely in advance.

The existing full production runtime contract intentionally rejects a missing `BETTER_AUTH_URL`. The first deployment is consequently a narrowly authorized **bootstrap deployment** whose only purpose is to let Vercel materialize the authoritative stable Production HTTPS alias. It must not be treated as runtime-ready or used for account bootstrap, protected sign-in acceptance, business smoke testing, or public cutover.

After Vercel exposes the real stable Production alias, set `BETTER_AUTH_URL` for the **Production environment only** to that exact HTTPS alias, then explicitly deploy the **same payload revision** again. Only the second deployment may satisfy the complete Phase 31.32 runtime configuration boundary.

## Exact operator sequence

The HUMAN/provider checkpoint proceeds one action at a time and stops on any unexpected state.

1. Check out exactly `c10f3e4af380297d7d37c7c73c999b19eb0807c2` in a clean local working tree.
2. Link that local checkout to the already-created Vercel `organy-app` project. Local `.vercel/project.json` metadata must remain uncommitted.
3. Read-only list the Production environment-variable names/scopes and confirm the Phase 31.37 boundary before deployment. Do not print values.
4. Run the first explicit Production deployment with `vercel --prod --yes` from that exact clean checkout. Do not enable Git deployment and do not install integrations/add-ons.
5. Connected Vercel verification must prove that the deployment is READY and identify the actual stable Production alias from provider state. Do not infer it from the project name.
6. Add `BETTER_AUTH_URL` to **Production only** using `vercel env add BETTER_AUTH_URL production`; supply exactly the provider-confirmed HTTPS alias as the value. Do not target Preview or Development.
7. Verify the full production-runtime configuration contract with the authoritative URL known. Secret values remain outside repository evidence.
8. From the same exact clean payload checkout, run `vercel --prod --yes` again.
9. Connected Vercel verification must prove that the stable Production alias points to the second, configuration-complete deployment and that both deployments use the same selected payload revision/content.
10. Connected Neon verification must prove that deployment caused no database mutation.

No `--skip-domain` path is used: Phase 31.40 specifically needs the provider-created stable Production alias. No Git-based automatic deployment is enabled.

## Bootstrap deployment safety boundary

The bootstrap deployment exists only to resolve the provider URL ordering dependency. A missing `BETTER_AUTH_URL` remains invalid according to `scripts/production-preflight.ts` / `src/config/production-runtime.ts`.

Therefore before the second deployment:

- do not bootstrap an Account;
- do not run protected sign-in acceptance;
- do not create actors, roles, services, preferences, repertoire, manual melody knowledge, or recommendations;
- do not advertise or cut over traffic to the alias;
- do not interpret a successful build as a completed production runtime configuration.

## Final Phase 31.40 provider state

Phase 31.40 is complete only when all of the following are provider-confirmed:

- the stable Production HTTPS alias is known from Vercel state;
- `BETTER_AUTH_URL` equals that exact alias in Production only;
- the final deployment is READY and owns the stable alias;
- the deployment content is the selected merged Phase 31.39 payload revision;
- repository Node 22.x and Frankfurt `fra1` boundaries remain effective;
- Git automatic deployment remains disabled;
- no managed Vercel/Neon integration, Neon Auth/Data API, paid plan/trial/add-on, custom domain, or DNS cutover was introduced;
- Neon remains exactly at the Phase 31.39 Reference snapshot with no user/service/business-data changes.

## Explicit exclusions

Phase 31.40 does not bootstrap protected accounts, create real actors/roles, perform production sign-in or congregation-nickname smoke, create services, import legacy/local data, seed preferences/repertoire/manual knowledge, enable public cutover, add custom DNS/domain, or introduce deployment automation/monitoring/paid provider features.

Those remain later Contract Gates.
