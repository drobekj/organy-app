import {
  canPerformPlanningAction,
  validatePlanningSet,
  type PlanningRole,
  type PlanningRow,
  type PlanningSet,
  type ServiceContext,
} from "../../planning-lifecycle";
import type {
  CompletedServiceRecord,
  CompletedServiceRecordRepository,
  PersistedPlanningSet,
  PlanningSetId,
  PlanningSetRepository,
} from "./ports";
import { failure, success, type PlanningServiceResult } from "./results";

export type PlanningLifecycleServiceDependencies = {
  planningSets: PlanningSetRepository;
  completedServiceRecords: CompletedServiceRecordRepository;
  now?: () => Date;
};

export type SaveWorkingSetServiceContext = ServiceContext;

export type SaveWorkingSetInput = {
  role: PlanningRole;
  existingSetId?: PlanningSetId;
  serviceContext: SaveWorkingSetServiceContext;
  set: PlanningSet & { status: "working" };
};

export type FinalizeWorkingSetInput = {
  role: PlanningRole;
  workingSetId: PlanningSetId;
  replaceFinalSetId?: PlanningSetId;
};

export type DeletePlanningSetInput = {
  role: PlanningRole;
  setId: PlanningSetId;
};

export type ReorderRowsInput = {
  role: PlanningRole;
  workingSetId: PlanningSetId;
  rowOrder: number[];
};

export type CompleteFinalSetInput = {
  role: PlanningRole;
  finalSetId: PlanningSetId;
};

export class PlanningLifecycleService {
  private readonly now: () => Date;
  private readonly planningSets: PlanningSetRepository;
  private readonly completedServiceRecords: CompletedServiceRecordRepository;

  constructor(dependencies: PlanningLifecycleServiceDependencies) {
    this.planningSets = dependencies.planningSets;
    this.completedServiceRecords = dependencies.completedServiceRecords;
    this.now = dependencies.now ?? (() => new Date());
  }


  async listPlanningSets(): Promise<PlanningServiceResult<PersistedPlanningSet[]>> {
    return success(await this.planningSets.list());
  }

  async listCompletedRecords(): Promise<PlanningServiceResult<CompletedServiceRecord[]>> {
    return success(await this.completedServiceRecords.list());
  }

  async loadPlanningSet(setId: PlanningSetId): Promise<PlanningServiceResult<PersistedPlanningSet>> {
    const set = await this.planningSets.findById(setId);
    return set ? success(set) : failure({ code: "notFound", message: "Planning set was not found." });
  }

  async loadCompletedRecord(recordId: string): Promise<PlanningServiceResult<CompletedServiceRecord>> {
    const record = await this.completedServiceRecords.findById(recordId);
    return record ? success(record) : failure({ code: "notFound", message: "Completed record was not found." });
  }

  async saveWorkingSet(input: SaveWorkingSetInput): Promise<PlanningServiceResult<PersistedPlanningSet>> {
    if (!canPerformPlanningAction(input.role, input.existingSetId ? "editWorkingSet" : "createWorkingSet")) {
      return failure({ code: "permissionDenied", message: "Role cannot save a working planning set." });
    }

    const serviceContextIssues = validateSaveWorkingSetServiceContext(input.serviceContext, input.set);
    if (serviceContextIssues.length > 0) {
      return failure({
        code: "invalidInput",
        message: "Service context is required before saving a working set.",
        issues: serviceContextIssues,
      });
    }

    const validation = validatePlanningSet(input.set);
    if (!validation.valid) {
      return failure({ code: "invalidInput", message: "Working planning set is invalid.", issues: validation.issues });
    }

    if (input.existingSetId) {
      const existing = await this.planningSets.findById(input.existingSetId);
      if (!existing) {
        return failure({ code: "notFound", message: "Working planning set was not found." });
      }

      if (existing.status !== "working") {
        return failure({ code: "invalidStatus", message: "Final planning sets cannot be edited directly." });
      }
    }

    const duplicate = await this.findDuplicateService(input.serviceContext, input.existingSetId);
    if (duplicate) {
      return failure({ code: "invalidInput", message: `A service already exists for ${input.serviceContext.serviceDate} at ${input.serviceContext.serviceTime}.` });
    }

    return success(await this.planningSets.saveWorkingSet(input.set, input.serviceContext, input.existingSetId));
  }

  async finalizeWorkingSet(input: FinalizeWorkingSetInput): Promise<PlanningServiceResult<PersistedPlanningSet>> {
    if (!canPerformPlanningAction(input.role, "saveFinalSet")) {
      return failure({ code: "permissionDenied", message: "Role cannot finalize a working planning set." });
    }

    const workingSet = await this.planningSets.findById(input.workingSetId);
    if (!workingSet) {
      return failure({ code: "notFound", message: "Working planning set was not found." });
    }

    if (workingSet.status !== "working") {
      return failure({ code: "invalidStatus", message: "Only working planning sets can be finalized." });
    }

    if (input.replaceFinalSetId) {
      const finalSet = await this.planningSets.findById(input.replaceFinalSetId);
      if (!finalSet) {
        return failure({ code: "notFound", message: "Final planning set to replace was not found." });
      }

      if (finalSet.status !== "final") {
        return failure({ code: "invalidStatus", message: "Only final planning sets can be replaced during finalization." });
      }
    }

    const finalSet: PlanningSet & { status: "final" } = {
      status: "final",
      language: workingSet.language,
      rows: workingSet.rows,
    };
    const validation = validatePlanningSet(finalSet);
    if (!validation.valid) {
      return failure({ code: "invalidInput", message: "Final planning set is invalid.", issues: validation.issues });
    }

    const persistedFinalSet = await this.planningSets.saveFinalSet(
      finalSet,
      workingSet.serviceContext,
      input.replaceFinalSetId ?? input.workingSetId,
    );

    if (persistedFinalSet.id !== input.workingSetId) {
      await this.planningSets.deleteById(input.workingSetId);
    }

    return success(persistedFinalSet);
  }

  async deletePlanningSet(input: DeletePlanningSetInput): Promise<PlanningServiceResult<{ deletedSetId: PlanningSetId }>> {
    const set = await this.planningSets.findById(input.setId);
    if (!set) {
      return failure({ code: "notFound", message: "Planning set was not found." });
    }

    const action = set.status === "working" ? "deleteWorkingSet" : "deleteFinalSet";
    if (!canPerformPlanningAction(input.role, action)) {
      return failure({ code: "permissionDenied", message: "Role cannot delete this planning set." });
    }

    await this.completedServiceRecords.deleteBySourceFinalSetId(input.setId);
    await this.planningSets.deleteById(input.setId);
    return success({ deletedSetId: input.setId });
  }

  async reorderRows(input: ReorderRowsInput): Promise<PlanningServiceResult<PersistedPlanningSet>> {
    if (!canPerformPlanningAction(input.role, "editWorkingSet")) {
      return failure({ code: "permissionDenied", message: "Role cannot reorder rows in a working planning set." });
    }

    const workingSet = await this.planningSets.findById(input.workingSetId);
    if (!workingSet) {
      return failure({ code: "notFound", message: "Working planning set was not found." });
    }

    if (workingSet.status !== "working") {
      return failure({ code: "invalidStatus", message: "Rows can only be reordered on a working planning set." });
    }

    const reorderedRows = reorderRowsByIndex(workingSet.rows, input.rowOrder);
    if (!reorderedRows) {
      return failure({ code: "invalidInput", message: "Row order must include every row index exactly once." });
    }

    const reorderedWorkingSet: PlanningSet & { status: "working" } = {
      status: "working",
      language: workingSet.language,
      rows: reorderedRows,
    };

    return success(await this.planningSets.saveWorkingSet(reorderedWorkingSet, workingSet.serviceContext, input.workingSetId));
  }

  async completeFinalSet(input: CompleteFinalSetInput): Promise<PlanningServiceResult<CompletedServiceRecord>> {
    if (!canPerformPlanningAction(input.role, "convertFinalSetToCompletedServiceRecord")) {
      return failure({ code: "permissionDenied", message: "Role cannot complete a final planning set." });
    }

    const finalSet = await this.planningSets.findById(input.finalSetId);
    if (!finalSet) {
      return failure({ code: "notFound", message: "Final planning set was not found." });
    }

    if (finalSet.status !== "final") {
      return failure({ code: "invalidStatus", message: "Only final planning sets can be completed." });
    }

    if (isFuturePragueDate(finalSet.serviceContext.serviceDate, this.now())) {
      return failure({ code: "invalidInput", message: `Future service ${finalSet.serviceContext.serviceDate} at ${finalSet.serviceContext.serviceTime || "Time missing"} cannot be completed.` });
    }

    const completedAt = this.now();
    const completedRecord = await this.completedServiceRecords.createFromFinalSet({
      sourceFinalSetId: input.finalSetId,
      set: { status: "final", language: finalSet.language, rows: finalSet.rows },
      serviceContext: finalSet.serviceContext,
      completedAt,
    });

    await this.planningSets.deleteById(input.finalSetId);
    return success(completedRecord);
  }

  private async findDuplicateService(serviceContext: ServiceContext, currentSetId?: PlanningSetId): Promise<PersistedPlanningSet | CompletedServiceRecord | undefined> {
    const sets = await this.planningSets.list();
    const activeDuplicate = sets.find((set) => set.id !== currentSetId && set.serviceContext.serviceDate === serviceContext.serviceDate && set.serviceContext.serviceTime === serviceContext.serviceTime);
    if (activeDuplicate) return activeDuplicate;
    const completed = await this.completedServiceRecords.list();
    return completed.find((record) => record.serviceContext.serviceDate === serviceContext.serviceDate && record.serviceContext.serviceTime === serviceContext.serviceTime);
  }
}

function isFuturePragueDate(serviceDate: string, now: Date): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return serviceDate > today;
}

function reorderRowsByIndex(rows: PlanningRow[], rowOrder: number[]): PlanningRow[] | undefined {
  if (rows.length !== rowOrder.length) {
    return undefined;
  }

  const seen = new Set<number>();
  const reorderedRows: PlanningRow[] = [];

  for (const index of rowOrder) {
    if (!Number.isInteger(index) || index < 0 || index >= rows.length || seen.has(index)) {
      return undefined;
    }

    seen.add(index);
    reorderedRows.push(rows[index]);
  }

  return reorderedRows;
}

function validateSaveWorkingSetServiceContext(
  serviceContext: SaveWorkingSetServiceContext,
  set: PlanningSet,
): { path: string; message: string }[] {
  return [
    ...(serviceContext.language !== set.language
      ? [{ path: "serviceContext.language", message: "Service context language must match the planning set language." }]
      : []),
    ...(!serviceContext.serviceDate.trim() ? [{ path: "serviceDate", message: "Service date is required." }] : []),
    ...(!/^\d{2}:\d{2}$/.test(serviceContext.serviceTime.trim()) ? [{ path: "serviceTime", message: "Service time is required in HH:mm format." }] : []),
    ...(!serviceContext.priest.displayName.trim() ? [{ path: "priest", message: "Priest is required." }] : []),
    ...(!serviceContext.organist.displayName.trim() ? [{ path: "organist", message: "Organist is required." }] : []),
  ];
}
