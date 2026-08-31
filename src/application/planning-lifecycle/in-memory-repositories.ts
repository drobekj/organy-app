import type {
  CompletedServiceRecord,
  CompletedServiceRecordRepository,
  PersistedPlanningPlan,
  PlanningPlanId,
  PlanningPlanRepository,
} from "./ports";
import { normalizeServiceTime, type PlanningPlan, type ServiceContext } from "../../planning-lifecycle";

export class InMemoryPlanningSetRepository implements PlanningPlanRepository {
  private readonly sets = new Map<PlanningPlanId, PersistedPlanningPlan>();
  private nextId = 1;

  async list(): Promise<PersistedPlanningPlan[]> {
    return [...this.sets.values()].map(clonePersistedPlanningSet);
  }

  async findById(id: PlanningPlanId): Promise<PersistedPlanningPlan | undefined> {
    const set = this.sets.get(id);
    return set ? clonePersistedPlanningSet(set) : undefined;
  }

  async saveWorkingSet(
    set: PlanningPlan & { status: "working" },
    serviceContext: ServiceContext,
    existingId?: PlanningPlanId,
  ): Promise<PersistedPlanningPlan> {
    return this.saveSet(set, serviceContext, existingId);
  }

  async saveFinalSet(
    set: PlanningPlan & { status: "final" },
    serviceContext: ServiceContext,
    existingId?: PlanningPlanId,
  ): Promise<PersistedPlanningPlan> {
    return this.saveSet(set, serviceContext, existingId);
  }

  async demoteFinalToWorking(id: PlanningPlanId): Promise<void> {
    const current = this.sets.get(id);
    if (current?.status === "final") this.sets.set(id, { ...current, status: "working" });
  }

  async deleteById(id: PlanningPlanId): Promise<void> {
    this.sets.delete(id);

    if (this.sets.size === 0) {
      this.nextId = 1;
    }
  }

  private saveSet(set: PlanningPlan, serviceContext: ServiceContext, existingId?: PlanningPlanId): PersistedPlanningPlan {
    const id = existingId ?? this.createId("planning-set");
    const persistedSet: PersistedPlanningPlan = {
      ...clonePlanningSet(set),
      id,
      serviceContext: cloneServiceContext(serviceContext),
    };

    this.sets.set(id, persistedSet);
    return clonePersistedPlanningSet(persistedSet);
  }

  private createId(prefix: string): string {
    const id = `${prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

export class InMemoryCompletedServiceRecordRepository implements CompletedServiceRecordRepository {
  private readonly records = new Map<string, CompletedServiceRecord>();
  private nextId = 1;

  constructor(private readonly planningSets?: Pick<PlanningPlanRepository, "demoteFinalToWorking">) {}

  async createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord> {
    const completedRecord: CompletedServiceRecord = {
      ...cloneCompletedServiceRecordInput(record),
      id: this.createId(),
    };

    this.records.set(completedRecord.id, completedRecord);
    return cloneCompletedServiceRecord(completedRecord);
  }

  async list(): Promise<CompletedServiceRecord[]> {
    return [...this.records.values()].map(cloneCompletedServiceRecord);
  }

  async findById(id: string): Promise<CompletedServiceRecord | undefined> {
    const record = this.records.get(id);
    return record ? cloneCompletedServiceRecord(record) : undefined;
  }

  async update(id: string, serviceContext: ServiceContext, set: PlanningPlan & { status: "final" }, invalidatedPlanIds: PlanningPlanId[] = []): Promise<CompletedServiceRecord> {
    const existing = this.records.get(id);
    if (!existing) {
      throw new Error(`Completed service record '${id}' was not found.`);
    }

    const updated: CompletedServiceRecord = {
      id: existing.id,
      sourceFinalSetId: existing.sourceFinalSetId,
      completedAt: new Date(existing.completedAt),
      serviceContext: cloneServiceContext(serviceContext),
      set: clonePlanningSet(set),
    };

    this.records.set(id, updated);
    for (const planId of invalidatedPlanIds) await this.planningSets?.demoteFinalToWorking(planId);
    return cloneCompletedServiceRecord(updated);
  }

  async deleteById(id: string): Promise<void> {
    this.records.delete(id);

    if (this.records.size === 0) {
      this.nextId = 1;
    }
  }

  async deleteBySourceFinalSetId(sourceFinalSetId: PlanningPlanId): Promise<void> {
    for (const [id, record] of this.records.entries()) {
      if (record.sourceFinalSetId === sourceFinalSetId) {
        this.records.delete(id);
      }
    }

    if (this.records.size === 0) {
      this.nextId = 1;
    }
  }

  private createId(): string {
    const id = `completed-service-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

function clonePlanningSet<T extends PlanningPlan>(set: T): T {
  return {
    ...set,
    rows: set.rows.map((row) => ({
      ...(row.song ? { song: { ...row.song } } : {}),
      ...(row.note ? { note: row.note } : {}),
    })),
  };
}

function cloneServiceContext(context: ServiceContext): ServiceContext {
  return {
    serviceDate: context.serviceDate,
    serviceTime: normalizeServiceTime(context.serviceTime),
    language: context.language,
    priest: { ...context.priest },
    organist: { ...context.organist },
    ...(context.note?.trim() ? { note: context.note.trim() } : {}),
    ...(context.referenceAntiphon ? { referenceAntiphon: { ...context.referenceAntiphon } } : {}),
    ...(context.referenceTopic ? { referenceTopic: { ...context.referenceTopic } } : {}),
    ...(context.antiphonKey?.trim() ? { antiphonKey: context.antiphonKey.trim() } : {}),
    ...(context.liturgicalSeasonKey?.trim() ? { liturgicalSeasonKey: context.liturgicalSeasonKey.trim() } : {}),
  };
}

function clonePersistedPlanningSet(set: PersistedPlanningPlan): PersistedPlanningPlan {
  return {
    ...clonePlanningSet(set),
    id: set.id,
    serviceContext: cloneServiceContext(set.serviceContext),
    ...(set.completedAt ? { completedAt: new Date(set.completedAt) } : {}),
  };
}

function cloneCompletedServiceRecordInput(
  record: Omit<CompletedServiceRecord, "id">,
): Omit<CompletedServiceRecord, "id"> {
  return {
    sourceFinalSetId: record.sourceFinalSetId,
    set: clonePlanningSet(record.set),
    serviceContext: cloneServiceContext(record.serviceContext),
    completedAt: new Date(record.completedAt),
  };
}

function cloneCompletedServiceRecord(record: CompletedServiceRecord): CompletedServiceRecord {
  return {
    ...cloneCompletedServiceRecordInput(record),
    id: record.id,
  };
}