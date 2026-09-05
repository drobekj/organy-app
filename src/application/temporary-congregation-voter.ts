import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export const TEMPORARY_VOTER_SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;

export type TemporaryCongregationVoterSession = {
  token: string;
  expiresAt: Date;
};

export type TemporaryCongregationVoterSessionResolution = {
  session: TemporaryCongregationVoterSession;
  created: boolean;
};

type TemporaryVoterOptions = {
  now?: () => Date;
};

const temporaryAccountPrefix = "congregation-account:temporary:";
const temporarySessionTokenPattern = /^cvs_[A-Za-z0-9_-]{40,}$/;

/**
 * Reuses the browser's existing temporary voter session whenever it is still
 * valid. A new temporary identity is created only when the browser does not
 * present a valid temporary session token.
 */
export async function getOrCreateTemporaryCongregationVoterSession(
  pool: Pool,
  existingToken: unknown,
  options: TemporaryVoterOptions = {},
): Promise<TemporaryCongregationVoterSessionResolution> {
  const now = options.now?.() ?? new Date();

  if (typeof existingToken === "string" && temporarySessionTokenPattern.test(existingToken)) {
    const existing = await pool.query(
      `select s.expires_at
         from congregation_voter_sessions s
         join congregation_voter_accounts a on a.id = s.account_id
        where s.token_hash = $1
          and s.expires_at > $2
          and a.id like $3
          and a.status = 'legacy_unverified'
          and a.is_new_registration = false
        limit 1`,
      [hashToken(existingToken), now, `${temporaryAccountPrefix}%`],
    );

    if (existing.rows[0]) {
      return {
        session: {
          token: existingToken,
          expiresAt: new Date(existing.rows[0].expires_at),
        },
        created: false,
      };
    }
  }

  return {
    session: await createTemporaryCongregationVoterSession(pool, { now: () => now }),
    created: true,
  };
}

/**
 * Creates a disposable browser-bound congregation voter using the same app-user,
 * preference-profile and opaque-session boundaries as the permanent voter model.
 *
 * `legacy_unverified` is intentionally reused as the existing schema state that
 * permits an owned preference profile without email confirmation. Temporary rows
 * are distinguished fail-closed by their explicit `:temporary:` identifiers and
 * never count as new registrations.
 */
export async function createTemporaryCongregationVoterSession(
  pool: Pool,
  options: TemporaryVoterOptions = {},
): Promise<TemporaryCongregationVoterSession> {
  const now = options.now?.() ?? new Date();
  const identityId = randomUUID();
  const userId = `congregation-voter:temporary:${identityId}`;
  const profileId = `congregation-pref:temporary:${identityId}`;
  const accountId = `congregation-account:temporary:${identityId}`;
  const internalNickname = `Temporary voter ${identityId}`;
  const sessionToken = `cvs_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + TEMPORARY_VOTER_SESSION_TTL_SECONDS * 1000);
  const sessionId = `congregation-session:temporary:${randomUUID()}`;
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      "insert into app_users (id, display_name, active, created_at, updated_at) values ($1,$2,true,$3,$3)",
      [userId, "Anonymous voter", now],
    );
    await client.query(
      "insert into app_user_roles (user_id, role) values ($1,'congregation_member')",
      [userId],
    );
    await client.query(
      "insert into preference_profiles (id, user_id, category, created_at, updated_at) values ($1,$2,'congregation_member',$3,$3)",
      [profileId, userId, now],
    );
    await client.query(
      `insert into congregation_voter_accounts
         (id, user_id, nickname, nickname_normalized, status, is_new_registration, created_at, updated_at)
       values ($1,$2,$3,$4,'legacy_unverified',false,$5,$5)`,
      [accountId, userId, internalNickname, internalNickname.toLocaleLowerCase("en-US"), now],
    );
    await client.query(
      "insert into congregation_voter_sessions (id, account_id, token_hash, expires_at, created_at) values ($1,$2,$3,$4,$5)",
      [sessionId, accountId, hashToken(sessionToken), expiresAt, now],
    );
    await client.query("commit");
    return { token: sessionToken, expiresAt };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
