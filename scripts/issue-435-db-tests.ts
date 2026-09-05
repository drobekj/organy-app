import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { PostgresCongregationPreferenceService } from "../src/application/congregation-preference-voter";
import {
  createTemporaryCongregationVoterSession,
  TEMPORARY_VOTER_SESSION_TTL_SECONDS,
} from "../src/application/temporary-congregation-voter";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue #435 DB acceptance.");

  const pool = new Pool({ connectionString: databaseUrl });
  const songId = "czech:435000";
  let userId: string | undefined;

  try {
    await pool.query(
      `insert into reference_catalog_songs (id, language, canonical_number, source_id, title)
       values ($1, 'czech', 435000, 'issue-435-temporary-voter', 'Issue 435 temporary voter song')
       on conflict (id) do nothing`,
      [songId],
    );

    const before = new Date();
    const created = await createTemporaryCongregationVoterSession(pool);
    assert.match(created.token, /^cvs_[A-Za-z0-9_-]{40,}$/);
    assert.ok(
      created.expiresAt.getTime() >= before.getTime() + TEMPORARY_VOTER_SESSION_TTL_SECONDS * 1000,
      "temporary session must retain the configured browser-bound lifetime",
    );

    const service = new PostgresCongregationPreferenceService(pool);
    const context = await service.resolveContext(created.token);
    userId = context.userId;
    assert.match(context.accountId, /^congregation-account:temporary:/);
    assert.match(context.userId, /^congregation-voter:temporary:/);
    assert.match(context.profileId, /^congregation-pref:temporary:/);
    assert.equal(context.role, "congregationMember");
    assert.equal(context.status, "legacy_unverified");

    const account = await pool.query(
      `select email, email_normalized, confirmed_at, is_new_registration, status
         from congregation_voter_accounts where id = $1`,
      [context.accountId],
    );
    assert.equal(account.rows.length, 1);
    assert.equal(account.rows[0].email, null);
    assert.equal(account.rows[0].email_normalized, null);
    assert.equal(account.rows[0].confirmed_at, null);
    assert.equal(account.rows[0].is_new_registration, false);
    assert.equal(account.rows[0].status, "legacy_unverified");

    const tokenHash = createHash("sha256").update(created.token, "utf8").digest("hex");
    const session = await pool.query(
      `select token_hash, expires_at from congregation_voter_sessions where account_id = $1`,
      [context.accountId],
    );
    assert.equal(session.rows.length, 1);
    assert.equal(session.rows[0].token_hash, tokenHash);
    assert.notEqual(session.rows[0].token_hash, created.token);

    const confirmationTokens = await pool.query(
      "select count(*)::integer count from congregation_confirmation_tokens where account_id = $1",
      [context.accountId],
    );
    assert.equal(Number(confirmationTokens.rows[0].count), 0);

    const protectedLinks = await pool.query(
      "select count(*)::integer count from protected_account_actor_links where app_user_id = $1",
      [context.userId],
    );
    assert.equal(Number(protectedLinks.rows[0].count), 0);

    const saved = await service.saveOwnReferencePreference(created.token, songId, 1);
    assert.equal(saved.referenceSongId, songId);
    assert.equal(saved.score, 1);
    const preferences = await service.listOwnReferencePreferences(created.token);
    assert.deepEqual(preferences, [{ referenceSongId: songId, score: 1 }]);

    const quotaCount = await pool.query(
      "select count(*)::integer count from congregation_voter_accounts where status = 'active' and is_new_registration = true",
    );
    assert.equal(Number(quotaCount.rows[0].count), 0, "temporary voter must not consume confirmed-registration quota");

    console.log("Issue #435 temporary browser voter PostgreSQL acceptance: PASS");
  } finally {
    if (userId) await pool.query("delete from app_users where id = $1", [userId]).catch(() => undefined);
    await pool.query("delete from reference_catalog_songs where id = $1", [songId]).catch(() => undefined);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
