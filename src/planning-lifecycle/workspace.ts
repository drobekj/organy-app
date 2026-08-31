import type { CompletedServiceRecord, PersistedPlanningPlan, PlanningPlanId, CompletedServiceRecordId } from "../application/planning-lifecycle/ports";
import type { PlanningRole } from "./model";
import { formatPlanningRowsSummary } from "./row-summary";

export type Workspace = "about" | "planning" | "plans" | "history" | "catalog" | "development" | "guide";
export type ActiveRecordGroups = { working: PersistedPlanningPlan[]; final: PersistedPlanningPlan[] };
export type PersistedRecordReference =
  | { kind: "active"; id: PlanningPlanId }
  | { kind: "completed"; id: CompletedServiceRecordId };

export function getAvailableWorkspaces(role: PlanningRole): Workspace[] {
  const base: Workspace[] = ["about", "planning", "plans", "history"];
  if (role === "admin") base.push("catalog");
  base.push("development", "guide");
  return base;
}

export function isWorkspaceAvailable(workspace: Workspace, role: PlanningRole): boolean {
  return getAvailableWorkspaces(role).includes(workspace);
}

export function getSafeWorkspace(workspace: Workspace, role: PlanningRole): Workspace {
  return isWorkspaceAvailable(workspace, role) ? workspace : "planning";
}

export function groupActivePlanningSets(plans: PersistedPlanningPlan[]): ActiveRecordGroups {
  return {
    working: plans.filter((plan) => plan.status === "working"),
    final: plans.filter((plan) => plan.status === "final"),
  };
}

/** Canonical Plan-named helper; historical Set export remains during call-site migration. */
export const groupActivePlanningPlans = groupActivePlanningSets;

export function formatPlanningSetSummary(plan: PersistedPlanningPlan): string {
  return [
    formatServiceContext(plan.serviceContext),
    formatPlanningRowsSummary(plan.rows),
    `changed by ${plan.lastChangedBy ?? "—"}`,
  ].join(" · ");
}

/** Canonical Plan-named helper; historical Set export remains during call-site migration. */
export const formatPlanningPlanSummary = formatPlanningSetSummary;

export function formatCompletedRecordSummary(record: CompletedServiceRecord): string {
  return [
    formatServiceContext(record.serviceContext),
    formatPlanningRowsSummary(record.set.rows),
    `changed by ${record.lastChangedBy ?? "—"}`,
  ].join(" · ");
}

export const workspaceLabels: Record<Workspace, string> = {
  about: "About",
  planning: "Planning",
  plans: "Plans",
  history: "History",
  catalog: "Catalog",
  development: "Development",
  guide: "Guide",
};

export function getWorkspaceLabel(workspace: Workspace): string { return workspaceLabels[workspace]; }
export function getWorkspaceAfterStartNewSet(): Workspace { return "planning"; }
/** Canonical Plan-named helper; historical Set export remains during call-site migration. */
export const getWorkspaceAfterStartNewPlan = getWorkspaceAfterStartNewSet;
export function getWorkspaceAfterSaveWorking(): Workspace { return "plans"; }
export function getWorkspaceAfterFinalize(): Workspace { return "plans"; }
export function getWorkspaceAfterComplete(): Workspace { return "history"; }
export function getWorkspaceAfterCompletedUpdate(): Workspace { return "history"; }
export function getWorkspaceAfterDelete(deleted: PersistedRecordReference | null, groups: ActiveRecordGroups, completed: CompletedServiceRecord[]): Workspace {
  if (deleted?.kind === "completed") return completed.length ? "history" : "planning";
  return groups.working.length || groups.final.length ? "plans" : "planning";
}
export function getWorkspaceAfterOpenRecord(): Workspace { return "planning"; }

function formatServiceContext(context: PersistedPlanningPlan["serviceContext"]): string {
  return `${context.serviceDate} ${context.serviceTime || "time missing"} · ${context.language} · ${context.priest.displayName || "—"} · ${context.organist.displayName || "—"}`;
}
