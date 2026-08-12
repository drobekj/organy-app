import type { Pool } from "pg";
import type { ActorIdentity, AppUser } from "./interaction-contracts";
import type { PlanningRole } from "../planning-lifecycle";
import { assertProtectedAuthConfigured, auth } from "../auth/server";

const ROLE_ORDER: PlanningRole[] = ["priest", "organist", "admin", "congregationMember"];

export class ProtectedActorError extends Error {
  constructor(
    public readonly code: "unauthenticated" | "invalidInput" | "permissionDenied",
    message: string,
  ) {
    super(message);
  }
}

export async function resolveProtectedUser(headers: Headers, pool: Pick<Pool, "query">): Promise<AppUser> {
  assertProtectedAuthConfigured();
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) throw new ProtectedActorError("unauthenticated", "Sign in is required.");

  const { rows } = await pool.query(`
    select u.id, u.display_name, u.person_id, u.active,
      coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') roles
    from protected_account_actor_links l
    join app_users u on u.id = l.app_user_id
    left join app_user_roles r on r.user_id = u.id
    where l.auth_user_id = $1
    group by u.id
  `, [session.user.id]);

  if (!rows[0]) throw new ProtectedActorError("permissionDenied", "The authenticated account is not linked to an application user.");
  const user = mapUser(rows[0]);
  if (!user.active) throw new ProtectedActorError("permissionDenied", "The authenticated application user is inactive.");
  if (user.roles.length === 0) throw new ProtectedActorError("permissionDenied", "The authenticated application user has no assigned role.");
  if (!user.roles.some((role) => role === "admin" || role === "priest" || role === "organist")) {
    throw new ProtectedActorError("permissionDenied", "This account has no protected staff role.");
  }
  return user;
}

export async function resolveProtectedActor(
  headers: Headers,
  pool: Pick<Pool, "query">,
  requestedContext?: unknown,
): Promise<ActorIdentity> {
  const user = await resolveProtectedUser(headers, pool);
  const requestedRole = parseRequestedRole(requestedContext);
  if (requestedRole && !user.roles.includes(requestedRole)) {
    throw new ProtectedActorError("permissionDenied", "The requested role is not assigned to the authenticated user.");
  }
  const role = requestedRole ?? ROLE_ORDER.find((candidate) => user.roles.includes(candidate));
  if (!role) throw new ProtectedActorError("permissionDenied", "The authenticated user has no usable protected role.");
  return {
    userId: user.id,
    displayName: user.displayName,
    role,
    ...(user.personId ? { personId: user.personId } : {}),
  };
}

function parseRequestedRole(value: unknown): PlanningRole | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProtectedActorError("invalidInput", "Protected actor context is malformed.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "role")) {
    throw new ProtectedActorError("invalidInput", "Client-supplied user identity is not accepted for protected operations.");
  }
  if (record.role === undefined) return undefined;
  if (typeof record.role !== "string" || !ROLE_ORDER.includes(record.role as PlanningRole)) {
    throw new ProtectedActorError("invalidInput", "Requested protected role is malformed.");
  }
  return record.role as PlanningRole;
}

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    ...(row.person_id ? { personId: String(row.person_id) } : {}),
    active: Boolean(row.active),
    roles: normalizeRoles(row.roles).sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)),
  };
}

function normalizeRoles(value: unknown): PlanningRole[] {
  const roles = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? value.replace(/[{}]/g, "").split(",").filter(Boolean)
      : [];
  return roles.map((role) => role === "congregation_member" ? "congregationMember" : role as PlanningRole);
}
