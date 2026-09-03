import type { Pool } from "pg";

export type CongregationRegistrationMaintenanceReport = {
  abandonedPendingRegistrations: number;
  abandonedLegacyClaims: number;
  expiredSessions: number;
  staleRateLimitBuckets: number;
  staleConfirmationTokens: number;
};

export async function runCongregationRegistrationMaintenance(pool: Pool): Promise<CongregationRegistrationMaintenanceReport> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('organy-congregation-registration-maintenance'))");
    const legacyClaims = await client.query(
      `with abandoned as (
         select id from congregation_voter_accounts
          where status = 'legacy_unverified' and email is not null and updated_at < now() - interval '30 days'
       ), invalidated as (
         update congregation_confirmation_tokens set invalidated_at = now()
          where account_id in (select id from abandoned) and used_at is null and invalidated_at is null
       )
       update congregation_voter_accounts
          set email = null, email_normalized = null, updated_at = now()
        where id in (select id from abandoned)
       returning id`,
    );
    const pending = await client.query(
      "delete from congregation_voter_accounts where status = 'pending' and created_at < now() - interval '30 days' returning id",
    );
    const sessions = await client.query("delete from congregation_voter_sessions where expires_at <= now() returning id");
    const rateLimits = await client.query("delete from congregation_rate_limit_buckets where bucket_start < now() - interval '48 hours' returning id");
    const tokens = await client.query(
      `delete from congregation_confirmation_tokens
        where used_at is null
          and ((invalidated_at is not null and invalidated_at < now() - interval '30 days')
            or expires_at < now() - interval '30 days')
        returning id`,
    );
    await client.query("commit");
    return {
      abandonedPendingRegistrations: pending.rows.length,
      abandonedLegacyClaims: legacyClaims.rows.length,
      expiredSessions: sessions.rows.length,
      staleRateLimitBuckets: rateLimits.rows.length,
      staleConfirmationTokens: tokens.rows.length,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
