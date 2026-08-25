import type { PlanningSet, ServiceContext } from "../../planning-lifecycle";

export type PlanningSetId = string;
export type CompletedServiceRecordId = string;

export type PlanningSetRevisionState = { reason: string; conflictingCompletedRecordIds: string[]; conflictingRowIndexes: number[] };

export type PersistedPlanningSet = PlanningSet & {
  id: PlanningSetId;
  serviceContext: ServiceContext;
  completedAt?: Date;
  needsRevision?: PlanningSetRevisionState;
};

export type CompletedServiceRecord = {
  id: CompletedServiceRecordId;
  sourceFinalSetId: PlanningSetId;
  set: PlanningSet & { status: "final" };
  serviceContext: ServiceContext;
  completedAt: Date;
};

export interface PlanningSetRepository {
  list(): Promise<PersistedPlanningSet[]>;
  findById(id: PlanningSetId): Promise<PersistedPlanningSet | undefined>;
  saveWorkingSet(set: PlanningSet & { status: "working" }, serviceContext: ServiceContext, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;
  saveFinalSet(set: PlanningSet & { status: "final" }, serviceContext: ServiceContext, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;
  demoteFinalToWorking(id: PlanningSetId): Promise<void>;
  deleteById(id: PlanningSetId): Promise<void>;
}

export interface CompletedServiceRecordRepository {
  createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;
  list(): Promise<CompletedServiceRecord[]>;
  findById(id: CompletedServiceRecordId): Promise<CompletedServiceRecord | undefined>;
  update(id: CompletedServiceRecordId, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }, invalidatedPlanIds?: PlanningSetId[]): Promise<CompletedServiceRecord>;
  deleteById(id: CompletedServiceRecordId): Promise<void>;
  deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void>;
}

export type FinalSetCompletionPersistenceResult =
  | { status: "completed"; record: CompletedServiceRecord }
  | { status: "notFound" }
  | { status: "notFinal" };

/** Optional runtime-specific atomic boundary used by automatic and manual Final → Completed conversion. */
export interface FinalSetCompletionRepository {
  completeFinalSet(finalSetId: PlanningSetId, completedAt: Date): Promise<FinalSetCompletionPersistenceResult>;
}