import type { Pool } from "pg";
import type { ActorIdentity, AppUser } from "./interaction-contracts";
import type { PlanningRole } from "../planning-lifecycle";

export type LocalActorContext = { userId: string; role?: PlanningRole };
const ROLE_ORDER: PlanningRole[] = ["priest", "organist", "admin", "congregationMember"];

export class LocalActorError extends Error {
  constructor(public readonly code: "invalidInput" | "permissionDenied", message: string) {
    super(message);
  }
}

/** DB-runtime identity boundary for the deliberately local, non-authenticated user simulator. */
export class PostgresLocalActorResolver {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async listActiveUsers(): Promise<AppUser[]> {
    const { rows } = await this.pool.query(`
      select u.id, u.display_name, u.person_id, u.active,
        coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') roles
      from app_users u left join app_user_roles r on r.user_id = u.id
      where u.active = true group by u.id order by u.display_name, u.id
    `);
    return rows.map(mapUser).filter((user) => user.roles.length > 0);
  }

  async resolve(context: LocalActorContext): Promise<ActorIdentity> {
    const { userId, role: requestedRole } = context;
    const { rows } = await this.pool.query(`
      select u.id, u.display_name, u.person_id, u.active,
        coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') roles
      from app_users u left join app_user_roles r on r.user_id = u.id
      where u.id = $1 group by u.id
    `, [userId]);
    if (!rows[0]) throw new LocalActorError("permissionDenied", "The selected local actor does not exist.");
    const user = mapUser(rows[0]);
    if (!user.active) throw new LocalActorError("permissionDenied", "The selected local actor is inactive.");
    if (user.roles.length === 0) throw new LocalActorError("permissionDenied", "The selected local actor has no assigned role.");
    if (requestedRole && !user.roles.includes(requestedRole)) throw new LocalActorError("permissionDenied", "The requested role is not assigned to the selected local actor.");
    // The fixed competency order is the deterministic default when the envelope omits role.
    const role = requestedRole ?? ROLE_ORDER.find((candidate) => user.roles.includes(candidate))!;
    return { userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) };
  }
}

export function parseLocalActorContext(value: unknown): LocalActorContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new LocalActorError("invalidInput", "Local actor context is required.");
  const { userId, role } = value as Record<string, unknown>;
  if (typeof userId !== "string" || !userId.trim()) throw new LocalActorError("invalidInput", "Local actor userId must be a non-empty string.");
  if (role !== undefined && !ROLE_ORDER.includes(role as PlanningRole)) throw new LocalActorError("invalidInput", "Local actor role is malformed.");
  return { userId: userId.trim(), ...(role ? { role: role as PlanningRole } : {}) };
}

function mapUser(row: Record<string, unknown>): AppUser {
  return { id: String(row.id), displayName: String(row.display_name), ...(row.person_id ? { personId: String(row.person_id) } : {}), active: Boolean(row.active), roles: normalizeRoles(row.roles).sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)) };
}
function normalizeRoles(value: unknown): PlanningRole[] {
  const roles = Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.replace(/[{}]/g, "").split(",").filter(Boolean) : [];
  return roles.map((role) => role === "congregation_member" ? "congregationMember" : role as PlanningRole);
}
