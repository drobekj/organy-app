import { asc, eq } from "drizzle-orm";
import type * as planningLifecycleSchema from "../../db/schema";
import {
  serviceContexts,
  serviceSetRows,
  serviceSets,
} from "../../db/schema";
import type {
  CompletedServiceRecord,
  CompletedServiceRecordRepository,
  PersistedPlanningSet,
  PlanningSetId,
  PlanningSetRepository,
} from "./ports";
import type { PlanningRow, PlanningSet, ServiceLanguage } from "../../planning-lifecycle";

export type PlanningLifecycleDrizzleSchema = Pick<
  typeof planningLifecycleSchema,
  | "serviceContexts"
  | "serviceSets"
  | "serviceSetRows"
  | "completedServices"
  | "completedServiceRows"
>;

type DrizzleExecutor = {
  select: () => unknown;
  insert: (table: unknown) => unknown;
  update: (table: unknown) => unknown;
  delete: (table: unknown) => unknown;
};

type TransactionalDrizzleExecutor = DrizzleExecutor & {
  transaction: <T>(callback: (tx: DrizzleExecutor) => Promise<T>) => Promise<T>;
};

export type PlanningLifecycleDrizzleAdapterDependencies = {
  db: TransactionalDrizzleExecutor;
  schema?: PlanningLifecycleDrizzleSchema;
};

type ServiceSetRecord = {
  id: number;
  serviceContextId: number;
  status: "working" | "final";
};

type ServiceContextRecord = {
  id: number;
  serviceLanguage: ServiceLanguage;
};

type ServiceSetRowRecord = {
  position: number;
  songLanguage: "czech" | "polish" | null;
  songNumber: string | null;
  note: string | null;
};

export class DrizzlePlanningSetRepository implements PlanningSetRepository {
  constructor(private readonly dependencies: PlanningLifecycleDrizzleAdapterDependencies) {}

  async findById(id: PlanningSetId): Promise<PersistedPlanningSet | undefined> {
    const numericId = parsePlanningSetId(id);
    if (numericId === undefined) {
      return undefined;
    }

    const db = this.dependencies.db;
    const [set] = (await selectAll(db)
      .from(serviceSets)
      .where(eq(serviceSets.id, numericId))
      .limit(1)) as ServiceSetRecord[];

    if (!set) {
      return undefined;
    }

    const [context] = (await selectAll(db)
      .from(serviceContexts)
      .where(eq(serviceContexts.id, set.serviceContextId))
      .limit(1)) as ServiceContextRecord[];

    if (!context) {
      return undefined;
    }

    const rows = (await selectAll(db)
      .from(serviceSetRows)
      .where(eq(serviceSetRows.serviceSetId, set.id))
      .orderBy(asc(serviceSetRows.position))) as ServiceSetRowRecord[];

    return {
      id: formatPlanningSetId(set.id),
      status: set.status,
      language: context.serviceLanguage,
      rows: rows.map(mapRowRecordToPlanningRow),
    };
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
    const numericId = parsePlanningSetId(id);
    if (numericId === undefined) {
      return;
    }

    await deleteFrom(this.dependencies.db, serviceSets).where(eq(serviceSets.id, numericId));
  }

  private async saveSet<TSet extends PlanningSet>(set: TSet, existingId?: PlanningSetId): Promise<PersistedPlanningSet> {
    return this.dependencies.db.transaction(async (tx) => {
      const now = new Date();
      const existingNumericId = existingId ? parsePlanningSetId(existingId) : undefined;

      if (existingId && existingNumericId === undefined) {
        throw new Error(`Planning set id '${existingId}' is not a valid database-backed planning set id.`);
      }

      const serviceSetId = existingNumericId
        ? await updateExistingSet(tx, existingNumericId, set, now)
        : await insertNewSet(tx, set, now);

      await replaceRows(tx, serviceSetId, set.rows, now);

      const persisted = await this.findByIdWithExecutor(tx, serviceSetId);
      if (!persisted) {
        throw new Error(`Planning set '${serviceSetId}' was not found after save.`);
      }

      return persisted;
    });
  }

  private async findByIdWithExecutor(db: DrizzleExecutor, numericId: number): Promise<PersistedPlanningSet | undefined> {
    const [set] = (await selectAll(db)
      .from(serviceSets)
      .where(eq(serviceSets.id, numericId))
      .limit(1)) as ServiceSetRecord[];

    if (!set) {
      return undefined;
    }

    const [context] = (await selectAll(db)
      .from(serviceContexts)
      .where(eq(serviceContexts.id, set.serviceContextId))
      .limit(1)) as ServiceContextRecord[];

    if (!context) {
      return undefined;
    }

    const rows = (await selectAll(db)
      .from(serviceSetRows)
      .where(eq(serviceSetRows.serviceSetId, set.id))
      .orderBy(asc(serviceSetRows.position))) as ServiceSetRowRecord[];

    return {
      id: formatPlanningSetId(set.id),
      status: set.status,
      language: context.serviceLanguage,
      rows: rows.map(mapRowRecordToPlanningRow),
    };
  }
}

export abstract class DrizzleCompletedServiceRecordRepositoryBase
  implements CompletedServiceRecordRepository
{
  protected constructor(protected readonly dependencies: PlanningLifecycleDrizzleAdapterDependencies) {}

  abstract createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord>;

  abstract deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void>;
}

async function insertNewSet(db: DrizzleExecutor, set: PlanningSet, now: Date): Promise<number> {
  const [context] = (await insertInto(db, serviceContexts)
    .values({ serviceLanguage: set.language, createdAt: now, updatedAt: now })
    .returning({ id: serviceContexts.id })) as { id: number }[];

  const [serviceSet] = (await insertInto(db, serviceSets)
    .values({ serviceContextId: context.id, status: set.status, createdAt: now, updatedAt: now })
    .returning({ id: serviceSets.id })) as { id: number }[];

  return serviceSet.id;
}

async function updateExistingSet(db: DrizzleExecutor, id: number, set: PlanningSet, now: Date): Promise<number> {
  const [existing] = (await selectAll(db)
    .from(serviceSets)
    .where(eq(serviceSets.id, id))
    .limit(1)) as ServiceSetRecord[];

  if (!existing) {
    throw new Error(`Planning set '${formatPlanningSetId(id)}' was not found.`);
  }

  await updateTable(db, serviceContexts)
    .set({ serviceLanguage: set.language, updatedAt: now })
    .where(eq(serviceContexts.id, existing.serviceContextId));

  await updateTable(db, serviceSets)
    .set({ status: set.status, updatedAt: now })
    .where(eq(serviceSets.id, id));

  return id;
}

async function replaceRows(db: DrizzleExecutor, serviceSetId: number, rows: PlanningRow[], now: Date): Promise<void> {
  await deleteFrom(db, serviceSetRows).where(eq(serviceSetRows.serviceSetId, serviceSetId));

  if (rows.length === 0) {
    return;
  }

  await insertInto(db, serviceSetRows).values(
    rows.map((row, index) => ({
      serviceSetId,
      position: index + 1,
      songLanguage: row.song?.language,
      songNumber: row.song?.number,
      note: row.note,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

function mapRowRecordToPlanningRow(row: ServiceSetRowRecord): PlanningRow {
  return {
    ...(row.songLanguage && row.songNumber ? { song: { language: row.songLanguage, number: row.songNumber } } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

function parsePlanningSetId(id: PlanningSetId): number | undefined {
  const numericId = Number.parseInt(id, 10);
  return Number.isSafeInteger(numericId) && numericId > 0 && numericId.toString() === id ? numericId : undefined;
}

function formatPlanningSetId(id: number): PlanningSetId {
  return id.toString();
}

function selectAll(db: DrizzleExecutor) {
  return db.select() as ReturnType<typeof serviceSetsSelect>;
}

function insertInto(db: DrizzleExecutor, table: unknown) {
  return db.insert(table) as ReturnType<typeof serviceSetsInsert>;
}

function updateTable(db: DrizzleExecutor, table: unknown) {
  return db.update(table) as ReturnType<typeof serviceSetsUpdate>;
}

function deleteFrom(db: DrizzleExecutor, table: unknown) {
  return db.delete(table) as ReturnType<typeof serviceSetsDelete>;
}

declare function serviceSetsSelect(): {
  from: (table: unknown) => {
    where: (condition: unknown) => { limit: (limit: number) => Promise<unknown[]>; orderBy: (order: unknown) => Promise<unknown[]> };
  };
};

declare function serviceSetsInsert(): {
  values: (value: unknown) => { returning: (fields: unknown) => Promise<unknown[]> } & Promise<unknown[]>;
};

declare function serviceSetsUpdate(): {
  set: (value: unknown) => { where: (condition: unknown) => Promise<unknown[]> };
};

declare function serviceSetsDelete(): {
  where: (condition: unknown) => Promise<unknown[]>;
};
