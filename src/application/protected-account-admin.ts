import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Pool, PoolClient } from "pg";
import { createOrganyAuth } from "../auth/server";
import { ProtectedActorError, resolveProtectedUser } from "./protected-actor";

const PROTECTED_ROLES = ["admin", "priest", "organist"] as const;
export type ProtectedRole = typeof PROTECTED_ROLES[number];
export type ProtectedAccountAdminRow = { authUserId: string; appUserId: string; username: string; displayName: string; active: boolean; roles: ProtectedRole[]; personId?: string; personDisplayName?: string; personPriest?: boolean; personOrganist?: boolean };
export type ProtectedAccountProvisionTarget = { appUserId: string; displayName: string; currentRoles: string[]; personId?: string; personDisplayName?: string; personPriest?: boolean; personOrganist?: boolean };
export type ProtectedAccountAdminSnapshot = { accounts: ProtectedAccountAdminRow[]; eligibleActors: ProtectedAccountProvisionTarget[] };

export class ProtectedAccountAdminError extends Error {
  constructor(readonly code: "invalidInput" | "unauthenticated" | "permissionDenied" | "notFound" | "conflict", message: string) { super(message); this.name = "ProtectedAccountAdminError"; }
}

export class PostgresProtectedAccountAdminService {
  constructor(private readonly pool: Pool) {}

  async list(headers: Headers): Promise<ProtectedAccountAdminSnapshot> {
    await this.requireAdmin(headers);
    const [accounts, eligibleActors] = await Promise.all([
      this.pool.query(`
        select au.id auth_user_id, au.username, u.id app_user_id, u.display_name, u.active,
          u.person_id, p.display_name person_display_name, p.priest person_priest, p.organist person_organist,
          coalesce(array_agg(r.role order by r.role) filter (where r.role in ('admin','priest','organist')), '{}') protected_roles
        from protected_account_actor_links l
        join auth_users au on au.id = l.auth_user_id
        join app_users u on u.id = l.app_user_id
        left join app_user_roles r on r.user_id = u.id
        left join catalog_persons p on p.id = u.person_id
        group by au.id, u.id, p.id
        order by lower(u.display_name), lower(au.username)
      `),
      this.pool.query(`
        select u.id app_user_id, u.display_name, u.person_id,
          p.display_name person_display_name, p.priest person_priest, p.organist person_organist,
          coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') roles
        from app_users u
        left join protected_account_actor_links l on l.app_user_id = u.id
        left join app_user_roles r on r.user_id = u.id
        left join catalog_persons p on p.id = u.person_id
        where u.active = true and l.app_user_id is null
          and u.id not like 'congregation-voter:%'
          and not exists (select 1 from preference_profiles pp where pp.user_id = u.id and pp.id like 'congregation-pref:%')
        group by u.id, p.id
        order by lower(u.display_name)
      `),
    ]);
    return {
      accounts: accounts.rows.map(mapAccount),
      eligibleActors: eligibleActors.rows.map((row) => ({
        appUserId: String(row.app_user_id), displayName: String(row.display_name), currentRoles: normalizeTextArray(row.roles),
        ...(row.person_id ? { personId: String(row.person_id) } : {}), ...(row.person_display_name ? { personDisplayName: String(row.person_display_name) } : {}),
        ...(row.person_id ? { personPriest: Boolean(row.person_priest), personOrganist: Boolean(row.person_organist) } : {}),
      })),
    };
  }

  async provision(headers: Headers, input: { appUserId?: unknown; username?: unknown; password?: unknown; roles?: unknown }) {
    await this.requireAdmin(headers);
    const appUserId = requireText(input.appUserId, "Application user is required.");
    const username = validateUsername(input.username);
    const password = validatePassword(input.password, "Initial password");
    const roles = validateProtectedRoles(input.roles, true);
    const client = await this.pool.connect();
    let createdAuthUserId: string | undefined;
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const actor = await client.query(`
        select u.id, u.display_name, u.active,
          exists(select 1 from protected_account_actor_links l where l.app_user_id = u.id) linked,
          exists(select 1 from preference_profiles p where p.user_id = u.id and p.id like 'congregation-pref:%') nickname_profile
        from app_users u where u.id = $1 for update
      `, [appUserId]);
      const row = actor.rows[0];
      if (!row) throw new ProtectedAccountAdminError("notFound", "Application user was not found.");
      if (!Boolean(row.active)) throw new ProtectedAccountAdminError("conflict", "Only an active application user can receive a protected Account.");
      if (String(row.id).startsWith("congregation-voter:") || Boolean(row.nickname_profile)) throw new ProtectedAccountAdminError("permissionDenied", "Nickname-only congregation voters cannot receive protected Accounts.");
      if (Boolean(row.linked)) throw new ProtectedAccountAdminError("conflict", "This application user already has a protected Account.");
      if ((await client.query("select 1 from auth_users where username = $1 limit 1", [username])).rows[0]) throw new ProtectedAccountAdminError("conflict", "Username is already in use.");

      const provisioningAuth = createOrganyAuth({ allowSignUp: true });
      const result = await provisioningAuth.api.signUpEmail({ body: { email: `protected-${randomUUID()}@organy.invalid`, name: String(row.display_name), password, username } });
      createdAuthUserId = result.user.id;
      await client.query("delete from auth_sessions where user_id = $1", [createdAuthUserId]);
      await replaceProtectedRoles(client, appUserId, roles);
      await client.query("insert into protected_account_actor_links (auth_user_id, app_user_id) values ($1, $2)", [createdAuthUserId, appUserId]);
      await client.query("commit");
      return { account: await this.getAccount(appUserId), currentAdminLostAccess: false as const };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (createdAuthUserId) await this.pool.query("delete from auth_users where id = $1", [createdAuthUserId]).catch(() => undefined);
      if (error instanceof ProtectedAccountAdminError) throw error;
      throw new ProtectedAccountAdminError("invalidInput", "Protected Account could not be provisioned.");
    } finally { client.release(); }
  }

  async updateRoles(headers: Headers, input: { appUserId?: unknown; roles?: unknown }) {
    const currentAdmin = await this.requireAdmin(headers);
    const appUserId = requireText(input.appUserId, "Application user is required.");
    const roles = validateProtectedRoles(input.roles, false);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await requireLinkedTarget(client, appUserId);
      if (target.active && roles.length === 0) throw new ProtectedAccountAdminError("invalidInput", "An active protected Account must keep at least one protected role.");
      if (target.active && target.roles.includes("admin") && !roles.includes("admin")) await assertAnotherActiveAdmin(client, appUserId);
      await replaceProtectedRoles(client, appUserId, roles);
      await client.query("commit");
      return { account: await this.getAccount(appUserId), currentAdminLostAccess: currentAdmin.id === appUserId && !roles.includes("admin") };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeAdminError(error);
    } finally { client.release(); }
  }

  async setActive(headers: Headers, input: { appUserId?: unknown; active?: unknown }) {
    const currentAdmin = await this.requireAdmin(headers);
    const appUserId = requireText(input.appUserId, "Application user is required.");
    if (typeof input.active !== "boolean") throw new ProtectedAccountAdminError("invalidInput", "Active state is required.");
    const active = input.active;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await requireLinkedTarget(client, appUserId);
      if (active && target.roles.length === 0) throw new ProtectedAccountAdminError("invalidInput", "A protected Account needs at least one protected role before reactivation.");
      if (!active && target.active && target.roles.includes("admin")) await assertAnotherActiveAdmin(client, appUserId);
      await client.query("update app_users set active = $2, updated_at = now() where id = $1", [appUserId, active]);
      if (!active) await client.query("delete from auth_sessions where user_id = $1", [target.authUserId]);
      await client.query("commit");
      return { account: await this.getAccount(appUserId), currentAdminLostAccess: currentAdmin.id === appUserId && !active };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeAdminError(error);
    } finally { client.release(); }
  }

  async resetPassword(headers: Headers, input: { appUserId?: unknown; password?: unknown }) {
    const currentAdmin = await this.requireAdmin(headers);
    const appUserId = requireText(input.appUserId, "Application user is required.");
    if (currentAdmin.id === appUserId) throw new ProtectedAccountAdminError("permissionDenied", "Use Change password to change your own password.");
    const password = validatePassword(input.password, "Replacement password");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await requireLinkedTarget(client, appUserId);
      await replaceCredentialPasswordAndRevokeSessions(client, target.authUserId, password);
      await client.query("commit");
      return { account: await this.getAccount(appUserId), sessionsRevoked: true as const };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeAdminError(error);
    } finally { client.release(); }
  }

  async deleteAccount(headers: Headers, input: { appUserId?: unknown }) {
    const currentAdmin = await this.requireAdmin(headers);
    const appUserId = requireText(input.appUserId, "Application user is required.");
    if (currentAdmin.id === appUserId) throw new ProtectedAccountAdminError("permissionDenied", "Sign in as another admin before deleting your own protected Account.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await requireLinkedTarget(client, appUserId);
      if (target.active && target.roles.includes("admin")) await assertAnotherActiveAdmin(client, appUserId);
      await client.query("delete from auth_sessions where user_id = $1", [target.authUserId]);
      await client.query("delete from auth_users where id = $1", [target.authUserId]);
      await client.query("commit");
      return { appUserId, deletedAuthUserId: target.authUserId, currentAdminLostAccess: false as const };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeAdminError(error);
    } finally { client.release(); }
  }

  async deletePerson(headers: Headers, input: { personId?: unknown }) {
    await this.requireAdmin(headers);
    const personId = requireText(input.personId, "Person is required.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const person = await client.query("select id, display_name from catalog_persons where id = $1 for update", [personId]);
      if (!person.rows[0]) throw new ProtectedAccountAdminError("notFound", "Person was not found.");
      const serviceUse = await client.query("select 1 from service_contexts where priest_id = $1 or organist_id = $1 limit 1", [personId]);
      if (serviceUse.rows[0]) throw new ProtectedAccountAdminError("conflict", "Person is referenced by service history or an active plan. Deactivate the Person instead of deleting it.");
      const protectedUse = await client.query(`select 1 from app_users u join protected_account_actor_links l on l.app_user_id = u.id where u.person_id = $1 limit 1`, [personId]);
      if (protectedUse.rows[0]) throw new ProtectedAccountAdminError("conflict", "Delete the protected Account before deleting this Person.");
      await client.query("delete from app_users where person_id = $1", [personId]);
      await client.query("delete from catalog_persons where id = $1", [personId]);
      await client.query("commit");
      return { personId, displayName: String(person.rows[0].display_name), currentAdminLostAccess: false as const };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeAdminError(error);
    } finally { client.release(); }
  }

  private async requireAdmin(headers: Headers) {
    try {
      const user = await resolveProtectedUser(headers, this.pool);
      if (!user.roles.includes("admin")) throw new ProtectedAccountAdminError("permissionDenied", "Admin role is required.");
      return user;
    } catch (error) {
      if (error instanceof ProtectedAccountAdminError) throw error;
      if (error instanceof ProtectedActorError) throw new ProtectedAccountAdminError(error.code === "unauthenticated" ? "unauthenticated" : "permissionDenied", error.message);
      throw error;
    }
  }

  private async getAccount(appUserId: string): Promise<ProtectedAccountAdminRow> {
    const result = await this.pool.query(`
      select au.id auth_user_id, au.username, u.id app_user_id, u.display_name, u.active,
        u.person_id, p.display_name person_display_name, p.priest person_priest, p.organist person_organist,
        coalesce(array_agg(r.role order by r.role) filter (where r.role in ('admin','priest','organist')), '{}') protected_roles
      from protected_account_actor_links l join auth_users au on au.id = l.auth_user_id join app_users u on u.id = l.app_user_id
      left join app_user_roles r on r.user_id = u.id left join catalog_persons p on p.id = u.person_id
      where u.id = $1 group by au.id, u.id, p.id
    `, [appUserId]);
    if (!result.rows[0]) throw new ProtectedAccountAdminError("notFound", "Protected Account was not found.");
    return mapAccount(result.rows[0]);
  }
}

export async function replaceCredentialPasswordAndRevokeSessions(client: PoolClient, authUserId: string, password: string) {
  const hashedPassword = await hashPassword(password);
  const updated = await client.query(
    "update auth_accounts set password = $2, updated_at = now() where user_id = $1 and provider_id = 'credential' and password is not null returning id",
    [authUserId, hashedPassword],
  );
  if (updated.rows.length !== 1) throw new ProtectedAccountAdminError("conflict", "Protected credential Account was not found.");
  await client.query("delete from auth_sessions where user_id = $1", [authUserId]);
}

async function serializeAdminMutation(client: PoolClient) { await client.query("select pg_advisory_xact_lock(hashtext('organy-protected-account-admin'))"); }
async function requireLinkedTarget(client: PoolClient, appUserId: string) {
  const result = await client.query(`
    select u.id, u.active, l.auth_user_id,
      coalesce((select array_agg(r.role order by r.role) from app_user_roles r where r.user_id = u.id and r.role in ('admin','priest','organist')), '{}') protected_roles
    from app_users u join protected_account_actor_links l on l.app_user_id = u.id
    where u.id = $1 for update of u
  `, [appUserId]);
  if (!result.rows[0]) throw new ProtectedAccountAdminError("notFound", "Protected Account was not found.");
  return { authUserId: String(result.rows[0].auth_user_id), active: Boolean(result.rows[0].active), roles: normalizeProtectedRoles(result.rows[0].protected_roles) };
}
async function assertAnotherActiveAdmin(client: PoolClient, excludedAppUserId: string) {
  const result = await client.query(`
    select count(distinct u.id)::integer n
    from protected_account_actor_links l
    join app_users u on u.id = l.app_user_id and u.active = true
    join app_user_roles r on r.user_id = u.id and r.role = 'admin'
    join auth_accounts aa on aa.user_id = l.auth_user_id and aa.provider_id = 'credential' and aa.password is not null
    where u.id <> $1
  `, [excludedAppUserId]);
  if (Number(result.rows[0]?.n ?? 0) < 1) throw new ProtectedAccountAdminError("conflict", "The last active protected admin cannot lose admin access.");
}
async function replaceProtectedRoles(client: PoolClient, appUserId: string, roles: ProtectedRole[]) {
  await client.query("delete from app_user_roles where user_id = $1 and role in ('admin','priest','organist')", [appUserId]);
  for (const role of roles) await client.query("insert into app_user_roles (user_id, role) values ($1, $2) on conflict do nothing", [appUserId, role]);
}
function mapAccount(row: Record<string, unknown>): ProtectedAccountAdminRow { return { authUserId: String(row.auth_user_id), appUserId: String(row.app_user_id), username: String(row.username), displayName: String(row.display_name), active: Boolean(row.active), roles: normalizeProtectedRoles(row.protected_roles), ...(row.person_id ? { personId: String(row.person_id) } : {}), ...(row.person_display_name ? { personDisplayName: String(row.person_display_name) } : {}), ...(row.person_id ? { personPriest: Boolean(row.person_priest), personOrganist: Boolean(row.person_organist) } : {}) }; }
function validateUsername(value: unknown): string { const username = requireText(value, "Username is required.").toLowerCase(); if (username.length < 3 || username.length > 64 || !/^[a-z0-9._-]+$/.test(username)) throw new ProtectedAccountAdminError("invalidInput", "Username must be 3-64 characters using letters, numbers, dot, underscore, or hyphen."); return username; }
function validatePassword(value: unknown, label: string): string { if (typeof value !== "string" || value.length < 8 || value.length > 128) throw new ProtectedAccountAdminError("invalidInput", `${label} must contain 8-128 characters.`); return value; }
function validateProtectedRoles(value: unknown, requireAtLeastOne: boolean): ProtectedRole[] { if (!Array.isArray(value)) throw new ProtectedAccountAdminError("invalidInput", "Protected roles are required."); const roles = [...new Set(value.map(String))]; if (roles.some((role) => !PROTECTED_ROLES.includes(role as ProtectedRole))) throw new ProtectedAccountAdminError("invalidInput", "Protected roles may contain only admin, priest, or organist."); if (requireAtLeastOne && roles.length === 0) throw new ProtectedAccountAdminError("invalidInput", "At least one protected role is required."); return roles as ProtectedRole[]; }
function normalizeProtectedRoles(value: unknown): ProtectedRole[] { return normalizeTextArray(value).filter((role): role is ProtectedRole => PROTECTED_ROLES.includes(role as ProtectedRole)); }
function normalizeTextArray(value: unknown): string[] { if (Array.isArray(value)) return value.map(String); if (typeof value === "string") return value.replace(/[{}]/g, "").split(",").filter(Boolean); return []; }
function requireText(value: unknown, message: string): string { if (typeof value !== "string" || !value.trim()) throw new ProtectedAccountAdminError("invalidInput", message); return value.trim(); }
function normalizeAdminError(error: unknown): ProtectedAccountAdminError { if (error instanceof ProtectedAccountAdminError) return error; return new ProtectedAccountAdminError("conflict", error instanceof Error ? error.message : "Protected Account administration failed."); }
