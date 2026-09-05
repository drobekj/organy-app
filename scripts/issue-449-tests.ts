import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { PostgresCongregationPreferenceService } from "../src/application/congregation-preference-voter";
import { getOrCreateTemporaryCongregationVoterSession } from "../src/application/temporary-congregation-voter";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue #449 acceptance.");

  const pageSource = readFileSync("app/congregation-preferences/page.tsx", "utf8");
  const routeSource = readFileSync("app/api/congregation-preferences/route.ts", "utf8");

  assert.match(pageSource, /if \(!temporaryMode && first\(params\.entry\) === "1"\) return entryPanel\(params\);/);
  assert.doesNotMatch(pageSource, /if \(first\(params\.entry\) === "1"\) return entryPanel\(params\);/);
  assert.match(routeSource, /getOrCreateTemporaryCongregationVoterSession\(pool, existingToken\)/);
  assert.doesNotMatch(routeSource, /createTemporaryCongregationVoterSession\(pool\)/);

  const pool = new Pool({ connectionString: databaseUrl });
  let userId: string | undefined;

  try {
    const first = await getOrCreateTemporaryCongregationVoterSession(pool, undefined);
    assert.equal(first.created, true);

    const service = new PostgresCongregationPreferenceService(pool);
    const firstContext = await service.resolveContext(first.session.token);
    userId = firstContext.userId;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const repeated = await getOrCreateTemporaryCongregationVoterSession(pool, first.session.token);
      assert.equal(repeated.created, false, `repeat ${attempt + 1} must reuse the existing browser voter`);
      assert.equal(repeated.session.token, first.session.token);
      const context = await service.resolveContext(repeated.session.token);
      assert.equal(context.accountId, firstContext.accountId);
      assert.equal(context.userId, firstContext.userId);
      assert.equal(context.profileId, firstContext.profileId);
    }

    const counts = await pool.query(
      `select
         (select count(*)::integer from app_users where id = $1) as users,
         (select count(*)::integer from app_user_roles where user_id = $1 and role = 'congregation_member') as roles,
         (select count(*)::integer from preference_profiles where user_id = $1 and category = 'congregation_member') as profiles,
         (select count(*)::integer from congregation_voter_accounts where id = $2 and user_id = $1) as accounts,
         (select count(*)::integer from congregation_voter_sessions where account_id = $2) as sessions`,
      [firstContext.userId, firstContext.accountId],
    );

    assert.deepEqual(
      {
        users: Number(counts.rows[0].users),
        roles: Number(counts.rows[0].roles),
        profiles: Number(counts.rows[0].profiles),
        accounts: Number(counts.rows[0].accounts),
        sessions: Number(counts.rows[0].sessions),
      },
      { users: 1, roles: 1, profiles: 1, accounts: 1, sessions: 1 },
    );

    console.log("Issue #449 idempotent temporary browser voter acceptance: PASS");
  } finally {
    if (userId) await pool.query("delete from app_users where id = $1", [userId]).catch(() => undefined);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
