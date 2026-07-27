import type { Pool } from "pg";
import type { ActorIdentity, AppUser } from "./interaction-contracts";
import type { PlanningRole } from "../planning-lifecycle";

export const LOCAL_ACTOR_HEADER = "x-organy-local-user-id";

export class LocalActorError extends Error {
  constructor(public readonly code: "actorRequired" | "actorNotFound" | "actorInactive" | "actorRoleMissing", message: string) {
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

  async resolve(request: Request): Promise<ActorIdentity> {
    const userId = request.headers.get(LOCAL_ACTOR_HEADER)?.trim();
    if (!userId) throw new LocalActorError("actorRequired", `Header ${LOCAL_ACTOR_HEADER} is required for this mutation.`);
    const { rows } = await this.pool.query(`
      select u.id, u.display_name, u.person_id, u.active,
        coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') roles
      from app_users u left join app_user_roles r on r.user_id = u.id
      where u.id = $1 group by u.id
    `, [userId]);
    if (!rows[0]) throw new LocalActorError("actorNotFound", "The selected local actor does not exist.");
    const user = mapUser(rows[0]);
    if (!user.active) throw new LocalActorError("actorInactive", "The selected local actor is inactive.");
    const role = user.roles[0];
    if (!role) throw new LocalActorError("actorRoleMissing", "The selected local actor has no assigned role.");
    return { userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) };
  }
}

function mapUser(row: Record<string, unknown>): AppUser {
  return { id: String(row.id), displayName: String(row.display_name), ...(row.person_id ? { personId: String(row.person_id) } : {}), active: Boolean(row.active), roles: normalizeRoles(row.roles) };
}
function normalizeRoles(value: unknown): PlanningRole[] {
  const roles = Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.replace(/[{}]/g, "").split(",").filter(Boolean) : [];
  return roles.map((role) => role === "congregation_member" ? "congregationMember" : role as PlanningRole);
}
