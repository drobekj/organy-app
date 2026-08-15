# Neon production provider state

## Phase 31.36 status

Phase 31.36 is the Neon-first provider provisioning and recovery-compatibility slice defined by Contract Gate #186.

Current state: **PENDING HUMAN PROVIDER CREATION STEP**.

No Neon project has been created by this repository change. The connected Neon organization was verified to contain zero projects immediately before the Phase 31.36 provider checkpoint.

## Required provider target

The single intended project must be created in the existing connected Neon organization with all of the following explicit selections:

- project name: `organy-app-production` (or provider-normalized equivalent);
- plan: **Free**;
- PostgreSQL major: **16**;
- cloud/region: **AWS Europe (Frankfurt)** (`aws-eu-central-1`);
- default root branch/database/role/compute only.

Do not enable Neon Auth, Data API, Object Storage, Functions, extra branches, read replicas, scheduled snapshots, paid features, a trial, or a payment method.

## Zero-cost facts re-checked before creation

Immediately before this checkpoint, current Neon primary documentation was re-checked and still states that:

- Free is `$0/month`, permanent rather than a trial, with no credit card required;
- Free includes 100 CU-hours per project, 0.5 GB storage, and 5 GB public network transfer;
- Free compute scales to zero after inactivity;
- hitting a Free monthly limit suspends compute until the next billing month or an explicit upgrade;
- PostgreSQL 16 remains supported;
- AWS Europe (Frankfurt) remains an available Neon region.

These provider facts are volatile and must be verified again if project creation is delayed materially.

## Connection and recovery checks after creation

After the HUMAN provider creation step, AI-owned connected-provider verification must confirm only non-secret metadata and then verify:

1. PostgreSQL major 16 and Frankfurt region;
2. expected default Neon resources only;
3. pooled/serverless connection availability for future `DATABASE_URL` use;
4. direct/unpooled connection availability for migration and Phase 31.33 recovery tooling;
5. no Neon Auth provisioning;
6. the read-only Phase 31.33 identity probe:

```sql
select current_database(),
       (select system_identifier::text from pg_control_system());
```

The actual system identifier, database credentials, connection strings, hosts, passwords, tokens, and project credentials must not be copied into Git, CI logs, issues, PR bodies, documentation, or chat-visible output.

If `pg_control_system()` is unavailable, Phase 31.36 remains blocked for cutover. The Phase 31.33 source=target protection must not be bypassed or weakened.

## Explicitly deferred

This phase does not create a Vercel project, install a Neon↔Vercel integration, migrate schema/data into Neon, bootstrap protected accounts, create production Better Auth secrets, or deploy the application remotely.

The later Vercel phase should prefer a manual environment-variable connection unless a separately reviewed managed integration proves that it introduces no unwanted preview-branching or authentication behavior.
