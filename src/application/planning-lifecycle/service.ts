import {
  canPerformPlanningAction,
  isValidServiceTime,
  normalizeServiceTime,
  validatePlanningSet,
  type PlanningRole,
  type PlanningRow,
  type PlanningSet,
  type ServiceContext,
} from "../../planning-lifecycle";
import type { CatalogRepository } from "../catalog";
import { isEligiblePerson, languagesForService } from "../catalog";
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
  catalog: CatalogRepository;
  now?: () => Date;
  enforceCatalogSelections?: boolean;
};

export type SaveWorkingSetServiceContext = ServiceContext;

export type SaveWorkingSetInput = {
  role: PlanningRole;
  existingSetId?: PlanningSetId;
  serviceContext: SaveWorkingSetServiceContext;
  set: PlanningSet & { status: "working" };
  allowLanguageDeviations?: boolean;
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

export type UpdateCompletedRecordInput = {
  role: PlanningRole;
  recordId: string;
  serviceContext: ServiceContext;
  set: PlanningSet & { status: "final" };
  allowLanguageDeviations?: boolean;
};

export type DeleteCompletedRecordInput = {
  role: PlanningRole;
  recordId: string;
};

export class PlanningLifecycleService {
  private readonly now: () => Date;
  private readonly planningSets: PlanningSetRepository;
  private readonly completedServiceRecords: CompletedServiceRecordRepository;
  private readonly catalog: CatalogRepository;
  private readonly enforceCatalogSelections: boolean;

  constructor(dependencies: PlanningLifecycleServiceDependencies) {
    this.planningSets = dependencies.planningSets;
    this.completedServiceRecords = dependencies.completedServiceRecords;
    this.catalog = dependencies.catalog;
    this.enforceCatalogSelections = dependencies.enforceCatalogSelections ?? true;
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

    const serviceContext: SaveWorkingSetServiceContext = { ...input.serviceContext, serviceTime: normalizeServiceTime(input.serviceContext.serviceTime) };
    const serviceContextIssues = validateSaveWorkingSetServiceContext(serviceContext, input.set);
    if (serviceContextIssues.length > 0) {
      return failure({
        code: "invalidInput",
        message: "Service context is required before saving a working set.",
        issues: serviceContextIssues,
      });
    }

    const existingSet = input.existingSetId ? await this.planningSets.findById(input.existingSetId) : undefined;
    const normalized = await this.validateAndNormalizeCatalogReferences(serviceContext, input.set, existingSet, input.allowLanguageDeviations === true);
    if (normalized.issues.length > 0) {
      return failure({ code: "invalidInput", message: "Catalog selections are invalid.", issues: normalized.issues });
    }

    const validation = validatePlanningSet(normalized.set);
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

    const duplicate = await this.findDuplicateService(serviceContext, input.existingSetId);
    if (duplicate) {
      return failure({ code: "invalidInput", message: `A service already exists for ${serviceContext.serviceDate} at ${serviceContext.serviceTime}.` });
    }

    return success(await this.planningSets.saveWorkingSet(normalized.set as PlanningSet & { status: "working" }, normalized.serviceContext, input.existingSetId));
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

  async updateCompletedRecord(input: UpdateCompletedRecordInput): Promise<PlanningServiceResult<CompletedServiceRecord>> {
    if (!canPerformPlanningAction(input.role, "editCompletedServiceRecord")) {
      return failure({ code: "permissionDenied", message: "Only admin can edit completed service records." });
    }

    const existing = await this.completedServiceRecords.findById(input.recordId);
    if (!existing) {
      return failure({ code: "notFound", message: "Completed record was not found." });
    }

    const serviceContext: ServiceContext = { ...input.serviceContext, serviceTime: normalizeServiceTime(input.serviceContext.serviceTime) };
    const serviceContextIssues = validateSaveWorkingSetServiceContext(serviceContext, input.set);
    if (serviceContextIssues.length > 0) {
      return failure({ code: "invalidInput", message: "Service context is required before saving completed changes.", issues: serviceContextIssues });
    }

    const normalized = await this.validateAndNormalizeCatalogReferences(serviceContext, input.set, existing, input.allowLanguageDeviations === true);
    if (normalized.issues.length > 0) {
      return failure({ code: "invalidInput", message: "Catalog selections are invalid.", issues: normalized.issues });
    }

    const validation = validatePlanningSet(normalized.set);
    if (!validation.valid) {
      return failure({ code: "invalidInput", message: "Completed record rows are invalid.", issues: validation.issues });
    }

    const duplicate = await this.findDuplicateService(serviceContext, undefined, input.recordId);
    if (duplicate) {
      return failure({ code: "invalidInput", message: `A service already exists for ${serviceContext.serviceDate} at ${serviceContext.serviceTime}.` });
    }

    try {
      return success(await this.completedServiceRecords.update(input.recordId, normalized.serviceContext, { status: "final", language: normalized.serviceContext.language, rows: normalized.set.rows }));
    } catch {
      return failure({ code: "notFound", message: "Completed record was not found." });
    }
  }

  async deleteCompletedRecord(input: DeleteCompletedRecordInput): Promise<PlanningServiceResult<{ deletedRecordId: string }>> {
    if (!canPerformPlanningAction(input.role, "deleteCompletedServiceRecord")) {
      return failure({ code: "permissionDenied", message: "Only admin can delete completed service records." });
    }

    const existing = await this.completedServiceRecords.findById(input.recordId);
    if (!existing) {
      return failure({ code: "notFound", message: "Completed record was not found." });
    }

    await this.completedServiceRecords.deleteById(input.recordId);
    return success({ deletedRecordId: input.recordId });
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

  private async validateAndNormalizeCatalogReferences<TSet extends PlanningSet>(serviceContext: ServiceContext, set: TSet, existing?: PersistedPlanningSet | CompletedServiceRecord, allowLanguageDeviations = false): Promise<{ serviceContext: ServiceContext; set: TSet; issues: { path: string; message: string }[] }> {
    const issues: { path: string; message: string }[] = [];
    if (!this.enforceCatalogSelections) {
      return {
        serviceContext: { ...serviceContext, priest: { ...serviceContext.priest }, organist: { ...serviceContext.organist } },
        set: { ...set, rows: set.rows.map((row) => ({ ...(row.song ? { song: { ...row.song } } : {}), ...(row.note ? { note: row.note } : {}) })) } as TSet,
        issues,
      };
    }
    const normalizedContext: ServiceContext = {
      ...serviceContext,
      priest: { ...serviceContext.priest },
      organist: { ...serviceContext.organist },
    };
    const normalizedRows: PlanningRow[] = set.rows.map((row) => ({
      ...(row.song ? { song: { ...row.song } } : {}),
      ...(row.note ? { note: row.note } : {}),
    }));
    const unchangedSongs = createSongSnapshotMultiset(existing ? getRowsFromExisting(existing) : []);

    for (const [role, ref] of [["priest", normalizedContext.priest], ["organist", normalizedContext.organist]] as const) {
      const previous = existing?.serviceContext[role];
      if (!ref.id) { issues.push({ path: role, message: `${role} must be selected from the person catalog.` }); continue; }
      if (previous?.id === ref.id && previous.displayName === ref.displayName) continue;
      const person = await this.catalog.findPersonById(ref.id);
      if (!isEligiblePerson(person, role)) issues.push({ path: role, message: `${role} is not active for the selected role.` });
      else ref.displayName = person!.displayName;
    }

    for (const [index, row] of normalizedRows.entries()) {
      if (!row.song) continue;
      if (!row.song.songId) { issues.push({ path: `rows.${index}.song`, message: "Song must be selected from the song catalog." }); continue; }
      if (consumeUnchangedSongSnapshot(unchangedSongs, row.song)) {
        if (!allowLanguageDeviations && !languagesForService(normalizedContext.language).includes(row.song.language)) {
          issues.push({ path: `rows.${index}.song`, message: "Song is not active for this service language." });
        }
        continue;
      }
      const song = await this.catalog.findSongById(row.song.songId);
      if (!song) { issues.push({ path: `rows.${index}.song`, message: "Song was not found in the catalog." }); continue; }
      if (!song.active) { issues.push({ path: `rows.${index}.song`, message: "Song is not active." }); continue; }
      if (!allowLanguageDeviations && !languagesForService(normalizedContext.language).includes(song.language)) { issues.push({ path: `rows.${index}.song`, message: "Song is not active for this service language." }); continue; }
      row.song = { songId: song.songId, language: song.language, number: song.number, title: song.title };
    }

    return { serviceContext: normalizedContext, set: { ...set, rows: normalizedRows } as TSet, issues };
  }

  private async findDuplicateService(serviceContext: ServiceContext, currentSetId?: PlanningSetId, currentCompletedRecordId?: string): Promise<PersistedPlanningSet | CompletedServiceRecord | undefined> {
    const sets = await this.planningSets.list();
    const activeDuplicate = sets.find((set) => set.id !== currentSetId && set.serviceContext.serviceDate === serviceContext.serviceDate && normalizeServiceTime(set.serviceContext.serviceTime) === serviceContext.serviceTime);
    if (activeDuplicate) return activeDuplicate;
    const completed = await this.completedServiceRecords.list();
    return completed.find((record) => record.id !== currentCompletedRecordId && record.serviceContext.serviceDate === serviceContext.serviceDate && normalizeServiceTime(record.serviceContext.serviceTime) === serviceContext.serviceTime);
  }
}

function getRowsFromExisting(existing: PersistedPlanningSet | CompletedServiceRecord): PlanningRow[] {
  return "set" in existing ? existing.set.rows : existing.rows;
}

function createSongSnapshotMultiset(rows: PlanningRow[]): Map<string, number> {
  const multiset = new Map<string, number>();
  for (const row of rows) {
    if (!row.song?.songId) continue;
    const key = songSnapshotKey(row.song);
    multiset.set(key, (multiset.get(key) ?? 0) + 1);
  }
  return multiset;
}

function consumeUnchangedSongSnapshot(multiset: Map<string, number>, song: NonNullable<PlanningRow["song"]>): boolean {
  const key = songSnapshotKey(song);
  const count = multiset.get(key) ?? 0;
  if (count <= 0) return false;
  if (count === 1) multiset.delete(key);
  else multiset.set(key, count - 1);
  return true;
}

function songSnapshotKey(song: NonNullable<PlanningRow["song"]>): string {
  return JSON.stringify({ songId: song.songId, language: song.language, number: song.number, title: song.title });
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
    ...(!isValidServiceTime(serviceContext.serviceTime) ? [{ path: "serviceTime", message: "Service time is required in HH:mm format between 00:00 and 23:59." }] : []),
    ...(!serviceContext.priest.displayName.trim() ? [{ path: "priest", message: "Priest is required." }] : []),
    ...(!serviceContext.organist.displayName.trim() ? [{ path: "organist", message: "Organist is required." }] : []),
  ];
}
