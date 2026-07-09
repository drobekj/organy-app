import type { PlanningAction, PlanningRole } from './model';

const planningPermissions: Readonly<Record<PlanningAction, readonly PlanningRole[]>> = {
  createWorkingSet: ['priest', 'organist', 'admin'],
  editWorkingSet: ['priest', 'organist', 'admin'],
  deleteWorkingSet: ['priest', 'organist', 'admin'],
  saveFinalSet: ['priest', 'admin'],
  deleteFinalSet: ['priest', 'admin'],
  convertFinalSetToCompletedService: ['priest', 'admin', 'system'],
};

export function canPerformPlanningAction(
  roles: readonly PlanningRole[],
  action: PlanningAction,
): boolean {
  const allowedRoles = planningPermissions[action];

  return roles.some((role) => allowedRoles.includes(role));
}
