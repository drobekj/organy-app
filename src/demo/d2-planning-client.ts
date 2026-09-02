import { runPersistentMutation } from "../application/demo-safety";
import {
  PlanningLifecycleService,
  type CompletedServiceRecord,
  type PersistedPlanningPlan,
  type PlanningPlanId,
  type PlanningServiceResult,
} from "../application/planning-lifecycle";
import { success } from "../application/planning-lifecycle/results";
import { DEMO_D2_ACTIVE_PLANS, DEMO_D2_COMPLETED_RECORDS } from "./d2-planning-fixture";

export class DemoPlanningLifecycleClient {
  private readonly activePlans: PersistedPlanningPlan[];
  private readonly completedRecords: CompletedServiceRecord[];

  constructor(
    activePlans: readonly PersistedPlanningPlan[] = DEMO_D2_ACTIVE_PLANS,
    completedRecords: readonly CompletedServiceRecord[] = DEMO_D2_COMPLETED_RECORDS,
  ) {
    this.activePlans = activePlans.map(clonePlan);
    this.completedRecords = completedRecords.map(cloneCompleted);
  }

  async listPlanningSets(): Promise<PlanningServiceResult<PersistedPlanningPlan[]>> {
    return success(this.activePlans.map(clonePlan));
  }

  async listCompletedRecords(): Promise<PlanningServiceResult<CompletedServiceRecord[]>> {
    return success(this.completedRecords.map(cloneCompleted));
  }

  async loadPlanningSet(setId: PlanningPlanId): Promise<PlanningServiceResult<PersistedPlanningPlan>> {
    const plan = this.activePlans.find((candidate) => candidate.id === setId);
    return plan
      ? success(clonePlan(plan))
      : { success: false, error: { code: "notFound", message: "Demo planning set was not found." } };
  }

  async loadCompletedRecord(recordId: string): Promise<PlanningServiceResult<CompletedServiceRecord>> {
    const record = this.completedRecords.find((candidate) => candidate.id === recordId);
    return record
      ? success(cloneCompleted(record))
      : { success: false, error: { code: "notFound", message: "Demo completed record was not found." } };
  }

  saveWorkingSet(
    _input: Parameters<PlanningLifecycleService["saveWorkingSet"]>[0],
  ): ReturnType<PlanningLifecycleService["saveWorkingSet"]> {
    return denyPersistentMutation("planning.saveWorkingSet");
  }

  finalizeWorkingSet(
    _input: Parameters<PlanningLifecycleService["finalizeWorkingSet"]>[0],
  ): ReturnType<PlanningLifecycleService["finalizeWorkingSet"]> {
    return denyPersistentMutation("planning.finalizeWorkingSet");
  }

  reopenFinalSet(
    _input: Parameters<PlanningLifecycleService["reopenFinalSet"]>[0],
  ): ReturnType<PlanningLifecycleService["reopenFinalSet"]> {
    return denyPersistentMutation("planning.reopenFinalSet");
  }

  completeFinalSet(
    _input: Parameters<PlanningLifecycleService["completeFinalSet"]>[0],
  ): ReturnType<PlanningLifecycleService["completeFinalSet"]> {
    return denyPersistentMutation("planning.completeFinalSet");
  }

  deletePlanningSet(
    _input: Parameters<PlanningLifecycleService["deletePlanningSet"]>[0],
  ): ReturnType<PlanningLifecycleService["deletePlanningSet"]> {
    return denyPersistentMutation("planning.deletePlanningSet");
  }

  updateCompletedRecord(
    _input: Parameters<PlanningLifecycleService["updateCompletedRecord"]>[0],
  ): ReturnType<PlanningLifecycleService["updateCompletedRecord"]> {
    return denyPersistentMutation("planning.updateCompletedRecord");
  }

  deleteCompletedRecord(
    _input: Parameters<PlanningLifecycleService["deleteCompletedRecord"]>[0],
  ): ReturnType<PlanningLifecycleService["deleteCompletedRecord"]> {
    return denyPersistentMutation("planning.deleteCompletedRecord");
  }
}

function denyPersistentMutation<T>(operation: string): Promise<T> {
  return runPersistentMutation("demo", operation, () => {
    throw new Error("Demo persistent mutation callback must never execute.");
  });
}

function clonePlan(plan: PersistedPlanningPlan): PersistedPlanningPlan {
  return {
    ...plan,
    serviceContext: {
      ...plan.serviceContext,
      priest: { ...plan.serviceContext.priest },
      organist: { ...plan.serviceContext.organist },
      ...(plan.serviceContext.referenceAntiphon ? { referenceAntiphon: { ...plan.serviceContext.referenceAntiphon } } : {}),
      ...(plan.serviceContext.referenceTopic ? { referenceTopic: { ...plan.serviceContext.referenceTopic } } : {}),
    },
    rows: plan.rows.map((row) => ({
      ...(row.song ? { song: { ...row.song } } : {}),
      ...(row.note !== undefined ? { note: row.note } : {}),
    })),
    ...(plan.completedAt ? { completedAt: new Date(plan.completedAt) } : {}),
    ...(plan.needsRevision ? {
      needsRevision: {
        ...plan.needsRevision,
        conflictingCompletedRecordIds: [...plan.needsRevision.conflictingCompletedRecordIds],
        ...(plan.needsRevision.conflictingRowIndexes ? { conflictingRowIndexes: [...plan.needsRevision.conflictingRowIndexes] } : {}),
      },
    } : {}),
  };
}

function cloneCompleted(record: CompletedServiceRecord): CompletedServiceRecord {
  return {
    ...record,
    completedAt: new Date(record.completedAt),
    serviceContext: {
      ...record.serviceContext,
      priest: { ...record.serviceContext.priest },
      organist: { ...record.serviceContext.organist },
      ...(record.serviceContext.referenceAntiphon ? { referenceAntiphon: { ...record.serviceContext.referenceAntiphon } } : {}),
      ...(record.serviceContext.referenceTopic ? { referenceTopic: { ...record.serviceContext.referenceTopic } } : {}),
    },
    set: {
      ...record.set,
      rows: record.set.rows.map((row) => ({
        ...(row.song ? { song: { ...row.song } } : {}),
        ...(row.note !== undefined ? { note: row.note } : {}),
      })),
    },
    ...(record.conflictState ? {
      conflictState: {
        conflictingPlanIds: [...record.conflictState.conflictingPlanIds],
        conflictingRowIndexes: [...record.conflictState.conflictingRowIndexes],
      },
    } : {}),
  };
}
