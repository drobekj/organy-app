import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { appendAuditEvent, systemAuditActor } from "./audit-history";
import type { CongregationVoterMailer } from "./congregation-voter-mailer";
import { confirmationUrl } from "./congregation-voter-mailer";

const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BOOTSTRAP_REGISTRATION_LIMIT = 50;
const WEEKLY_REGISTRATION_LIMIT = 10;
const REGISTRATION_TIME_ZONE = "Europe/Prague";

export type CongregationVoterStatus = "pending" | "active" | "legacy_unverified";

export type CongregationVoterContext = {
  accountId: string;
  nickname: string;
  userId: string;
  profileId: string;
  role: "congregationMember";
  status: "active" | "legacy_unverified";
};

export type CongregationVoterSession = { context: CongregationVoterContext; token: string };
export type CongregationOwnPreference = { nickname: string; referenceSongId: string; score: 0 | 1 | null; limit: 1 };
export type CongregationOwnPreferenceEntry = { referenceSongId: string; score: 0 | 1 };

export type CongregationSignInResult =
  | { kind: "signedIn"; session: CongregationVoterSession }
  | { kind: "pending"; nickname: string }
  | { kind: "missing"; nickname: string };

export type CongregationRegistrationResult =
  | { kind: "created" | "legacyClaimCreated" }
  | { kind: "alreadyRegistered" }
  | { kind: "reservedNickname" }
  | { kind: "registeredEmail" }
  | { kind: "awaitingConfirmation"; nickname: string };

export type CongregationResendResult = { kind: "sent" } | { kind: "alreadyConfirmed" } | { kind: "missing" };
export type CongregationRecoveryResult = { kind: "sent" } | { kind: "missing" };
export type CongregationConfirmationResult =
  | { kind: "confirmed"; session: CongregationVoterSession }
  | { kind: "alreadyConfirmed" }
  | { kind: "expired"; nickname: string }
  | { kind: "invalid" };

export type CongregationRequestContext = { ipAddress?: string; currentSessionToken?: string };

type ServiceOptions = {
  mailer?: CongregationVoterMailer;
  canonicalBaseUrl?: string;
  securitySecret?: string;
  now?: () => Date;
};

export class CongregationVoterError extends Error {
  constructor(
    readonly code:
      | "invalidInput" | "permissionDenied" | "notFound" | "unauthenticated" | "conflict"
      | "rateLimited" | "frozen" | "quotaReached" | "mailUnavailable",
    message: string,
  ) {
    super(message);
    this.name = "CongregationVoterError";
  }
}

export function normalizeCongregationNickname(value: unknown): { display: string; normalized: string } {
  if (typeof value !== "string") throw new CongregationVoterError("invalidInput", "Nickname is required.");
  const display = value.trim();
  if (!display) throw new CongregationVoterError("invalidInput", "Nickname must not be empty.");
  if (display.length > 64) throw new CongregationVoterError("invalidInput", "Nickname must contain at most 64 characters.");
  return { display, normalized: display.toLocaleLowerCase("cs-CZ") };
}

export function normalizeCongregationEmail(value: unknown): { display: string; normalized: string } {
  if (typeof value !== "string") throw new CongregationVoterError("invalidInput", "Enter a valid email address.");
  const display = value.trim();
  const normalized = display.toLowerCase();
  if (display.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(display)) {
    throw new CongregationVoterError("invalidInput", "Enter a valid email address.");
  }
  return { display, normalized };
}

export class PostgresCongregationPreferenceService {
  constructor(private readonly pool: Pool, private readonly options: ServiceOptions = {}) {}

  async signIn(rawNickname: unknown): Promise<CongregationSignInResult> {
    const nickname = normalizeCongregationNickname(rawNickname);
    const account = await this.pool.query(
      "select id, nickname, status from congregation_voter_accounts where nickname_normalized = $1",
      [nickname.normalized],
    );
    if (!account.rows[0]) return { kind: "missing", nickname: nickname.display };
    if (String(account.rows[0].status) === "pending") return { kind: "pending", nickname: String(account.rows[0].nickname) };
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const context = await this.resolveAccountContext(client, String(account.rows[0].id), true);
      const session = await this.createSession(client, context);
      await client.query("commit");
      return { kind: "signedIn", session };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async requestRegistration(rawNickname: unknown, rawEmail: unknown, request: CongregationRequestContext = {}): Promise<CongregationRegistrationResult> {
    const nickname = normalizeCongregationNickname(rawNickname);
    const email = normalizeCongregationEmail(rawEmail);
    await this.consumeRateLimits("register", request.ipAddress, [nickname.normalized, email.normalized]);
    const legacyContext = request.currentSessionToken
      ? await this.resolveContext(request.currentSessionToken).catch(() => undefined)
      : undefined;
    const client = await this.pool.connect();
    let delivery: { accountId: string; token: string; tokenId: string; legacy: boolean } | undefined;
    try {
      await client.query("begin");
      await serializeRegistration(client);
      await this.assertRegistrationOpen(client);
      const nicknameResult = await client.query(
        "select * from congregation_voter_accounts where nickname_normalized = $1 for update",
        [nickname.normalized],
      );
      const emailResult = await client.query(
        "select * from congregation_voter_accounts where email_normalized = $1 for update",
        [email.normalized],
      );
      const byNickname = nicknameResult.rows[0] as Record<string, unknown> | undefined;
      const byEmail = emailResult.rows[0] as Record<string, unknown> | undefined;
      if (byNickname) {
        const status = String(byNickname.status) as CongregationVoterStatus;
        const sameEmail = byNickname.email_normalized === email.normalized;
        if (status === "active") {
          await client.query("commit");
          return { kind: sameEmail ? "alreadyRegistered" : "reservedNickname" };
        }
        if (status === "pending" || byNickname.email_normalized !== null) {
          await client.query("commit");
          return sameEmail ? { kind: "awaitingConfirmation", nickname: String(byNickname.nickname) } : { kind: "reservedNickname" };
        }
        if (!legacyContext || legacyContext.userId !== String(byNickname.user_id)) {
          await client.query("commit");
          return { kind: "reservedNickname" };
        }
        if (byEmail && String(byEmail.id) !== String(byNickname.id)) {
          await client.query("commit");
          return { kind: "registeredEmail" };
        }
        await client.query(
          "update congregation_voter_accounts set email = $2, email_normalized = $3, updated_at = $4 where id = $1",
          [String(byNickname.id), email.display, email.normalized, this.now()],
        );
        delivery = await this.replaceConfirmationToken(client, String(byNickname.id));
        delivery.legacy = true;
      } else {
        if (byEmail) {
          await client.query("commit");
          return { kind: "registeredEmail" };
        }
        const accountId = `congregation-account:${randomUUID()}`;
        const now = this.now();
        await client.query(
          `insert into congregation_voter_accounts
             (id, nickname, nickname_normalized, email, email_normalized, status, is_new_registration, created_at, updated_at)
           values ($1,$2,$3,$4,$5,'pending',true,$6,$6)`,
          [accountId, nickname.display, nickname.normalized, email.display, email.normalized, now],
        );
        delivery = await this.replaceConfirmationToken(client, accountId);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeDatabaseConflict(error);
    } finally { client.release(); }
    if (!delivery) throw new CongregationVoterError("conflict", "Registration could not be created.");
    await this.sendConfirmation(delivery.accountId, delivery.token, delivery.tokenId);
    return { kind: delivery.legacy ? "legacyClaimCreated" : "created" };
  }

  async resendConfirmation(rawNickname: unknown, request: CongregationRequestContext = {}): Promise<CongregationResendResult> {
    const nickname = normalizeCongregationNickname(rawNickname);
    await this.consumeRateLimits("resend", request.ipAddress, [nickname.normalized]);
    const client = await this.pool.connect();
    let delivery: { accountId: string; token: string; tokenId: string } | undefined;
    try {
      await client.query("begin");
      await serializeRegistration(client);
      await this.assertRegistrationOpen(client);
      const result = await client.query(
        "select id, status, email from congregation_voter_accounts where nickname_normalized = $1 for update",
        [nickname.normalized],
      );
      const account = result.rows[0];
      if (!account || account.email === null) {
        await client.query("commit");
        return { kind: "missing" };
      }
      if (String(account.status) === "active") {
        await client.query("commit");
        return { kind: "alreadyConfirmed" };
      }
      delivery = await this.replaceConfirmationToken(client, String(account.id));
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    await this.sendConfirmation(delivery!.accountId, delivery!.token, delivery!.tokenId);
    return { kind: "sent" };
  }

  async recoverNickname(rawEmail: unknown, request: CongregationRequestContext = {}): Promise<CongregationRecoveryResult> {
    const email = normalizeCongregationEmail(rawEmail);
    await this.consumeRateLimits("recover", request.ipAddress, [email.normalized]);
    const result = await this.pool.query(
      "select id, nickname, email from congregation_voter_accounts where email_normalized = $1 and status = 'active'",
      [email.normalized],
    );
    if (!result.rows[0]) return { kind: "missing" };
    try {
      await this.requireMailer().sendNicknameRecovery({
        to: String(result.rows[0].email),
        nickname: String(result.rows[0].nickname),
        deliveryId: `nickname-recovery:${randomUUID()}`,
      });
    } catch {
      throw new CongregationVoterError("mailUnavailable", "Nickname recovery email could not be sent. Try again later.");
    }
    return { kind: "sent" };
  }

  async confirmRegistration(rawToken: unknown, request: CongregationRequestContext = {}): Promise<CongregationConfirmationResult> {
    if (typeof rawToken !== "string" || !/^cvc_[A-Za-z0-9_-]{40,}$/.test(rawToken)) return { kind: "invalid" };
    await this.consumeRateLimits("confirm", request.ipAddress, []);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeRegistration(client);
      const tokenResult = await client.query(
        `select t.id token_id, t.expires_at, t.used_at, t.invalidated_at,
                a.id account_id, a.user_id, a.nickname, a.status, a.is_new_registration
           from congregation_confirmation_tokens t
           join congregation_voter_accounts a on a.id = t.account_id
          where t.token_hash = $1 for update of t, a`,
        [hashToken(rawToken)],
      );
      const row = tokenResult.rows[0];
      if (!row || row.invalidated_at !== null) {
        await client.query("commit");
        return { kind: "invalid" };
      }
      if (row.used_at !== null || String(row.status) === "active") {
        await client.query("commit");
        return { kind: "alreadyConfirmed" };
      }
      const now = this.now();
      if (new Date(String(row.expires_at)).getTime() <= now.getTime()) {
        await client.query("commit");
        return { kind: "expired", nickname: String(row.nickname) };
      }
      await this.assertRegistrationOpen(client);
      const isNew = Boolean(row.is_new_registration);
      const quota = isNew ? await this.requireActivationQuota(client, now) : { completesBootstrap: false };
      let userId = row.user_id === null ? undefined : String(row.user_id);
      if (!userId) {
        const identityId = randomUUID();
        userId = `congregation-voter:${identityId}`;
        const profileId = `congregation-pref:${identityId}`;
        await client.query(
          "insert into app_users (id, display_name, active, created_at, updated_at) values ($1,$2,true,$3,$3)",
          [userId, String(row.nickname), now],
        );
        await client.query("insert into app_user_roles (user_id, role) values ($1,'congregation_member')", [userId]);
        await client.query(
          "insert into preference_profiles (id, user_id, category, created_at, updated_at) values ($1,$2,'congregation_member',$3,$3)",
          [profileId, userId, now],
        );
      }
      await client.query(
        "update congregation_voter_accounts set user_id = $2, status = 'active', confirmed_at = $3, updated_at = $3 where id = $1",
        [String(row.account_id), userId, now],
      );
      await client.query("update congregation_confirmation_tokens set used_at = $2 where id = $1", [String(row.token_id), now]);
      if (quota.completesBootstrap) {
        await client.query(
          "update congregation_registration_control set bootstrap_completed_at = $1, updated_at = $1 where id = 'global'",
          [now],
        );
      }
      await appendAuditEvent(client, {
        actor: systemAuditActor(),
        action: isNew ? "congregation.registration.confirm" : "congregation.registration.legacy-claim",
        objectKind: "congregationVoterAccount",
        objectRef: String(row.account_id),
        beforeState: { status: String(row.status) },
        afterState: { status: "active", preservedLegacyIdentity: !isNew },
      });
      const context = await this.resolveAccountContext(client, String(row.account_id), false);
      const session = await this.createSession(client, context);
      await client.query("commit");
      return { kind: "confirmed", session };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async resolveContext(token: unknown): Promise<CongregationVoterContext> {
    if (typeof token !== "string" || !/^cvs_[A-Za-z0-9_-]{40,}$/.test(token)) {
      throw new CongregationVoterError("unauthenticated", "Sign in with your nickname to open Congregation Preferences.");
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        "select account_id from congregation_voter_sessions where token_hash = $1 and expires_at > $2 for update",
        [hashToken(token), this.now()],
      );
      if (!result.rows[0]) throw new CongregationVoterError("unauthenticated", "Congregation voter session is missing or expired.");
      const context = await this.resolveAccountContext(client, String(result.rows[0].account_id), false);
      await client.query("commit");
      return context;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async clearSession(token: unknown): Promise<void> {
    if (typeof token !== "string") return;
    await this.pool.query("delete from congregation_voter_sessions where token_hash = $1", [hashToken(token)]);
  }

  async getOwnReferencePreference(token: unknown, referenceSongId: unknown): Promise<CongregationOwnPreference> {
    const songId = validateReferenceSongId(referenceSongId);
    const context = await this.resolveContext(token);
    await this.requireReferenceSong(songId);
    const result = await this.pool.query("select score from reference_song_preferences where profile_id = $1 and reference_song_id = $2", [context.profileId, songId]);
    const score = result.rows[0] ? Number(result.rows[0].score) : null;
    if (score !== null && score !== 0 && score !== 1) throw new CongregationVoterError("permissionDenied", "Congregation preference profile contains an invalid score.");
    return { nickname: context.nickname, referenceSongId: songId, score, limit: 1 };
  }

  async listOwnReferencePreferences(token: unknown): Promise<CongregationOwnPreferenceEntry[]> {
    const context = await this.resolveContext(token);
    const result = await this.pool.query(
      `select rsp.reference_song_id, rsp.score from reference_song_preferences rsp
       join reference_catalog_songs rcs on rcs.id = rsp.reference_song_id
       where rsp.profile_id = $1 order by rsp.reference_song_id`,
      [context.profileId],
    );
    return result.rows.map((row) => {
      const score = Number(row.score);
      if (score !== 0 && score !== 1) throw new CongregationVoterError("permissionDenied", "Congregation preference profile contains an invalid score.");
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
      const existing = await client.query("select score from reference_song_preferences where profile_id = $1 and reference_song_id = $2 for update", [context.profileId, songId]);
      const beforeScore = existing.rows[0] ? Number(existing.rows[0].score) : null;
      if (beforeScore !== score) {
        await client.query(
          `insert into reference_song_preferences (profile_id, reference_song_id, score) values ($1,$2,$3)
           on conflict (profile_id, reference_song_id) do update set score = excluded.score, updated_at = now()`,
          [context.profileId, songId, score],
        );
        await appendAuditEvent(client, {
          actor: { kind: "human", userId: context.userId, displayName: context.nickname, role: context.role },
          action: "preference.reference.save", objectKind: "referencePreference", objectRef: `${context.profileId}:${songId}`,
          beforeState: { score: beforeScore }, afterState: { score },
        });
      }
      await client.query("commit");
      return { nickname: context.nickname, referenceSongId: songId, score, limit: 1 };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  private async resolveAccountContext(client: PoolClient, accountId: string, lock: boolean): Promise<CongregationVoterContext> {
    const result = await client.query(
      `select a.id account_id, a.status, a.nickname, u.id user_id, u.active, p.id profile_id,
              array(select r.role from app_user_roles r where r.user_id = u.id order by r.role) roles,
              exists(select 1 from protected_account_actor_links l where l.app_user_id = u.id) protected_link
         from congregation_voter_accounts a
         join app_users u on u.id = a.user_id
         join preference_profiles p on p.user_id = u.id and p.category = 'congregation_member'
        where a.id = $1 and a.status in ('active','legacy_unverified')
        ${lock ? "for update of a, u, p" : ""}`,
      [accountId],
    );
    if (result.rows.length !== 1) throw new CongregationVoterError("unauthenticated", "Congregation voter context is missing.");
    const row = result.rows[0];
    const roles = normalizeTextArray(row.roles);
    if (!Boolean(row.active) || Boolean(row.protected_link) || roles.length !== 1 || roles[0] !== "congregation_member") {
      throw new CongregationVoterError("permissionDenied", "Congregation voter context cannot authorize protected behavior.");
    }
    return {
      accountId: String(row.account_id), nickname: String(row.nickname), userId: String(row.user_id), profileId: String(row.profile_id),
      role: "congregationMember", status: String(row.status) as "active" | "legacy_unverified",
    };
  }

  private async createSession(client: PoolClient, context: CongregationVoterContext): Promise<CongregationVoterSession> {
    const token = `cvs_${randomBytes(32).toString("base64url")}`;
    const now = this.now();
    await client.query(
      "insert into congregation_voter_sessions (id, account_id, token_hash, expires_at, created_at) values ($1,$2,$3,$4,$5)",
      [`congregation-session:${randomUUID()}`, context.accountId, hashToken(token), new Date(now.getTime() + SESSION_TTL_MS), now],
    );
    return { context, token };
  }

  private async replaceConfirmationToken(client: PoolClient, accountId: string) {
    const now = this.now();
    await client.query(
      "update congregation_confirmation_tokens set invalidated_at = $2 where account_id = $1 and used_at is null and invalidated_at is null",
      [accountId, now],
    );
    const token = `cvc_${randomBytes(32).toString("base64url")}`;
    const tokenId = `congregation-confirmation:${randomUUID()}`;
    await client.query(
      "insert into congregation_confirmation_tokens (id, account_id, token_hash, expires_at, created_at) values ($1,$2,$3,$4,$5)",
      [tokenId, accountId, hashToken(token), new Date(now.getTime() + CONFIRMATION_TTL_MS), now],
    );
    return { accountId, token, tokenId, legacy: false };
  }

  private async sendConfirmation(accountId: string, token: string, tokenId: string): Promise<void> {
    const result = await this.pool.query("select nickname, email from congregation_voter_accounts where id = $1", [accountId]);
    if (!result.rows[0]?.email) throw new CongregationVoterError("conflict", "Registration email is missing.");
    try {
      await this.requireMailer().sendConfirmation({
        to: String(result.rows[0].email), nickname: String(result.rows[0].nickname), email: String(result.rows[0].email),
        confirmationUrl: confirmationUrl(this.requireCanonicalBaseUrl(), token), deliveryId: tokenId,
      });
    } catch (error) {
      if (error instanceof CongregationVoterError) throw error;
      throw new CongregationVoterError("mailUnavailable", "Confirmation email could not be sent. Use Resend confirmation to try again.");
    }
  }

  private async assertRegistrationOpen(client: PoolClient): Promise<void> {
    const result = await client.query("select registration_frozen from congregation_registration_control where id = 'global' for update");
    if (!result.rows[0]) throw new CongregationVoterError("conflict", "Registration control is missing.");
    if (Boolean(result.rows[0].registration_frozen)) throw new CongregationVoterError("frozen", "Registration is temporarily unavailable.");
  }

  private async requireActivationQuota(client: PoolClient, now: Date): Promise<{ completesBootstrap: boolean }> {
    const control = await client.query("select registration_frozen, bootstrap_completed_at from congregation_registration_control where id = 'global' for update");
    if (!control.rows[0]) throw new CongregationVoterError("conflict", "Registration control is missing.");
    if (Boolean(control.rows[0].registration_frozen)) throw new CongregationVoterError("frozen", "Registration is temporarily unavailable.");
    const countResult = await client.query("select count(*)::integer count from congregation_voter_accounts where status = 'active' and is_new_registration = true");
    const activeCount = Number(countResult.rows[0].count);
    if (activeCount < BOOTSTRAP_REGISTRATION_LIMIT) return { completesBootstrap: activeCount + 1 === BOOTSTRAP_REGISTRATION_LIMIT };
    const completedAt = control.rows[0].bootstrap_completed_at ? new Date(String(control.rows[0].bootstrap_completed_at)) : now;
    if (!control.rows[0].bootstrap_completed_at) {
      await client.query("update congregation_registration_control set bootstrap_completed_at = $1, updated_at = $1 where id = 'global'", [now]);
    }
    if (pragueDate(completedAt) === pragueDate(now)) throw new CongregationVoterError("quotaReached", "New registrations are closed until tomorrow.");
    const weekly = await client.query(
      `select count(*)::integer count from congregation_voter_accounts
        where status = 'active' and is_new_registration = true and confirmed_at > $1
          and date_trunc('week', confirmed_at at time zone '${REGISTRATION_TIME_ZONE}') =
              date_trunc('week', $2::timestamptz at time zone '${REGISTRATION_TIME_ZONE}')`,
      [completedAt, now],
    );
    if (Number(weekly.rows[0].count) >= WEEKLY_REGISTRATION_LIMIT) throw new CongregationVoterError("quotaReached", "The weekly registration limit has been reached.");
    return { completesBootstrap: false };
  }

  private async consumeRateLimits(action: string, ipAddress: string | undefined, identifiers: string[]): Promise<void> {
    const secret = this.options.securitySecret?.trim();
    if (!secret) throw new CongregationVoterError("conflict", "Congregation registration security is not configured.");
    const now = this.now();
    const checks = [
      { scope: "ip", value: normalizeIp(ipAddress), bucketMs: 15 * 60 * 1000, limit: action === "confirm" ? 20 : 12 },
      ...identifiers.map((value) => ({ scope: "identifier", value, bucketMs: 60 * 60 * 1000, limit: 5 })),
    ];
    const client = await this.pool.connect();
    let blocked = false;
    try {
      await client.query("begin");
      for (const check of checks) {
        const bucketStart = new Date(Math.floor(now.getTime() / check.bucketMs) * check.bucketMs);
        const keyHash = createHmac("sha256", secret).update(`${check.scope}:${check.value}`, "utf8").digest("hex");
        const id = createHash("sha256").update(`${action}:${check.scope}:${keyHash}:${bucketStart.toISOString()}`).digest("hex");
        const result = await client.query(
          `insert into congregation_rate_limit_buckets (id, action, scope, key_hash, bucket_start, request_count, updated_at)
           values ($1,$2,$3,$4,$5,1,$6)
           on conflict (action, scope, key_hash, bucket_start)
           do update set request_count = congregation_rate_limit_buckets.request_count + 1, updated_at = excluded.updated_at
           returning request_count`,
          [id, action, check.scope, keyHash, bucketStart, now],
        );
        if (Number(result.rows[0].request_count) > check.limit) blocked = true;
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    if (blocked) throw new CongregationVoterError("rateLimited", "Too many requests. Try again later.");
  }

  private requireMailer(): CongregationVoterMailer {
    if (!this.options.mailer) throw new CongregationVoterError("conflict", "Congregation email is not configured.");
    return this.options.mailer;
  }

  private requireCanonicalBaseUrl(): string {
    const value = this.options.canonicalBaseUrl?.trim();
    if (!value) throw new CongregationVoterError("conflict", "CONGREGATION_BASE_URL is required.");
    return value;
  }

  private now(): Date { return this.options.now ? this.options.now() : new Date(); }

  private async requireReferenceSong(referenceSongId: string): Promise<void> {
    const result = await this.pool.query("select 1 from reference_catalog_songs where id = $1 limit 1", [referenceSongId]);
    if (result.rows.length !== 1) throw new CongregationVoterError("notFound", "Reference song was not found.");
  }
}

function hashToken(token: string): string { return createHash("sha256").update(token, "utf8").digest("hex"); }

function validateReferenceSongId(value: unknown): string {
  if (typeof value !== "string" || !/^(?:czech|polish):[1-9]\d*$/.test(value)) throw new CongregationVoterError("invalidInput", "A valid referenceSongId is required.");
  return value;
}

function validateCongregationScore(value: unknown): 0 | 1 {
  if (value !== 0 && value !== 1) throw new CongregationVoterError("invalidInput", "Congregation preference score must be 0 or 1.");
  return value;
}

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.replace(/[{}]/g, "").split(",").filter(Boolean);
  return [];
}

function normalizeIp(value: string | undefined): string {
  const first = value?.split(",")[0]?.trim();
  return first && first.length <= 128 ? first : "unknown";
}

function pragueDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REGISTRATION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

async function serializeRegistration(client: PoolClient): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtext('organy-congregation-registration'))");
}

function normalizeDatabaseConflict(error: unknown): unknown {
  if (error instanceof CongregationVoterError) return error;
  if (typeof error === "object" && error !== null && "code" in error && String((error as { code: unknown }).code) === "23505") {
    return new CongregationVoterError("conflict", "Nickname or email is already reserved.");
  }
  return error;
}
