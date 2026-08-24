import {
  canPerformPlanningAction,
  isValidServiceTime,
  normalizeServiceTime,
  serviceAntiphonLanguageFromId,
  serviceAntiphonMatchesLanguage,
  serviceTopicLanguageFromId,
  serviceTopicMatchesLanguage,
  validatePlanningSet,
  findMelodyCollisions,
  melodyCollisionSummary,
  type MelodyCollision,
  type PlanningRole,
  type PlanningRow,
  type PlanningSet,
  type ServiceAntiphonReference,
  type ServiceContext,
  type ServiceTopicReference,
} from "../../planning-lifecycle";
import type { CatalogRepository } from "../catalog";
import type { ReferenceAntiphonProvider, ReferenceAntiphonRecord } from "../reference-antiphon-contract";
import type { ReferenceCatalogRecord } from "../reference-catalog-contract";
import type { ReferenceThematicSection, ReferenceThematicSectionProvider } from "../reference-thematic-section-contract";
import type { ReferenceMelodyClassProvider } from "../reference-melody-class-provider";
import { isEligiblePerson, languagesForService } from "../catalog";
import type {
  CompletedServiceRecord,
  CompletedServiceRecordRepository,
  FinalSetCompletionPersistenceResult,
  FinalSetCompletionRepository,
  PersistedPlanningSet,
  PlanningSetId,
  PlanningSetRepository,
} from "./ports";
import { failure, success, type PlanningServiceResult } from "./results";

export type PlanningLifecycleServiceDependencies = {
  planningSets: PlanningSetRepository;
  completedServiceRecords: CompletedServiceRecordRepository;
  finalSetCompletion?: FinalSetCompletionRepository;
  catalog: CatalogRepository;
  referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;
  referenceTopics?: Pick<ReferenceThematicSectionProvider, "getSectionById">;
  referenceSongs?: { getById(id: string): ReferenceCatalogRecord | undefined | Promise<ReferenceCatalogRecord | undefined> };
  referenceMelodyClasses?: ReferenceMelodyClassProvider;
  melodyNonRepetitionMonths?: () => number | Promise<number>;
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

export type ReopenFinalSetInput = {
  role: PlanningRole;
  finalSetId: PlanningSetId;
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
  acceptPlanInvalidation?: boolean;
};

export type DeleteCompletedRecordInput = {
  role: PlanningRole;
  recordId: string;
};

export class PlanningLifecycleService {
  private readonly now: () => Date;
  private readonly planningSets: PlanningSetRepository;
  private readonly completedServiceRecords: CompletedServiceRecordRepository;
  private readonly finalSetCompletion?: FinalSetCompletionRepository;
  private fallbackCompletionTail: Promise<void> = Promise.resolve();
  private readonly catalog: CatalogRepository;
  private readonly referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;
  private readonly referenceTopics?: Pick<ReferenceThematicSectionProvider, "getSectionById">;
  private readonly referenceSongs?: { getById(id: string): ReferenceCatalogRecord | undefined | Promise<ReferenceCatalogRecord | undefined> };
  private readonly referenceMelodyClasses?: ReferenceMelodyClassProvider;
  private readonly melodyNonRepetitionMonths: () => Promise<number>;
  private readonly enforceCatalogSelections: boolean;

  constructor(dependencies: PlanningLifecycleServiceDependencies) {
    this.planningSets = dependencies.planningSets;
    this.completedServiceRecords = dependencies.completedServiceRecords;
    this.finalSetCompletion = dependencies.finalSetCompletion;
    this.catalog = dependencies.catalog;
    this.referenceAntiphons = dependencies.referenceAntiphons;
    this.referenceTopics = dependencies.referenceTopics;
    this.referenceSongs = dependencies.referenceSongs;
    this.referenceMelodyClasses = dependencies.referenceMelodyClasses;
    this.melodyNonRepetitionMonths = async () => Number(await dependencies.melodyNonRepetitionMonths?.() ?? 2);
    this.enforceCatalogSelections = dependencies.enforceCatalogSelections ?? true;
    this.now = dependencies.now ?? (() => new Date());
  }


  async listPlanningSets(): Promise<PlanningServiceResult<PersistedPlanningSet[]>> {
    await this.reconcilePastFinalSets();
    return success(await this.annotateRevisionStates(await this.planningSets.list()));
  }

  async listCompletedRecords(): Promise<PlanningServiceResult<CompletedServiceRecord[]>> {
    await this.reconcilePastFinalSets();
    return success(await this.completedServiceRecords.list());
  }

  async loadPlanningSet(setId: PlanningSetId): Promise<PlanningServiceResult<PersistedPlanningSet>> {
    const set = await this.planningSets.findById(setId);
    if (!set) return failure({ code: "notFound", message: "Planning set was not found." });
    return success((await this.annotateRevisionStates([set]))[0]);
  }

  async loadCompletedRecord(recordId: string): Promise<PlanningServiceResult<CompletedServiceRecord>> {
    const record = await this.completedServiceRecords.findById(recordId);
    return record ? success(record) : failure({ code: "notFound", message: "Completed record was not found." });
  }

  async saveWorkingSet(input: SaveWorkingSetInput): Promise<PlanningServiceResult<PersistedPlanningSet>> {
    if (!canPerformPlanningAction(input.role, input.existingSetId ? "editWorkingSet" : "createWorkingSet")) {
      return failure({ code: "permissionDenied", message: "Role cannot save a working planning set." });
    }

    const rawServiceContext: SaveWorkingSetServiceContext = normalizeServiceContext(input.serviceContext);
    const serviceContextIssues = validateSaveWorkingSetServiceContext(rawServiceContext, input.set);
    if (serviceContextIssues.length > 0) {
      return failure({
        code: "invalidInput",
        message: "Service context is required before saving a working set.",
        issues: serviceContextIssues,
      });
    }

    const existingSet = input.existingSetId ? await this.planningSets.findById(input.existingSetId) : undefined;
    const antiphonContext = await this.validateAndNormalizeReferenceAntiphon(rawServiceContext, existingSet);
    if (!antiphonContext.success) return antiphonContext;
    const topicContext = await this.validateAndNormalizeReferenceTopic(antiphonContext.value, existingSet);
    if (!topicContext.success) return topicContext;
    const serviceContext = topicContext.value;
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

    const historyConflicts = await this.findHistoryConflictsForPlan({ ...(normalized.set as PlanningSet & { status: "working" }), id: input.existingSetId ?? "candidate", serviceContext: normalized.serviceContext });
    if (historyConflicts.length > 0) return failure({ code: "invalidInput", message: "Working planning set conflicts with authoritative Completed history.", issues: historyConflicts.map((conflict) => ({ path: "historyNonRepeat", message: conflict.reason })) });

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

    const finalPeopleIssues = await this.validateFinalPeople(workingSet.serviceContext);
    if (finalPeopleIssues.length > 0) {
      return failure({ code: "invalidInput", message: "Final service requires a concrete active priest and organist.", issues: finalPeopleIssues });
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

    const melodyCollisions = await this.getAuthoritativeMelodyCollisions(finalSet.rows);
    if (melodyCollisions.length > 0) {
      return failure({
        code: "invalidInput",
        message: melodyCollisionSummary(melodyCollisions) ?? "Final planning set contains a melody collision.",
        issues: melodyCollisions.flatMap((collision) => collision.rows.map((row) => ({
          path: `rows.${row.rowId - 1}.song`,
          message: `This melody is also used in ${collision.rows.filter((candidate) => candidate.rowId !== row.rowId).map((candidate) => candidate.rowLabel).join(" and ")}.`,
        }))),
      });
    }

    const historyConflicts = await this.findHistoryConflictsForPlan({ ...workingSet, status: "final", rows: finalSet.rows });
    if (historyConflicts.length > 0) return failure({ code: "invalidInput", message: "Final planning set conflicts with authoritative Completed history.", issues: historyConflicts.map((conflict) => ({ path: "historyNonRepeat", message: conflict.reason })) });

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

  async reopenFinalSet(input: ReopenFinalSetInput): Promise<PlanningServiceResult<PersistedPlanningSet>> {
    if (input.role !== "admin") {
      return failure({ code: "permissionDenied", message: "Only admin can reopen a final planning set." });
    }
    const finalSet = await this.planningSets.findById(input.finalSetId);
    if (!finalSet) return failure({ code: "notFound", message: "Final planning set was not found." });
    if (finalSet.status !== "final") return failure({ code: "invalidStatus", message: "Only final planning sets can be reopened." });
    return success(await this.planningSets.saveWorkingSet(
      { status: "working", language: finalSet.language, rows: finalSet.rows },
      finalSet.serviceContext,
      finalSet.id,
    ));
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
    if (!existing) return failure({ code: "notFound", message: "Completed record was not found." });

    const rawServiceContext: ServiceContext = normalizeServiceContext(input.serviceContext);
    const serviceContextIssues = validateSaveWorkingSetServiceContext(rawServiceContext, input.set);
    if (serviceContextIssues.length > 0) return failure({ code: "invalidInput", message: "Service context is required before saving completed changes.", issues: serviceContextIssues });

    const antiphonContext = await this.validateAndNormalizeReferenceAntiphon(rawServiceContext, existing);
    if (!antiphonContext.success) return antiphonContext;
    const topicContext = await this.validateAndNormalizeReferenceTopic(antiphonContext.value, existing);
    if (!topicContext.success) return topicContext;
    const normalized = await this.validateAndNormalizeCatalogReferences(topicContext.value, input.set, existing, true, true);
    if (normalized.issues.length > 0) return failure({ code: "invalidInput", message: "Historical song references are invalid.", issues: normalized.issues });

    const historicalValidation = validateHistoricalCompletedSet(normalized.set);
    if (historicalValidation.length > 0) return failure({ code: "invalidInput", message: "Completed historical rows are malformed.", issues: historicalValidation });

    const duplicate = await this.findDuplicateService(normalized.serviceContext, undefined, input.recordId);
    if (duplicate) return failure({ code: "invalidInput", message: `A service already exists for ${normalized.serviceContext.serviceDate} at ${normalized.serviceContext.serviceTime}.` });

    const proposed: CompletedServiceRecord = {
      ...existing,
      serviceContext: normalized.serviceContext,
      set: { status: "final", language: normalized.serviceContext.language, rows: normalized.set.rows },
    };
    const [currentImpact, proposedImpact] = await Promise.all([
      this.findPlansImpactedByCompleted(existing),
      this.findPlansImpactedByCompleted(proposed),
    ]);
    const currentIds = new Set(currentImpact.map((impact) => impact.planId));
    const newlyImpacted = proposedImpact.filter((impact) => !currentIds.has(impact.planId));
    if (newlyImpacted.length > 0 && input.acceptPlanInvalidation !== true) {
      return failure({
        code: "invalidInput",
        message: "Completed correction would invalidate active plans. Confirmation is required.",
        issues: newlyImpacted.map((impact) => ({
          path: `retroactivePlan.${impact.planId}`,
          message: `${impact.reason} ${impact.planStatus === "final" ? "This Final plan will move to Working." : "This Working plan will require revision."}`,
        })),
      });
    }

    try {
      return success(await this.completedServiceRecords.update(input.recordId, normalized.serviceContext, proposed.set, newlyImpacted.map((impact) => impact.planId)));
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

    const outcome = await this.persistFinalSetCompletion(finalSet as PersistedPlanningSet & { status: "final" }, this.now());
    if (outcome.status === "notFound") {
      return failure({ code: "notFound", message: "Final planning set was not found." });
    }
    if (outcome.status === "notFinal") {
      return failure({ code: "invalidStatus", message: "Only final planning sets can be completed." });
    }
    return success(outcome.record);
  }

  private async reconcilePastFinalSets(): Promise<void> {
    const now = this.now();
    const overdue = (await this.planningSets.list())
      .filter((set): set is PersistedPlanningSet & { status: "final" } => set.status === "final" && isPastPragueDate(set.serviceContext.serviceDate, now))
      .sort((left, right) => left.serviceContext.serviceDate.localeCompare(right.serviceContext.serviceDate) || left.id.localeCompare(right.id));

    for (const finalSet of overdue) {
      // A concurrent reconciliation/manual completion may win after the list snapshot.
      // notFound/notFinal are therefore benign here; a completed outcome is already persisted.
      await this.persistFinalSetCompletion(finalSet, now);
    }
  }

  private async persistFinalSetCompletion(
    finalSet: PersistedPlanningSet & { status: "final" },
    completedAt: Date,
  ): Promise<FinalSetCompletionPersistenceResult> {
    if (this.finalSetCompletion) {
      return this.finalSetCompletion.completeFinalSet(finalSet.id, completedAt);
    }

    // Memory/custom runtimes use one serialized fallback completion boundary.
    // PostgreSQL supplies the runtime-specific atomic repository below.
    return this.withFallbackCompletionLock(async () => {
      const current = await this.planningSets.findById(finalSet.id);
      if (!current) return { status: "notFound" };
      if (current.status !== "final") return { status: "notFinal" };
      const record = await this.completedServiceRecords.createFromFinalSet({
        sourceFinalSetId: current.id,
        set: { status: "final", language: current.language, rows: current.rows },
        serviceContext: current.serviceContext,
        completedAt,
      });
      await this.planningSets.deleteById(current.id);
      return { status: "completed", record };
    });
  }

  private async withFallbackCompletionLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.fallbackCompletionTail;
    let release!: () => void;
    this.fallbackCompletionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async getAuthoritativeMelodyCollisions(rows: PlanningRow[]): Promise<MelodyCollision[]> {
    if (!this.referenceMelodyClasses) return [];
    const songIds = rows.flatMap((row) => row.song?.songId ? [row.song.songId] : []);
    const memberships = await this.referenceMelodyClasses.getClassMemberships(songIds);
    const classBySongId = new Map(memberships.map((membership) => [membership.songId, membership.melodyClassId]));
    return findMelodyCollisions(rows.map((row, index) => ({
      rowId: index + 1,
      rowLabel: `Row ${index + 1}`,
      songId: row.song?.songId,
      melodyClassId: row.song?.songId ? classBySongId.get(row.song.songId) : undefined,
    })));
  }

  private async validateAndNormalizeReferenceAntiphon(
    serviceContext: ServiceContext,
    existing?: PersistedPlanningSet | CompletedServiceRecord,
  ): Promise<PlanningServiceResult<ServiceContext>> {
    const candidate = (serviceContext as ServiceContext & { referenceAntiphon?: unknown }).referenceAntiphon;
    if (candidate === undefined) {
      return success({ ...serviceContext, referenceAntiphon: undefined });
    }

    if (!isServiceAntiphonReference(candidate)) {
      return failure({
        code: "invalidInput",
        message: "Authoritative antiphon selection is malformed.",
        issues: [{ path: "serviceContext.referenceAntiphon", message: "Select an antiphon from the authoritative catalog." }],
      });
    }

    if (!serviceAntiphonMatchesLanguage(candidate, serviceContext.language)) {
      return failure({
        code: "invalidInput",
        message: "Selected antiphon must match the service language.",
        issues: [{ path: "serviceContext.referenceAntiphon", message: "Selected antiphon must match the service language." }],
      });
    }

    const previous = existing?.serviceContext.referenceAntiphon;
    if (previous && sameServiceAntiphonReference(previous, candidate)) {
      return success({ ...serviceContext, referenceAntiphon: { ...previous } });
    }

    if (!isAcceptedReferenceAntiphonId(candidate.id)) {
      return failure({
        code: "invalidInput",
        message: "Authoritative antiphon identity is invalid.",
        issues: [{ path: "serviceContext.referenceAntiphon.id", message: "Antiphon id must be a positive Czech or Polish authoritative id." }],
      });
    }

    if (!this.referenceAntiphons) {
      return failure({ code: "invalidInput", message: "Authoritative antiphon selection is unavailable in this runtime." });
    }

    const authoritative = await this.referenceAntiphons.getById(candidate.id);
    const expectedLanguage = serviceAntiphonLanguageFromId(candidate.id);
    if (!authoritative || !expectedLanguage || authoritative.language !== expectedLanguage) {
      return failure({ code: "notFound", message: "Authoritative antiphon was not found." });
    }

    return success({ ...serviceContext, referenceAntiphon: serviceAntiphonSnapshot(authoritative) });
  }

  private async validateAndNormalizeReferenceTopic(
    serviceContext: ServiceContext,
    existing?: PersistedPlanningSet | CompletedServiceRecord,
  ): Promise<PlanningServiceResult<ServiceContext>> {
    const candidate = (serviceContext as ServiceContext & { referenceTopic?: unknown }).referenceTopic;
    if (candidate === undefined) return success({ ...serviceContext, referenceTopic: undefined });
    if (!isServiceTopicReference(candidate)) {
      return failure({ code: "invalidInput", message: "Authoritative Topic selection is malformed.", issues: [{ path: "serviceContext.referenceTopic", message: "Select a Topic from the authoritative catalog." }] });
    }
    if (!serviceTopicMatchesLanguage(candidate, serviceContext.language)) {
      return failure({ code: "invalidInput", message: "Selected topic must match the service language.", issues: [{ path: "serviceContext.referenceTopic", message: "Selected topic must match the service language." }] });
    }
    const previous = existing?.serviceContext.referenceTopic;
    if (previous && sameServiceTopicReference(previous, candidate)) return success({ ...serviceContext, referenceTopic: { ...previous } });
    if (!isAcceptedReferenceTopicId(candidate.id)) {
      return failure({ code: "invalidInput", message: "Authoritative Topic identity is invalid.", issues: [{ path: "serviceContext.referenceTopic.id", message: "Topic id must be a Czech or Polish authoritative thematic-section id." }] });
    }
    if (!this.referenceTopics) return failure({ code: "invalidInput", message: "Authoritative Topic selection is unavailable in this runtime." });
    const authoritative = await this.referenceTopics.getSectionById(candidate.id);
    const expectedLanguage = serviceTopicLanguageFromId(candidate.id);
    if (!authoritative || !expectedLanguage || authoritative.language !== expectedLanguage) return failure({ code: "notFound", message: "Authoritative Topic was not found." });
    return success({ ...serviceContext, referenceTopic: serviceTopicSnapshot(authoritative) });
  }

  private async validateAndNormalizeCatalogReferences<TSet extends PlanningSet>(serviceContext: ServiceContext, set: TSet, existing?: PersistedPlanningSet | CompletedServiceRecord, allowLanguageDeviations = false, allowHistoricalTruthRows = false): Promise<{ serviceContext: ServiceContext; set: TSet; issues: { path: string; message: string }[] }> {
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
      if (!ref.id) {
        if (ref.displayName === "Anonymous") continue;
        issues.push({ path: role, message: `${role} must be selected from the person catalog or explicitly set to Anonymous.` });
        continue;
      }
      if (previous?.id === ref.id && previous.displayName === ref.displayName) continue;
      const person = await this.catalog.findPersonById(ref.id);
      if (!isEligiblePerson(person, role)) issues.push({ path: role, message: `${role} is not active for the selected role.` });
      else ref.displayName = person!.displayName;
    }

    for (const [index, row] of normalizedRows.entries()) {
      if (!row.song) continue;
      if (allowHistoricalTruthRows && row.song.number.trim() === "0") {
        if (row.song.language !== "czech" && row.song.language !== "polish") issues.push({ path: `rows.${index}.song.language`, message: "Historical zero must retain Czech or Polish language." });
        else row.song = { language: row.song.language, number: "0" };
        continue;
      }
      if (!row.song.songId) { issues.push({ path: `rows.${index}.song`, message: "Positive historical song number must be selected from the catalog." }); continue; }
      if (consumeUnchangedSongSnapshot(unchangedSongs, row.song)) {
        if (!allowLanguageDeviations && !languagesForService(normalizedContext.language).includes(row.song.language)) {
          issues.push({ path: `rows.${index}.song`, message: "Song is not active for this service language." });
        }
        continue;
      }
      const referenceSong = await this.referenceSongs?.getById(row.song.songId);
      if (referenceSong) {
        if (!allowLanguageDeviations && !languagesForService(normalizedContext.language).includes(referenceSong.language)) { issues.push({ path: `rows.${index}.song`, message: "Song is not active for this service language." }); continue; }
        row.song = { songId: referenceSong.id, language: referenceSong.language, number: referenceSong.displayNumber, title: referenceSong.title };
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

  private async annotateRevisionStates(sets: PersistedPlanningSet[]): Promise<PersistedPlanningSet[]> {
    if (!this.referenceMelodyClasses || sets.length === 0) return sets;
    return Promise.all(sets.map(async (set) => {
      const conflicts = await this.findHistoryConflictsForPlan(set);
      if (conflicts.length === 0) return { ...set, needsRevision: undefined };
      return {
        ...set,
        needsRevision: {
          reason: `Needs revision: ${conflicts.map((conflict) => conflict.reason).join(" ")}`,
          conflictingCompletedRecordIds: [...new Set(conflicts.map((conflict) => conflict.completedRecordId))],
        },
      };
    }));
  }

  private async findPlansImpactedByCompleted(record: CompletedServiceRecord): Promise<HistoryConflict[]> {
    const plans = await this.planningSets.list();
    const impacts: HistoryConflict[] = [];
    for (const plan of plans) impacts.push(...await this.findHistoryConflictsForPlan(plan, [record]));
    return impacts;
  }

  private async findHistoryConflictsForPlan(plan: PersistedPlanningSet, completedOverride?: CompletedServiceRecord[]): Promise<HistoryConflict[]> {
    if (!this.referenceMelodyClasses) return [];
    const completed = completedOverride ?? await this.completedServiceRecords.list();
    if (completed.length === 0) return [];
    const months = Math.max(0, Math.floor(await this.melodyNonRepetitionMonths()));
    const planSongIds = plan.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : []);
    const completedSongIds = completed.flatMap((record) => record.set.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : []));
    const allIds = [...new Set([...planSongIds, ...completedSongIds])];
    const memberships = await this.referenceMelodyClasses.getClassMemberships(allIds);
    const classBySong = new Map(memberships.map((membership) => [membership.songId, membership.melodyClassId]));
    const classOf = (songId: string) => classBySong.get(songId) ?? `reference-singleton:${songId}`;
    const conflicts: HistoryConflict[] = [];
    for (const record of completed) {
      if (!isWithinCalendarMonths(plan.serviceContext.serviceDate, record.serviceContext.serviceDate, months)) continue;
      let found: HistoryConflict | undefined;
      for (const planRow of plan.rows) {
        if (!planRow.song?.songId) continue;
        for (const historicalRow of record.set.rows) {
          if (!historicalRow.song?.songId || classOf(planRow.song.songId) !== classOf(historicalRow.song.songId)) continue;
          found = {
            planId: plan.id,
            planStatus: plan.status,
            completedRecordId: record.id,
            reason: `${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}: song ${planRow.song.number} conflicts with Completed ${record.serviceContext.serviceDate} ${record.serviceContext.serviceTime}, song ${historicalRow.song.number}, within the ${months}-month melody non-repetition period.`,
          };
          break;
        }
        if (found) break;
      }
      if (found) conflicts.push(found);
    }
    return conflicts;
  }

  private async validateFinalPeople(serviceContext: ServiceContext): Promise<{ path: string; message: string }[]> {
    const issues: { path: string; message: string }[] = [];
    for (const [role, ref] of [["priest", serviceContext.priest], ["organist", serviceContext.organist]] as const) {
      if (!ref.id) { issues.push({ path: role, message: `${role} must be a concrete active person before finalization.` }); continue; }
      if (!this.enforceCatalogSelections) continue;
      const person = await this.catalog.findPersonById(ref.id);
      if (!isEligiblePerson(person, role)) issues.push({ path: role, message: `${role} is not active for the selected role.` });
    }
    return issues;
  }

  private async findDuplicateService(serviceContext: ServiceContext, currentSetId?: PlanningSetId, currentCompletedRecordId?: string): Promise<PersistedPlanningSet | CompletedServiceRecord | undefined> {
    const sets = await this.planningSets.list();
    const activeDuplicate = sets.find((set) => set.id !== currentSetId && set.serviceContext.serviceDate === serviceContext.serviceDate && normalizeServiceTime(set.serviceContext.serviceTime) === serviceContext.serviceTime);
    if (activeDuplicate) return activeDuplicate;
    const completed = await this.completedServiceRecords.list();
    return completed.find((record) => record.id !== currentCompletedRecordId && record.serviceContext.serviceDate === serviceContext.serviceDate && normalizeServiceTime(record.serviceContext.serviceTime) === serviceContext.serviceTime);
  }
}

type HistoryConflict = { planId: PlanningSetId; planStatus: "working" | "final"; completedRecordId: string; reason: string };

function validateHistoricalCompletedSet(set: PlanningSet): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (set.status !== "final") issues.push({ path: "status", message: "Completed snapshot status must be final." });
  if (set.language !== "czech" && set.language !== "polish" && set.language !== "mixed") issues.push({ path: "language", message: "Completed snapshot language is invalid." });
  if (!Array.isArray(set.rows)) return [...issues, { path: "rows", message: "Completed rows must be an array." }];
  set.rows.forEach((row, index) => {
    if (!row || typeof row !== "object") { issues.push({ path: `rows.${index}`, message: "Historical row is malformed." }); return; }
    if (!row.song) return;
    if ((row.song.language !== "czech" && row.song.language !== "polish") || typeof row.song.number !== "string" || !row.song.number.trim()) issues.push({ path: `rows.${index}.song`, message: "Historical song reference is malformed." });
    if (row.song.songId !== undefined && (typeof row.song.songId !== "string" || !row.song.songId.trim())) issues.push({ path: `rows.${index}.song.songId`, message: "Historical catalog song ID is malformed." });
  });
  return issues;
}

function isWithinCalendarMonths(leftDate: string, rightDate: string, months: number): boolean {
  const left = Date.parse(`${leftDate}T00:00:00Z`);
  const right = Date.parse(`${rightDate}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return right >= addMonthsUtc(left, -months) && right <= addMonthsUtc(left, months);
}
function addMonthsUtc(value: number, months: number): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}

function normalizeServiceContext(context: ServiceContext): ServiceContext {
  return {
    ...context,
    serviceTime: normalizeServiceTime(context.serviceTime),
    ...(context.note?.trim() ? { note: context.note.trim() } : { note: undefined }),
    ...(isServiceAntiphonReference(context.referenceAntiphon)
      ? { referenceAntiphon: { ...context.referenceAntiphon } }
      : context.referenceAntiphon === undefined
        ? { referenceAntiphon: undefined }
        : { referenceAntiphon: context.referenceAntiphon as never }),
    ...(isServiceTopicReference(context.referenceTopic)
      ? { referenceTopic: { ...context.referenceTopic } }
      : context.referenceTopic === undefined
        ? { referenceTopic: undefined }
        : { referenceTopic: context.referenceTopic as never }),
    ...(context.antiphonKey?.trim() ? { antiphonKey: context.antiphonKey.trim() } : { antiphonKey: undefined }),
    ...(context.liturgicalSeasonKey?.trim() ? { liturgicalSeasonKey: context.liturgicalSeasonKey.trim() } : { liturgicalSeasonKey: undefined }),
  };
}

function isServiceAntiphonReference(value: unknown): value is ServiceAntiphonReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.some((key) => !["displayNumber", "id", "sourceUrl", "title"].includes(key))) return false;
  if (!keys.includes("id") || !keys.includes("displayNumber") || !keys.includes("title")) return false;
  if (typeof record.id !== "string" || typeof record.displayNumber !== "string" || typeof record.title !== "string") return false;
  if (record.sourceUrl !== undefined && (typeof record.sourceUrl !== "string" || !record.sourceUrl.trim())) return false;
  return record.id.trim() === record.id && record.displayNumber.trim().length > 0 && record.title.trim().length > 0;
}

function isAcceptedReferenceAntiphonId(id: string): boolean {
  return /^(czech|polish):[1-9]\d*$/.test(id);
}

function isServiceTopicReference(value: unknown): value is ServiceTopicReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "title") return false;
  return typeof record.id === "string" && record.id.trim() === record.id && record.id.length > 0 && typeof record.title === "string" && record.title.trim().length > 0;
}

function isAcceptedReferenceTopicId(id: string): boolean {
  return /^(czech|polish):[a-z0-9][a-z0-9:-]*$/.test(id);
}

function sameServiceTopicReference(left: ServiceTopicReference, right: ServiceTopicReference): boolean {
  return left.id === right.id && left.title === right.title;
}

function serviceTopicSnapshot(section: ReferenceThematicSection): ServiceTopicReference {
  return { id: section.id, title: section.title };
}

function sameServiceAntiphonReference(left: ServiceAntiphonReference, right: ServiceAntiphonReference): boolean {
  return left.id === right.id && left.displayNumber === right.displayNumber &&
    left.title === right.title && (left.sourceUrl ?? "") === (right.sourceUrl ?? "");
}

function serviceAntiphonSnapshot(record: ReferenceAntiphonRecord): ServiceAntiphonReference {
  return { id: record.id, displayNumber: record.displayNumber, title: record.title, ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}) };
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

export function pragueCalendarDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isPastPragueDate(serviceDate: string, now: Date): boolean {
  return serviceDate < pragueCalendarDate(now);
}

function isFuturePragueDate(serviceDate: string, now: Date): boolean {
  return serviceDate > pragueCalendarDate(now);
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
