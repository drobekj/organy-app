import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { appendAuditEvent } from "./audit-history";

export type CongregationVoterContext = {
  nickname: string;
  userId: string;
  profileId: string;
  role: "congregationMember";
};

export type CongregationVoterSession = {
  context: CongregationVoterContext;
  token: string;
};

export type CongregationOwnPreference = {
  nickname: string;
  referenceSongId: string;
  score: 0 | 1 | null;
  limit: 1;
};

export type CongregationOwnPreferenceEntry = {
  referenceSongId: string;
  score: 0 | 1;
};

export class CongregationVoterError extends Error {
  constructor(
    readonly code: "invalidInput" | "permissionDenied" | "notFound" | "unauthenticated",
    message: string,
  ) {
    super(message);
    this.name = "CongregationVoterError";
  }
}

export function normalizeCongregationNickname(value: unknown): string {
  if (typeof value !== "string") throw new CongregationVoterError("invalidInput", "Nickname is required.");
  const nickname = value.trim();
  if (!nickname) throw new CongregationVoterError("invalidInput", "Nickname must not be empty.");
  return nickname;
}

function identityForNickname(nickname: string): { userId: string; profileId: string } {
  const digest = createHash("sha256").update(nickname, "utf8").digest("hex");
  return {
    userId: `congregation-voter:${digest}`,
    profileId: `congregation-pref:${digest}`,
  };
}

export class PostgresCongregationPreferenceService {
  constructor(private readonly pool: Pool) {}

  async enterNickname(rawNickname: unknown): Promise<CongregationVoterSession> {
    const nickname = normalizeCongregationNickname(rawNickname);
    const identity = identityForNickname(nickname);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const context = await this.ensureVoter(client, nickname, identity.userId, identity.profileId);
      await client.query("commit");
      return { context, token: context.userId };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveContext(token: unknown): Promise<CongregationVoterContext> {
    if (typeof token !== "string" || !token.startsWith("congregation-voter:")) {
      throw new CongregationVoterError("unauthenticated", "Enter a nickname to start congregation preference voting.");
    }
    const result = await this.pool.query(
      `select u.id as user_id, u.display_name, u.active, p.id as profile_id,
              coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles,
              count(l.auth_user_id)::integer as protected_link_count
       from app_users u
       join preference_profiles p on p.user_id = u.id and p.category = 'congregation_member'
       left join app_user_roles r on r.user_id = u.id
       left join protected_account_actor_links l on l.app_user_id = u.id
       where u.id = $1
       group by u.id, p.id`,
      [token],
    );
    if (result.rows.length !== 1) {
      throw new CongregationVoterError("unauthenticated", "Congregation voter context is missing.");
    }
    const row = result.rows[0];
    const roles = normalizeTextArray(row.roles);
    if (!Boolean(row.active) || Number(row.protected_link_count) !== 0 || roles.length !== 1 || roles[0] !== "congregation_member") {
      throw new CongregationVoterError("permissionDenied", "Congregation voter context cannot authorize protected behavior.");
    }
    return {
      nickname: String(row.display_name),
      userId: String(row.user_id),
      profileId: String(row.profile_id),
      role: "congregationMember",
    };
  }

  async getOwnReferencePreference(token: unknown, referenceSongId: unknown): Promise<CongregationOwnPreference> {
    const songId = validateReferenceSongId(referenceSongId);
    const context = await this.resolveContext(token);
    await this.requireReferenceSong(songId);
    const result = await this.pool.query(
      "select score from reference_song_preferences where profile_id = $1 and reference_song_id = $2",
      [context.profileId, songId],
    );
    const score = result.rows[0] ? Number(result.rows[0].score) : null;
    if (score !== null && score !== 0 && score !== 1) {
      throw new CongregationVoterError("permissionDenied", "Congregation preference profile contains an invalid score.");
    }
    return { nickname: context.nickname, referenceSongId: songId, score, limit: 1 };
  }

  async listOwnReferencePreferences(token: unknown): Promise<CongregationOwnPreferenceEntry[]> {
    const context = await this.resolveContext(token);
    const result = await this.pool.query(
      `select rsp.reference_song_id, rsp.score
         from reference_song_preferences rsp
         join reference_catalog_songs rcs on rcs.id = rsp.reference_song_id
        where rsp.profile_id = $1
        order by rsp.reference_song_id`,
      [context.profileId],
    );
    return result.rows.map((row) => {
      const score = Number(row.score);
      if (score !== 0 && score !== 1) {
        throw new CongregationVoterError("permissionDenied", "Congregation preference profile contains an invalid score.");
      }
      return { referenceSongId: String(row.reference_song_id), score };
    });
  }

  async saveOwnReferencePreference(token: unknown, referenceSongId: unknown, rawScore: unknown): Promise<CongregationOwnPreference> {
    const songId = validateReferenceSongId(referenceSongId);
    const score = validateCongregationScore(rawScore);
    const context = await this.resolveContext(token);
    await this.requireReferenceSong(songId);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query(
        "select score from reference_song_preferences where profile_id = $1 and reference_song_id = $2 for update",
        [context.profileId, songId],
      );
      const beforeScore = existing.rows[0] ? Number(existing.rows[0].score) : null;
      if (beforeScore !== score) {
        await client.query(
          `insert into reference_song_preferences (profile_id, reference_song_id, score)
           values ($1, $2, $3)
           on conflict (profile_id, reference_song_id)
           do update set score = excluded.score, updated_at = now()`,
          [context.profileId, songId, score],
        );
        await appendAuditEvent(client, {
          actor: { kind: "human", userId: context.userId, displayName: context.nickname, role: context.role },
          action: "preference.reference.save",
          objectKind: "referencePreference",
          objectRef: `${context.profileId}:${songId}`,
          beforeState: { score: beforeScore },
          afterState: { score },
        });
      }
      await client.query("commit");
      return { nickname: context.nickname, referenceSongId: songId, score, limit: 1 };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  private async ensureVoter(
    client: PoolClient,
    nickname: string,
    userId: string,
    profileId: string,
  ): Promise<CongregationVoterContext> {
    await client.query(
      `insert into app_users (id, display_name, active)
       values ($1, $2, true)
       on conflict (id) do nothing`,
      [userId, nickname],
    );

    const actor = await client.query(
      "select display_name, active from app_users where id = $1 for update",
      [userId],
    );
    if (actor.rows.length !== 1 || String(actor.rows[0].display_name) !== nickname) {
      throw new CongregationVoterError("permissionDenied", "Nickname profile cannot be resolved safely.");
    }
    if (!Boolean(actor.rows[0].active)) {
      throw new CongregationVoterError("permissionDenied", "Nickname profile is inactive.");
    }

    const protectedLink = await client.query(
      "select 1 from protected_account_actor_links where app_user_id = $1 limit 1",
      [userId],
    );
    if (protectedLink.rows.length > 0) {
      throw new CongregationVoterError("permissionDenied", "Nickname profile cannot be linked to a protected Account.");
    }

    const rolesBefore = await client.query(
      "select role from app_user_roles where user_id = $1 order by role",
      [userId],
    );
    const existingRoles = rolesBefore.rows.map((row) => String(row.role));
    if (existingRoles.some((role) => role !== "congregation_member")) {
      throw new CongregationVoterError("permissionDenied", "Nickname profile cannot hold protected roles.");
    }

    await client.query(
      `insert into app_user_roles (user_id, role)
       values ($1, 'congregation_member')
       on conflict (user_id, role) do nothing`,
      [userId],
    );

    await client.query(
      `insert into preference_profiles (id, user_id, category)
       values ($1, $2, 'congregation_member')
       on conflict (user_id) do nothing`,
      [profileId, userId],
    );

    const profile = await client.query(
      "select id, category from preference_profiles where user_id = $1",
      [userId],
    );
    if (
      profile.rows.length !== 1 ||
      String(profile.rows[0].id) !== profileId ||
      String(profile.rows[0].category) !== "congregation_member"
    ) {
      throw new CongregationVoterError("permissionDenied", "Nickname profile cannot reuse a protected preference profile.");
    }

    const rolesAfter = await client.query(
      "select role from app_user_roles where user_id = $1 order by role",
      [userId],
    );
    if (rolesAfter.rows.length !== 1 || String(rolesAfter.rows[0].role) !== "congregation_member") {
      throw new CongregationVoterError("permissionDenied", "Nickname profile must have exactly the congregation-member role.");
    }

    return { nickname, userId, profileId, role: "congregationMember" };
  }

  private async requireReferenceSong(referenceSongId: string): Promise<void> {
    const result = await this.pool.query(
      "select 1 from reference_catalog_songs where id = $1 limit 1",
      [referenceSongId],
    );
    if (result.rows.length !== 1) throw new CongregationVoterError("notFound", "Reference song was not found.");
  }
}

function validateReferenceSongId(value: unknown): string {
  if (typeof value !== "string" || !/^(?:czech|polish):[1-9]\d*$/.test(value)) {
    throw new CongregationVoterError("invalidInput", "A valid referenceSongId is required.");
  }
  return value;
}

function validateCongregationScore(value: unknown): 0 | 1 {
  if (value !== 0 && value !== 1) {
    throw new CongregationVoterError("invalidInput", "Congregation preference score must be 0 or 1.");
  }
  return value;
}

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.replace(/[{}]/g, "").split(",").filter(Boolean);
  return [];
}
