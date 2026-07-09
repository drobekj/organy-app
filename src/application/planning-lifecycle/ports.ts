import type { PlanningSet } from "../../planning-lifecycle";

export type PlanningSetId = string;
export type CompletedServiceRecordId = string;

export type PersistedPlanningSet = PlanningSet & {
  id: PlanningSetId;
  completedAt?: Date;
};

export type CompletedServiceRecord = {
  id: CompletedServiceRecordId;
  sourceFinalSetId: PlanningSetId;
  set: PlanningSet & { status: "final" };
  completedAt: Date;
};

export interface PlanningSetRepository {
  findById(id: PlanningSetId): Promise<PersistedPlanningSet | undefined>;
  saveWorkingSet(set: PlanningSet & { status: "working" }, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;
  saveFinalSet(set: PlanningSet & { status: "final" }, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;
  deleteById(id: PlanningSetId): Promise<void>;
}

export interface CompletedServiceRecordRepository {
  createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;
}
