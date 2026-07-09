import type * as planningLifecycleSchema from "../../db/schema";
import type {
  CompletedServiceRecord,
  CompletedServiceRecordRepository,
  PersistedPlanningSet,
  PlanningSetId,
  PlanningSetRepository,
} from "./ports";
import type { PlanningSet } from "../../planning-lifecycle";

export type PlanningLifecycleDrizzleSchema = Pick<
  typeof planningLifecycleSchema,
  | "serviceContexts"
  | "serviceSets"
  | "serviceSetRows"
  | "completedServices"
  | "completedServiceRows"
>;

export type PlanningLifecycleDrizzleAdapterDependencies = {
  schema: PlanningLifecycleDrizzleSchema;
};

export abstract class DrizzlePlanningSetRepositoryBase implements PlanningSetRepository {
  protected constructor(protected readonly dependencies: PlanningLifecycleDrizzleAdapterDependencies) {}

  abstract findById(id: PlanningSetId): Promise<PersistedPlanningSet | undefined>;

  abstract saveWorkingSet(
    set: PlanningSet & { status: "working" },
    existingId?: PlanningSetId,
  ): Promise<PersistedPlanningSet>;

  abstract saveFinalSet(
    set: PlanningSet & { status: "final" },
    existingId?: PlanningSetId,
  ): Promise<PersistedPlanningSet>;

  abstract deleteById(id: PlanningSetId): Promise<void>;
}

export abstract class DrizzleCompletedServiceRecordRepositoryBase
  implements CompletedServiceRecordRepository
{
  protected constructor(protected readonly dependencies: PlanningLifecycleDrizzleAdapterDependencies) {}

  abstract createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;

  abstract deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void>;
}
