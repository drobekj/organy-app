import type { PlanningRole } from "../planning-lifecycle";

export const ACTIVE_ROLE_COOKIE_NAME = "organy-active-role";

const planningRoles: PlanningRole[] = ["priest", "organist", "admin", "congregationMember"];

export function isPlanningRole(value: unknown): value is PlanningRole {
  return typeof value === "string" && planningRoles.includes(value as PlanningRole);
}

export function resolveOwnedActiveRole(roles: readonly string[], requestedRole?: string): PlanningRole {
  const ownedRoles = roles.filter(isPlanningRole);
  if (requestedRole && isPlanningRole(requestedRole) && ownedRoles.includes(requestedRole)) return requestedRole;
  return ownedRoles[0] ?? "congregationMember";
}

export function serializeActiveRoleCookie(role: PlanningRole): string {
  return `${ACTIVE_ROLE_COOKIE_NAME}=${encodeURIComponent(role)}; Path=/; SameSite=Lax; Max-Age=31536000`;
}
