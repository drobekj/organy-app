import type { PlanningSet, ServiceContext } from "../../planning-lifecycle";

export type PlanningSetId = string;
export type CompletedServiceRecordId = string;

export type PersistedPlanningSet = PlanningSet & {
  id: PlanningSetId;
  serviceContext: ServiceContext;
  completedAt?: Date;
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
  deleteById(id: PlanningSetId): Promise<void>;
}

export interface CompletedServiceRecordRepository {
  createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;
  list(): Promise<CompletedServiceRecord[]>;
  findById(id: CompletedServiceRecordId): Promise<CompletedServiceRecord | undefined>;
  deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void>;
}
