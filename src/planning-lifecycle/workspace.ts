import type { CompletedServiceRecord, PersistedPlanningSet, PlanningSetId, CompletedServiceRecordId } from "../application/planning-lifecycle/ports";
import type { PlanningRole } from "./model";

export type Workspace = "planning" | "plans" | "history" | "catalog" | "development";
export type ActiveRecordGroups = { working: PersistedPlanningSet[]; final: PersistedPlanningSet[] };
export type PersistedRecordReference =
  | { kind: "active"; id: PlanningSetId }
  | { kind: "completed"; id: CompletedServiceRecordId };

export function getAvailableWorkspaces(role: PlanningRole): Workspace[] {
  const base: Workspace[] = ["planning", "plans", "history"];
  if (role === "admin") base.push("catalog");
  base.push("development");
  return base;
}

export function isWorkspaceAvailable(workspace: Workspace, role: PlanningRole): boolean {
  return getAvailableWorkspaces(role).includes(workspace);
}

export function getSafeWorkspace(workspace: Workspace, role: PlanningRole): Workspace {
  return isWorkspaceAvailable(workspace, role) ? workspace : "planning";
}

export function groupActivePlanningSets(sets: PersistedPlanningSet[]): ActiveRecordGroups {
  return {
    working: sets.filter((set) => set.status === "working"),
    final: sets.filter((set) => set.status === "final"),
  };
}

export function formatPlanningSetSummary(set: PersistedPlanningSet): string {
  return [
    `${formatLifecycle(set.status)} service`,
    formatServiceContext(set.serviceContext),
    `${set.rows.length} ${set.rows.length === 1 ? "row" : "rows"}`,
  ].join(" · ");
}

export function formatCompletedRecordSummary(record: CompletedServiceRecord): string {
  return ["Completed service", formatServiceContext(record.serviceContext), `${record.set.rows.length} ${record.set.rows.length === 1 ? "row" : "rows"}`].join(" · ");
}

export const workspaceLabels: Record<Workspace, string> = {
  planning: "Planning",
  plans: "Plans",
  history: "History",
  catalog: "Catalog",
  development: "Development",
};

export function getWorkspaceLabel(workspace: Workspace): string { return workspaceLabels[workspace]; }
export function getWorkspaceAfterStartNewSet(): Workspace { return "planning"; }
export function getWorkspaceAfterSaveWorking(): Workspace { return "plans"; }
export function getWorkspaceAfterFinalize(): Workspace { return "plans"; }
export function getWorkspaceAfterComplete(): Workspace { return "history"; }
export function getWorkspaceAfterCompletedUpdate(): Workspace { return "history"; }
export function getWorkspaceAfterDelete(deleted: PersistedRecordReference | null, groups: ActiveRecordGroups, completed: CompletedServiceRecord[]): Workspace {
  if (deleted?.kind === "completed") return completed.length ? "history" : "planning";
  return groups.working.length || groups.final.length ? "plans" : "planning";
}
export function getWorkspaceAfterOpenRecord(): Workspace { return "planning"; }

function formatLifecycle(status: PersistedPlanningSet["status"]): string { return status === "working" ? "Working" : "Final"; }
function formatServiceContext(context: PersistedPlanningSet["serviceContext"]): string {
  return `${context.serviceDate} ${context.serviceTime || "time missing"} · ${context.language} · priest ${context.priest.displayName || "—"} · organist ${context.organist.displayName || "—"}`;
}
