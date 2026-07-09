import type {
  CompletedServiceRecord,
  CompletedServiceRecordRepository,
  PersistedPlanningSet,
  PlanningSetId,
  PlanningSetRepository,
} from "./ports";
import type { PlanningSet } from "../../planning-lifecycle";

export class InMemoryPlanningSetRepository implements PlanningSetRepository {
  private readonly sets = new Map<PlanningSetId, PersistedPlanningSet>();
  private nextId = 1;

  async findById(id: PlanningSetId): Promise<PersistedPlanningSet | undefined> {
    const set = this.sets.get(id);
    return set ? clonePersistedPlanningSet(set) : undefined;
  }

  async saveWorkingSet(
    set: PlanningSet & { status: "working" },
    existingId?: PlanningSetId,
  ): Promise<PersistedPlanningSet> {
    return this.saveSet(set, existingId);
  }

  async saveFinalSet(
    set: PlanningSet & { status: "final" },
    existingId?: PlanningSetId,
  ): Promise<PersistedPlanningSet> {
    return this.saveSet(set, existingId);
  }

  async deleteById(id: PlanningSetId): Promise<void> {
    this.sets.delete(id);

    if (this.sets.size === 0) {
      this.nextId = 1;
    }
  }

  private saveSet(set: PlanningSet, existingId?: PlanningSetId): PersistedPlanningSet {
    const id = existingId ?? this.createId("planning-set");
    const persistedSet: PersistedPlanningSet = {
      ...clonePlanningSet(set),
      id,
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

  async createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord> {
    const completedRecord: CompletedServiceRecord = {
      ...cloneCompletedServiceRecordInput(record),
      id: this.createId(),
    };

    this.records.set(completedRecord.id, completedRecord);
    return cloneCompletedServiceRecord(completedRecord);
  }

  async deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void> {
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

function clonePlanningSet<T extends PlanningSet>(set: T): T {
  return {
    ...set,
    rows: set.rows.map((row) => ({
      ...(row.song ? { song: { ...row.song } } : {}),
      ...(row.note ? { note: row.note } : {}),
    })),
  };
}

function clonePersistedPlanningSet(set: PersistedPlanningSet): PersistedPlanningSet {
  return {
    ...clonePlanningSet(set),
    id: set.id,
    ...(set.completedAt ? { completedAt: new Date(set.completedAt) } : {}),
  };
}

function cloneCompletedServiceRecordInput(
  record: Omit<CompletedServiceRecord, "id">,
): Omit<CompletedServiceRecord, "id"> {
  return {
    sourceFinalSetId: record.sourceFinalSetId,
    set: clonePlanningSet(record.set),
    completedAt: new Date(record.completedAt),
  };
}

function cloneCompletedServiceRecord(record: CompletedServiceRecord): CompletedServiceRecord {
  return {
    ...cloneCompletedServiceRecordInput(record),
    id: record.id,
  };
}
