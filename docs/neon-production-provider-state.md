# Neon production provider state

## Phase 31.36 status

Phase 31.36 is the Neon-first provider provisioning and recovery-compatibility slice defined by Contract Gate #186.

Current state: **PROVISIONED / READ-ONLY PROBE PASS**.

The provider resource was created through the explicit HUMAN Neon Console step and then verified through the connected Neon provider tooling. Repository content records only non-secret facts; provider identifiers, hosts, connection strings, passwords, tokens, and the PostgreSQL system identifier are deliberately omitted.

## Verified provider target

Verified on **2026-08-15**:

- exactly one project exists in the connected Neon organization for this application;
- project name: `organy-app-production`;
- organization plan: **Free**;
- PostgreSQL major: **16**;
- cloud/region: **AWS Europe (Frankfurt)** (`aws-eu-central-1`);
- one default root branch named `production`;
- one default read-write compute, with Free-plan autoscaling/scale-to-zero behavior;
- only provider-default databases/schemas were present before application migration; no application schema/data was imported;
- no extra application branch, read replica, scheduled snapshot, Data API, Object Storage, Functions, or Neon Auth was provisioned by Phase 31.36.

The project remains an empty provider target for later migration/cutover work. Phase 31.36 does not run `npm run db:migrate`, restore a backup, seed data, or bootstrap protected accounts against Neon.

## Zero-cost verification

Immediately before creation, current Neon primary documentation was re-checked and still stated that Free is `$0/month`, permanent rather than a trial, and requires no credit card. After creation, connected organization metadata reported the actual organization plan as `free`.

The accepted Free limits remain operational constraints, not billing fallbacks:

- 100 CU-hours per project per month;
- 0.5 GB storage per project;
- 5 GB public network transfer;
- scale-to-zero after inactivity;
- quota exhaustion may suspend compute until reset or an explicit upgrade.

No paid plan, trial, payment method, or automatic upgrade was introduced by this phase.

## Connection boundary verification

Connected provider metadata exposes both connection shapes required by the accepted architecture:

- a pooled/serverless endpoint is available for future application `DATABASE_URL` use;
- a direct/unpooled endpoint is available for migration and Phase 31.33 operator backup/recovery tooling.

No concrete endpoint hostname or credential is stored in Git. The later Vercel phase should use a **manual environment-variable connection** rather than installing a managed Neon↔Vercel integration unless a separate review explicitly changes that decision. This keeps the existing repository Better Auth model authoritative and avoids unwanted preview-branching/Auth provisioning behavior.

## Phase 31.33 identity-guard compatibility

The mandatory read-only query was executed on the default Neon production branch using the ordinary project database role:

```sql
select current_database(),
       (select system_identifier::text from pg_control_system());
```

Result: **PASS**.

The function returned successfully, so the existing Phase 31.33 `current_database()` + `pg_control_system()` source=target fail-closed identity guard remains compatible with this Neon PostgreSQL 16 project. No managed-PostgreSQL identity adaptation is required before cutover.

The returned system identifier is intentionally not copied into documentation, issues, PR text, CI output, or other repository artifacts.

## Explicitly deferred

Phase 31.36 does not create or modify a Vercel project, install a Neon↔Vercel integration, configure production Vercel environment values, migrate schema/data into Neon, bootstrap protected accounts, create production Better Auth secrets, deploy the application remotely, or perform a production cutover.

Phase 31.37 may create the separate Vercel Hobby project and establish the reviewed manual production environment-variable boundary. Actual schema/data migration, protected-account bootstrap, and first production deployment remain later separately gated work.
