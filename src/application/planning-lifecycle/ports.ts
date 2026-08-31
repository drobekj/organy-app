import type { PlanningPlan, ServiceContext } from "../../planning-lifecycle";

export type PlanningPlanId = string;
/** Compatibility alias retained while historical Set terminology is migrated call-site by call-site. */
export type PlanningSetId = PlanningPlanId;
export type CompletedServiceRecordId = string;

export type PlanningPlanRevisionState = { reason: string; conflictingCompletedRecordIds: string[]; conflictingRowIndexes?: number[] };
/** Compatibility alias retained while historical Set terminology is migrated call-site by call-site. */
export type PlanningSetRevisionState = PlanningPlanRevisionState;
export type CompletedServiceConflictState = { conflictingPlanIds: PlanningPlanId[]; conflictingRowIndexes: number[] };

export type PersistedPlanningPlan = PlanningPlan & {
  id: PlanningPlanId;
  serviceContext: ServiceContext;
  completedAt?: Date;
  needsRevision?: PlanningPlanRevisionState;
  lastChangedBy?: string;
};
/** Compatibility alias retained while historical Set terminology is migrated call-site by call-site. */
export type PersistedPlanningSet = PersistedPlanningPlan;

export type CompletedServiceRecord = {
  id: CompletedServiceRecordId;
  sourceFinalSetId: PlanningPlanId;
  set: PlanningPlan & { status: "final" };
  serviceContext: ServiceContext;
  completedAt: Date;
  conflictState?: CompletedServiceConflictState;
  lastChangedBy?: string;
};

export interface PlanningPlanRepository {
  list(): Promise<PersistedPlanningPlan[]>;
  findById(id: PlanningPlanId): Promise<PersistedPlanningPlan | undefined>;
  saveWorkingSet(set: PlanningPlan & { status: "working" }, serviceContext: ServiceContext, existingId?: PlanningPlanId): Promise<PersistedPlanningPlan>;
  saveFinalSet(set: PlanningPlan & { status: "final" }, serviceContext: ServiceContext, existingId?: PlanningPlanId): Promise<PersistedPlanningPlan>;
  demoteFinalToWorking(id: PlanningPlanId): Promise<void>;
  deleteById(id: PlanningPlanId): Promise<void>;
}
/** Compatibility alias retained while historical Set terminology is migrated call-site by call-site. */
export type PlanningSetRepository = PlanningPlanRepository;

export interface CompletedServiceRecordRepository {
  createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;
  list(): Promise<CompletedServiceRecord[]>;
  findById(id: CompletedServiceRecordId): Promise<CompletedServiceRecord | undefined>;
  update(id: CompletedServiceRecordId, serviceContext: ServiceContext, set: PlanningPlan & { status: "final" }, invalidatedPlanIds?: PlanningPlanId[]): Promise<CompletedServiceRecord>;
  deleteById(id: CompletedServiceRecordId): Promise<void>;
  deleteBySourceFinalSetId(sourceFinalSetId: PlanningPlanId): Promise<void>;
}

export type FinalSetCompletionPersistenceResult =
  | { status: "completed"; record: CompletedServiceRecord }
  | { status: "notFound" }
  | { status: "notFinal" };

/** Optional runtime-specific atomic boundary used by automatic and manual Final → Completed conversion. */
export interface FinalSetCompletionRepository {
  completeFinalSet(finalSetId: PlanningPlanId, completedAt: Date): Promise<FinalSetCompletionPersistenceResult>;
}
