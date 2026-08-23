import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { createOrganyAuth } from "../auth/server";
import { ProtectedActorError, resolveProtectedUser } from "./protected-actor";
import { ProtectedAccountAdminError } from "./protected-account-admin";

export type StaffRole = "priest" | "organist";
export type ProtectedStaffOnboardingInput = {
  personId?: unknown;
  displayName?: unknown;
  username?: unknown;
  password?: unknown;
  roles?: unknown;
};

export class PostgresProtectedStaffOnboardingService {
  constructor(private readonly pool: Pool) {}

  async create(headers: Headers, input: ProtectedStaffOnboardingInput) {
    await this.requireAdmin(headers);
    const roles = validateRoles(input.roles);
    const username = validateUsername(input.username);
    const password = validatePassword(input.password);
    const requestedPersonId = optionalText(input.personId);
    const displayName = optionalText(input.displayName);
    if (!requestedPersonId && !displayName) throw new ProtectedAccountAdminError("invalidInput", "Display name is required for new staff.");

    const client = await this.pool.connect();
    let createdAuthUserId: string | undefined;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('organy-protected-staff-onboarding'))");
      if ((await client.query("select 1 from auth_users where username = $1 limit 1", [username])).rows[0]) {
        throw new ProtectedAccountAdminError("conflict", "Username is already in use.");
      }

      const person = requestedPersonId
        ? await lockExistingPerson(client, requestedPersonId)
        : await createPerson(client, displayName!, roles);
      if (!person.active) throw new ProtectedAccountAdminError("conflict", "Only an active Person can receive a protected Account.");

      if (roles.includes("priest") && !person.priest) await client.query("update catalog_persons set priest = true, updated_at = now() where id = $1", [person.id]);
      if (roles.includes("organist") && !person.organist) await client.query("update catalog_persons set organist = true, updated_at = now() where id = $1", [person.id]);

      const linked = await client.query("select u.id from app_users u where u.person_id = $1 and u.active = true limit 1", [person.id]);
      let appUserId: string;
      if (linked.rows[0]) {
        appUserId = String(linked.rows[0].id);
        if ((await client.query("select 1 from protected_account_actor_links where app_user_id = $1", [appUserId])).rows[0]) {
          throw new ProtectedAccountAdminError("conflict", "This Person already has a protected Account.");
        }
        await client.query("update app_users set display_name = $2, updated_at = now() where id = $1", [appUserId, person.displayName]);
      } else {
        appUserId = `staff:${randomUUID()}`;
        await client.query(
          "insert into app_users (id, display_name, person_id, active, created_at, updated_at) values ($1, $2, $3, true, now(), now())",
          [appUserId, person.displayName, person.id],
        );
      }

      await client.query("delete from app_user_roles where user_id = $1 and role in ('priest','organist')", [appUserId]);
      for (const role of roles) await client.query("insert into app_user_roles (user_id, role) values ($1, $2) on conflict do nothing", [appUserId, role]);

      const provisioningAuth = createOrganyAuth({ allowSignUp: true });
      const result = await provisioningAuth.api.signUpEmail({ body: {
        email: `protected-${randomUUID()}@organy.invalid`,
        name: person.displayName,
        password,
        username,
      } });
      createdAuthUserId = result.user.id;
      await client.query("delete from auth_sessions where user_id = $1", [createdAuthUserId]);
      await client.query("insert into protected_account_actor_links (auth_user_id, app_user_id) values ($1, $2)", [createdAuthUserId, appUserId]);
      await client.query("commit");
      return { personId: person.id, appUserId, username, roles };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (createdAuthUserId) await this.pool.query("delete from auth_users where id = $1", [createdAuthUserId]).catch(() => undefined);
      if (error instanceof ProtectedAccountAdminError) throw error;
      throw new ProtectedAccountAdminError("invalidInput", "Protected staff Account could not be created.");
    } finally {
      client.release();
    }
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
}

async function lockExistingPerson(client: PoolClient, personId: string) {
  const result = await client.query("select id, display_name, active, priest, organist from catalog_persons where id = $1 for update", [personId]);
  const row = result.rows[0];
  if (!row) throw new ProtectedAccountAdminError("notFound", "Selected Person was not found.");
  return { id: String(row.id), displayName: String(row.display_name), active: Boolean(row.active), priest: Boolean(row.priest), organist: Boolean(row.organist) };
}

async function createPerson(client: PoolClient, displayName: string, roles: StaffRole[]) {
  const id = `staff-person:${randomUUID()}`;
  await client.query(
    "insert into catalog_persons (id, display_name, active, priest, organist, created_at, updated_at) values ($1, $2, true, $3, $4, now(), now())",
    [id, displayName, roles.includes("priest"), roles.includes("organist")],
  );
  return { id, displayName, active: true, priest: roles.includes("priest"), organist: roles.includes("organist") };
}

function validateRoles(value: unknown): StaffRole[] {
  if (!Array.isArray(value)) throw new ProtectedAccountAdminError("invalidInput", "Staff roles are required.");
  const roles = [...new Set(value.map(String))];
  if (roles.length === 0 || roles.some((role) => role !== "priest" && role !== "organist")) {
    throw new ProtectedAccountAdminError("invalidInput", "Choose priest, organist, or both.");
  }
  return roles as StaffRole[];
}
function validateUsername(value: unknown) {
  const username = requireText(value, "Username is required.").toLowerCase();
  if (username.length < 3 || username.length > 64 || !/^[a-z0-9._-]+$/.test(username)) throw new ProtectedAccountAdminError("invalidInput", "Username must be 3-64 characters using letters, numbers, dot, underscore, or hyphen.");
  return username;
}
function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) throw new ProtectedAccountAdminError("invalidInput", "Initial password must contain 8-128 characters.");
  return value;
}
function requireText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) throw new ProtectedAccountAdminError("invalidInput", message);
  return value.trim();
}
function optionalText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
