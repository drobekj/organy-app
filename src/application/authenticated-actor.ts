import type { Pool } from "pg";
import type { ActorIdentity, AppUser } from "./interaction-contracts";
import type { PlanningRole } from "../planning-lifecycle";
import { LocalActorError } from "./local-actor";
import { auth, authRuntimeConfigurationError } from "../auth/server";

const databaseRoleToPlanningRole = (role: string): PlanningRole | undefined => role === "congregation_member" ? "congregationMember" : role === "admin" || role === "priest" || role === "organist" ? role : undefined;
const roleOrder: PlanningRole[] = ["admin", "priest", "organist", "congregationMember"];
const protectedRoles = new Set<PlanningRole>(["admin", "priest", "organist"]);

export function requestedRoleFromActorEnvelope(value: unknown): PlanningRole | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Actor context is malformed.");
  const role = (value as Record<string, unknown>).role;
  if (role === undefined) return undefined;
  if (role !== "admin" && role !== "priest" && role !== "organist" && role !== "congregationMember") throw new LocalActorError("invalidInput", "Actor role is invalid.");
  return role;
}

export async function getAuthenticatedStaffUser(headers: Headers, pool: Pool): Promise<AppUser> {
  const configurationError = authRuntimeConfigurationError();
  if (configurationError) throw new Error(configurationError);
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) throw new LocalActorError("permissionDenied", "Staff sign-in is required.");
  const { rows } = await pool.query(
    "select u.id, u.display_name, u.person_id, u.active, array_remove(array_agg(r.role::text order by r.role::text), null) as roles " +
      "from auth_user_actor_links l join app_users u on u.id = l.actor_user_id " +
      "left join app_user_roles r on r.user_id = u.id where l.auth_user_id = $1 " +
      "group by u.id, u.display_name, u.person_id, u.active",
    [session.user.id],
  );
  if (rows.length !== 1) throw new LocalActorError("permissionDenied", "Authenticated account is not linked to exactly one application user.");
  const row = rows[0];
  if (!row.active) throw new LocalActorError("permissionDenied", "Authenticated application user is inactive.");
  const roles = (Array.isArray(row.roles) ? row.roles : []).map((role) => databaseRoleToPlanningRole(String(role))).filter((role): role is PlanningRole => Boolean(role)).sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b));
  if (!roles.some((role) => protectedRoles.has(role))) throw new LocalActorError("permissionDenied", "Authenticated account has no protected staff role.");
  return { id: String(row.id), displayName: String(row.display_name), ...(row.person_id ? { personId: String(row.person_id) } : {}), roles, active: true };
}

export async function resolveAuthenticatedActor(headers: Headers, pool: Pool, requestedRole?: PlanningRole): Promise<ActorIdentity> {
  const user = await getAuthenticatedStaffUser(headers, pool);
  const role = requestedRole ?? user.roles[0];
  if (!role || !user.roles.includes(role)) throw new LocalActorError("permissionDenied", "Requested role is not assigned to the authenticated user.");
  return { userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) };
}
