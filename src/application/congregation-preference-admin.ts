import type { Pool, PoolClient } from "pg";
import { appendAuditEvent, humanAuditActor } from "./audit-history";
import { ProtectedActorError, resolveProtectedUser } from "./protected-actor";

export type CongregationPreferenceAdminLanguage = "czech" | "polish" | "mixed";

export type CongregationPreferenceAdminSong = {
  referenceSongId: string;
  displayNumber: string;
  title: string;
  language: "czech" | "polish";
  score: 0 | 1;
  adminZero: boolean;
};

export type CongregationPreferenceAdminVoter = {
  userId: string;
  profileId: string;
  nickname: string;
  songs: CongregationPreferenceAdminSong[];
};

export class CongregationPreferenceAdminError extends Error {
  constructor(
    readonly code: "invalidInput" | "unauthenticated" | "permissionDenied" | "notFound" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "CongregationPreferenceAdminError";
  }
}

export class PostgresCongregationPreferenceAdminService {
  constructor(private readonly pool: Pool) {}

  async list(headers: Headers, language: CongregationPreferenceAdminLanguage): Promise<CongregationPreferenceAdminVoter[]> {
    await this.requireAdmin(headers);
    validateLanguage(language);
    const result = await this.pool.query(
      `select u.id user_id, u.display_name nickname, pp.id profile_id,
              visible.reference_song_id, visible.score,
              visible.language, visible.canonical_number, visible.title,
              visible.admin_zero
         from app_users u
         join app_user_roles aur on aur.user_id = u.id and aur.role = 'congregation_member'
         join preference_profiles pp on pp.user_id = u.id and pp.category = 'congregation_member'
         left join lateral (
           select rsp.reference_song_id, rsp.score,
                  rcs.language, rcs.canonical_number, rcs.title,
                  (
                    rsp.score = 0
                    and latest.action = 'preference.congregation.admin.set'
                    and latest.after_state ->> 'score' = '0'
                  ) as admin_zero
             from reference_song_preferences rsp
             join reference_catalog_songs rcs on rcs.id = rsp.reference_song_id
             left join lateral (
               select ae.action, ae.after_state
                 from audit_events ae
                where ae.object_kind = 'referencePreference'
                  and ae.object_ref = pp.id || ':' || rsp.reference_song_id
                  and ae.action in ('preference.congregation.admin.set', 'preference.reference.save')
                order by ae.occurred_at desc, ae.id desc
                limit 1
             ) latest on true
            where rsp.profile_id = pp.id
              and ($1 = 'mixed' or rcs.language::text = $1)
              and (
                rsp.score > 0
                or (
                  rsp.score = 0
                  and latest.action = 'preference.congregation.admin.set'
                  and latest.after_state ->> 'score' = '0'
                )
              )
            order by rcs.language, rcs.canonical_number, lower(rcs.title)
         ) visible on true
        where u.id like 'congregation-voter:%'
          and u.active = true
          and not exists (
            select 1 from app_user_roles other_roles
             where other_roles.user_id = u.id and other_roles.role <> 'congregation_member'
          )
          and not exists (
            select 1 from protected_account_actor_links links where links.app_user_id = u.id
          )
        order by lower(u.display_name), visible.language nulls last,
                 visible.canonical_number nulls last, lower(visible.title) nulls last`,
      [language],
    );

    const byProfile = new Map<string, CongregationPreferenceAdminVoter>();
    for (const row of result.rows) {
      const profileId = String(row.profile_id);
      let voter = byProfile.get(profileId);
      if (!voter) {
        voter = {
          userId: String(row.user_id),
          profileId,
          nickname: String(row.nickname),
          songs: [],
        };
        byProfile.set(profileId, voter);
      }

      if (row.reference_song_id === null || row.reference_song_id === undefined) continue;
      const score = Number(row.score);
      const adminZero = Boolean(row.admin_zero);
      if (score !== 0 && score !== 1) {
        throw new CongregationPreferenceAdminError("conflict", "Congregation preference contains an invalid score.");
      }
      if (score === 0 && !adminZero) {
        throw new CongregationPreferenceAdminError("conflict", "A voter-set zero preference must not be exposed to Admin.");
      }
      voter.songs.push({
        referenceSongId: String(row.reference_song_id),
        displayNumber: String(row.canonical_number),
        title: String(row.title),
        language: String(row.language) as "czech" | "polish",
        score,
        adminZero,
      });
    }
    return [...byProfile.values()];
  }

  async setPreferenceScore(
    headers: Headers,
    input: { profileId: unknown; referenceSongId: unknown; score: unknown },
  ) {
    const admin = await this.requireAdmin(headers);
    const profileId = requireId(input.profileId, "profileId");
    const referenceSongId = requireId(input.referenceSongId, "referenceSongId");
    const score = input.score === 0 || input.score === 1 ? input.score : Number(input.score);
    if (score !== 0 && score !== 1) {
      throw new CongregationPreferenceAdminError("invalidInput", "Congregation preference score must be 0 or 1.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await this.requirePreferenceTarget(client, profileId, referenceSongId, true);
      const beforeScore = Number(target.score);
      if (beforeScore !== 0 && beforeScore !== 1) {
        throw new CongregationPreferenceAdminError("conflict", "Congregation preference contains an invalid score.");
      }
      if (beforeScore !== score) {
        await client.query(
          "update reference_song_preferences set score = $3, updated_at = now() where profile_id = $1 and reference_song_id = $2",
          [profileId, referenceSongId, score],
        );
        await appendAuditEvent(client, {
          actor: humanAuditActor({
            userId: admin.id,
            displayName: admin.displayName,
            role: "admin",
            ...(admin.personId ? { personId: admin.personId } : {}),
          }),
          action: "preference.congregation.admin.set",
          objectKind: "referencePreference",
          objectRef: `${profileId}:${referenceSongId}`,
          beforeState: { nickname: target.nickname, score: beforeScore },
          afterState: { nickname: target.nickname, score },
        });
      }
      await client.query("commit");
      return { profileId, referenceSongId, nickname: target.nickname, beforeScore, score };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeError(error);
    } finally {
      client.release();
    }
  }

  async removePreference(
    headers: Headers,
    input: { profileId: unknown; referenceSongId: unknown },
  ) {
    const admin = await this.requireAdmin(headers);
    const profileId = requireId(input.profileId, "profileId");
    const referenceSongId = requireId(input.referenceSongId, "referenceSongId");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await this.requirePreferenceTarget(client, profileId, referenceSongId, true);
      const beforeScore = Number(target.score);
      if (beforeScore !== 1 && !(beforeScore === 0 && target.adminZero)) {
        throw new CongregationPreferenceAdminError("conflict", "Only a visible congregation preference can be removed here.");
      }
      await client.query(
        "delete from reference_song_preferences where profile_id = $1 and reference_song_id = $2",
        [profileId, referenceSongId],
      );
      await appendAuditEvent(client, {
        actor: humanAuditActor({
          userId: admin.id,
          displayName: admin.displayName,
          role: "admin",
          ...(admin.personId ? { personId: admin.personId } : {}),
        }),
        action: "preference.congregation.admin.remove",
        objectKind: "referencePreference",
        objectRef: `${profileId}:${referenceSongId}`,
        beforeState: { nickname: target.nickname, score: beforeScore },
        afterState: null,
      });
      await client.query("commit");
      return { profileId, referenceSongId, nickname: target.nickname, removedScore: beforeScore };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeError(error);
    } finally {
      client.release();
    }
  }

  async deleteNickname(headers: Headers, input: { userId: unknown }) {
    const admin = await this.requireAdmin(headers);
    const userId = requireId(input.userId, "userId");
    if (!userId.startsWith("congregation-voter:")) {
      throw new CongregationPreferenceAdminError("permissionDenied", "Only congregation nickname profiles can be deleted here.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await this.requireNicknameTarget(client, userId);
      const preferenceResult = await client.query(
        "select reference_song_id, score from reference_song_preferences where profile_id = $1 order by reference_song_id",
        [target.profileId],
      );
      const preferences = preferenceResult.rows.map((row) => ({
        referenceSongId: String(row.reference_song_id),
        score: Number(row.score),
      }));

      await appendAuditEvent(client, {
        actor: humanAuditActor({
          userId: admin.id,
          displayName: admin.displayName,
          role: "admin",
          ...(admin.personId ? { personId: admin.personId } : {}),
        }),
        action: "preference.congregation.admin.nickname.delete",
        objectKind: "congregationPreferenceProfile",
        objectRef: target.profileId,
        beforeState: { nickname: target.nickname, preferences },
        afterState: null,
      });
      await client.query("delete from app_users where id = $1", [userId]);
      await client.query("commit");
      return { userId, profileId: target.profileId, nickname: target.nickname, preferenceCount: preferences.length };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeError(error);
    } finally {
      client.release();
    }
  }

  private async requireAdmin(headers: Headers) {
    try {
      const user = await resolveProtectedUser(headers, this.pool);
      if (!user.roles.includes("admin")) {
        throw new CongregationPreferenceAdminError("permissionDenied", "Admin role is required.");
      }
      return user;
    } catch (error) {
      if (error instanceof CongregationPreferenceAdminError) throw error;
      if (error instanceof ProtectedActorError) {
        throw new CongregationPreferenceAdminError(
          error.code === "unauthenticated" ? "unauthenticated" : "permissionDenied",
          error.message,
        );
      }
      throw error;
    }
  }

  private async requirePreferenceTarget(
    client: PoolClient,
    profileId: string,
    referenceSongId: string,
    requireExistingPreference: boolean,
  ) {
    const result = await client.query(
      `select pp.id profile_id, u.id user_id, u.display_name nickname,
              rsp.score, rcs.language, rcs.canonical_number, rcs.title,
              (
                rsp.score = 0
                and latest.action = 'preference.congregation.admin.set'
                and latest.after_state ->> 'score' = '0'
              ) as admin_zero
         from preference_profiles pp
         join app_users u on u.id = pp.user_id
         join reference_catalog_songs rcs on rcs.id = $2
         left join reference_song_preferences rsp
           on rsp.profile_id = pp.id and rsp.reference_song_id = rcs.id
         left join lateral (
           select ae.action, ae.after_state
             from audit_events ae
            where ae.object_kind = 'referencePreference'
              and ae.object_ref = pp.id || ':' || rcs.id
              and ae.action in ('preference.congregation.admin.set', 'preference.reference.save')
            order by ae.occurred_at desc, ae.id desc
            limit 1
         ) latest on true
        where pp.id = $1
          and pp.category = 'congregation_member'
          and u.id like 'congregation-voter:%'
          and u.active = true
          and exists (
            select 1 from app_user_roles roles
             where roles.user_id = u.id and roles.role = 'congregation_member'
          )
          and not exists (
            select 1 from app_user_roles other_roles
             where other_roles.user_id = u.id and other_roles.role <> 'congregation_member'
          )
          and not exists (
            select 1 from protected_account_actor_links links where links.app_user_id = u.id
          )
        for update of pp, u`,
      [profileId, referenceSongId],
    );
    if (!result.rows[0]) {
      throw new CongregationPreferenceAdminError("notFound", "Congregation nickname preference was not found.");
    }
    if (requireExistingPreference && result.rows[0].score === null) {
      throw new CongregationPreferenceAdminError("notFound", "Congregation preference was not found.");
    }
    return {
      profileId: String(result.rows[0].profile_id),
      userId: String(result.rows[0].user_id),
      nickname: String(result.rows[0].nickname),
      score: result.rows[0].score === null ? null : Number(result.rows[0].score),
      adminZero: Boolean(result.rows[0].admin_zero),
    };
  }

  private async requireNicknameTarget(client: PoolClient, userId: string) {
    const result = await client.query(
      `select u.id user_id, u.display_name nickname, pp.id profile_id
         from app_users u
         join preference_profiles pp on pp.user_id = u.id and pp.category = 'congregation_member'
        where u.id = $1
          and u.id like 'congregation-voter:%'
          and exists (
            select 1 from app_user_roles roles
             where roles.user_id = u.id and roles.role = 'congregation_member'
          )
          and not exists (
            select 1 from app_user_roles other_roles
             where other_roles.user_id = u.id and other_roles.role <> 'congregation_member'
          )
          and not exists (
            select 1 from protected_account_actor_links links where links.app_user_id = u.id
          )
        for update of u, pp`,
      [userId],
    );
    if (!result.rows[0]) {
      throw new CongregationPreferenceAdminError("notFound", "Congregation nickname profile was not found.");
    }
    return {
      userId: String(result.rows[0].user_id),
      profileId: String(result.rows[0].profile_id),
      nickname: String(result.rows[0].nickname),
    };
  }
}

function validateLanguage(value: string): asserts value is CongregationPreferenceAdminLanguage {
  if (value !== "czech" && value !== "polish" && value !== "mixed") {
    throw new CongregationPreferenceAdminError("invalidInput", "Language must be czech, polish or mixed.");
  }
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CongregationPreferenceAdminError("invalidInput", `${label} is required.`);
  }
  return value.trim();
}

async function serializeAdminMutation(client: PoolClient) {
  await client.query("select pg_advisory_xact_lock(hashtext('organy-congregation-preference-admin'))");
}

function normalizeError(error: unknown) {
  if (error instanceof CongregationPreferenceAdminError) return error;
  return error;
}
