import { asc, eq } from "drizzle-orm";
import type * as planningLifecycleSchema from "../../db/schema";
import {
  completedServiceRows,
  completedServices,
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
import { PlanningLifecycleService } from "./service";
import { DrizzleCatalogRepository } from "../catalog";
import type { PlanningLifecycleServiceDependencies } from "./service";
import { normalizeServiceTime, type PlanningRow, type PlanningSet, type ServiceContext, type ServiceLanguage } from "../../planning-lifecycle";

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
  serviceDate: string;
  serviceTime: string | null;
  serviceLanguage: ServiceLanguage;
  priestId: string | null;
  priestDisplayName: string;
  organistId: string | null;
  organistDisplayName: string;
};

type ServiceSetRowRecord = {
  position: number;
  songLanguage: "czech" | "polish" | null;
  songId: string | null;
  songNumber: string | null;
  songTitle: string | null;
  note: string | null;
};

type CompletedServiceRecordRecord = {
  id: number;
  serviceSetId: number | null;
  serviceContextId: number;
  completedAt: Date;
};

export class DrizzlePlanningSetRepository implements PlanningSetRepository {
  constructor(private readonly dependencies: PlanningLifecycleDrizzleAdapterDependencies) {}

  async list(): Promise<PersistedPlanningSet[]> {
    const sets = (await selectAll(this.dependencies.db).from(serviceSets).orderBy(asc(serviceSets.id))) as ServiceSetRecord[];
    const loaded = await Promise.all(sets.map((set) => this.findByIdWithExecutor(this.dependencies.db, set.id)));
    return loaded.filter((set): set is PersistedPlanningSet => Boolean(set));
  }

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
      serviceContext: mapContextRecordToServiceContext(context),
      rows: rows.map(mapRowRecordToPlanningRow),
    };
  }

  async saveWorkingSet(
    set: PlanningSet & { status: "working" },
    serviceContext: ServiceContext,
    existingId?: PlanningSetId,
  ): Promise<PersistedPlanningSet> {
    return this.saveSet(set, serviceContext, existingId);
  }

  async saveFinalSet(
    set: PlanningSet & { status: "final" },
    serviceContext: ServiceContext,
    existingId?: PlanningSetId,
  ): Promise<PersistedPlanningSet> {
    return this.saveSet(set, serviceContext, existingId);
  }

  async deleteById(id: PlanningSetId): Promise<void> {
    const numericId = parsePlanningSetId(id);
    if (numericId === undefined) {
      return;
    }

    await this.dependencies.db.transaction(async (tx) => {
      const [set] = (await selectAll(tx)
        .from(serviceSets)
        .where(eq(serviceSets.id, numericId))
        .limit(1)) as ServiceSetRecord[];

      if (!set) {
        return;
      }

      const serviceContextId = set.serviceContextId;
      await deleteFrom(tx, serviceSets).where(eq(serviceSets.id, numericId));

      const completedReferencingContext = (await selectAll(tx)
        .from(completedServices)
        .where(eq(completedServices.serviceContextId, serviceContextId))
        .limit(1)) as CompletedServiceRecordRecord[];

      if (completedReferencingContext.length === 0) {
        await deleteFrom(tx, serviceContexts).where(eq(serviceContexts.id, serviceContextId));
      }
    });
  }

  private async saveSet<TSet extends PlanningSet>(set: TSet, serviceContext: ServiceContext, existingId?: PlanningSetId): Promise<PersistedPlanningSet> {
    return this.dependencies.db.transaction(async (tx) => {
      const now = new Date();
      const existingNumericId = existingId ? parsePlanningSetId(existingId) : undefined;

      if (existingId && existingNumericId === undefined) {
        throw new Error(`Planning set id '${existingId}' is not a valid database-backed planning set id.`);
      }

      const serviceSetId = existingNumericId
        ? await updateExistingSet(tx, existingNumericId, set, serviceContext, now)
        : await insertNewSet(tx, set, serviceContext, now);

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
      serviceContext: mapContextRecordToServiceContext(context),
      rows: rows.map(mapRowRecordToPlanningRow),
    };
  }
}

export class DrizzleCompletedServiceRecordRepository implements CompletedServiceRecordRepository {
  constructor(private readonly dependencies: PlanningLifecycleDrizzleAdapterDependencies) {}

  async createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord> {
    const sourceFinalSetNumericId = parsePlanningSetId(record.sourceFinalSetId);
    if (sourceFinalSetNumericId === undefined) {
      throw new Error(
        `Source final set id '${record.sourceFinalSetId}' is not a valid database-backed planning set id.`,
      );
    }

    return this.dependencies.db.transaction(async (tx) => {
      const now = new Date();
      const [sourceFinalSet] = (await selectAll(tx)
        .from(serviceSets)
        .where(eq(serviceSets.id, sourceFinalSetNumericId))
        .limit(1)) as ServiceSetRecord[];

      if (!sourceFinalSet) {
        throw new Error(`Source final set '${record.sourceFinalSetId}' was not found.`);
      }

      if (sourceFinalSet.status !== "final") {
        throw new Error(`Source planning set '${record.sourceFinalSetId}' is not final.`);
      }

      const [completedService] = (await insertInto(tx, completedServices)
        .values({
          serviceContextId: sourceFinalSet.serviceContextId,
          serviceSetId: sourceFinalSetNumericId,
          completedAt: record.completedAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: completedServices.id,
          serviceSetId: completedServices.serviceSetId,
          serviceContextId: completedServices.serviceContextId,
          completedAt: completedServices.completedAt,
        })) as CompletedServiceRecordRecord[];

      if (record.set.rows.length > 0) {
        await insertInto(tx, completedServiceRows).values(
          record.set.rows.map((row, index) => ({
            completedServiceId: completedService.id,
            position: index + 1,
            songId: row.song?.songId,
            songLanguage: row.song?.language,
            songNumber: row.song?.number,
            songTitle: row.song?.title,
            note: row.note,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      return {
        id: formatCompletedServiceRecordId(completedService.id),
        sourceFinalSetId: record.sourceFinalSetId,
        set: clonePlanningSet(record.set),
        serviceContext: record.serviceContext,
        completedAt: new Date(completedService.completedAt),
      };
    });
  }

  async list(): Promise<CompletedServiceRecord[]> {
    const rows = (await selectAll(this.dependencies.db).from(completedServices).orderBy(asc(completedServices.id))) as CompletedServiceRecordRecord[];
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async findById(id: string): Promise<CompletedServiceRecord | undefined> {
    const numericId = parsePlanningSetId(id);
    if (numericId === undefined) return undefined;
    const [row] = (await selectAll(this.dependencies.db).from(completedServices).where(eq(completedServices.id, numericId)).limit(1)) as CompletedServiceRecordRecord[];
    return row ? this.hydrate(row) : undefined;
  }

  private async hydrate(row: CompletedServiceRecordRecord): Promise<CompletedServiceRecord> {
    return this.hydrateWithExecutor(this.dependencies.db, row);
  }

  private async hydrateWithExecutor(db: DrizzleExecutor, row: CompletedServiceRecordRecord): Promise<CompletedServiceRecord> {
    const [context] = (await selectAll(db).from(serviceContexts).where(eq(serviceContexts.id, row.serviceContextId)).limit(1)) as ServiceContextRecord[];
    const rows = (await selectAll(db).from(completedServiceRows).where(eq(completedServiceRows.completedServiceId, row.id)).orderBy(asc(completedServiceRows.position))) as ServiceSetRowRecord[];
    return { id: formatCompletedServiceRecordId(row.id), sourceFinalSetId: row.serviceSetId ? formatPlanningSetId(row.serviceSetId) : "", set: { status: "final", language: context.serviceLanguage, rows: rows.map(mapRowRecordToPlanningRow) }, serviceContext: mapContextRecordToServiceContext(context), completedAt: new Date(row.completedAt) };
  }

  async update(id: string, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }): Promise<CompletedServiceRecord> {
    const numericId = parsePlanningSetId(id);
    if (numericId === undefined) {
      throw new Error(`Completed service record id '${id}' is not valid.`);
    }

    return this.dependencies.db.transaction(async (tx) => {
      const now = new Date();
      const [existing] = (await selectAll(tx).from(completedServices).where(eq(completedServices.id, numericId)).limit(1)) as CompletedServiceRecordRecord[];
      if (!existing) {
        throw new Error(`Completed service record '${id}' was not found.`);
      }

      await updateTable(tx, serviceContexts)
        .set({ ...mapServiceContextToContextValues(serviceContext), serviceLanguage: set.language, updatedAt: now })
        .where(eq(serviceContexts.id, existing.serviceContextId));
      await updateTable(tx, completedServices).set({ updatedAt: now }).where(eq(completedServices.id, numericId));
      await replaceCompletedRows(tx, numericId, set.rows, now);
      const [updated] = (await selectAll(tx).from(completedServices).where(eq(completedServices.id, numericId)).limit(1)) as CompletedServiceRecordRecord[];
      return this.hydrateWithExecutor(tx, updated);
    });
  }

  async deleteById(id: string): Promise<void> {
    const numericId = parsePlanningSetId(id);
    if (numericId === undefined) return;

    await this.dependencies.db.transaction(async (tx) => {
      const [existing] = (await selectAll(tx).from(completedServices).where(eq(completedServices.id, numericId)).limit(1)) as CompletedServiceRecordRecord[];
      if (!existing) return;
      const serviceContextId = existing.serviceContextId;
      await deleteFrom(tx, completedServices).where(eq(completedServices.id, numericId));

      const activeReferencingContext = (await selectAll(tx).from(serviceSets).where(eq(serviceSets.serviceContextId, serviceContextId)).limit(1)) as ServiceSetRecord[];
      const completedReferencingContext = (await selectAll(tx).from(completedServices).where(eq(completedServices.serviceContextId, serviceContextId)).limit(1)) as CompletedServiceRecordRecord[];
      if (activeReferencingContext.length === 0 && completedReferencingContext.length === 0) {
        await deleteFrom(tx, serviceContexts).where(eq(serviceContexts.id, serviceContextId));
      }
    });
  }

  async deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void> {
    const numericId = parsePlanningSetId(sourceFinalSetId);
    if (numericId === undefined) {
      return;
    }

    await deleteFrom(this.dependencies.db, completedServices).where(eq(completedServices.serviceSetId, numericId));
  }
}

export function createDbBackedPlanningLifecycleService(
  dependencies: PlanningLifecycleDrizzleAdapterDependencies & Partial<Pick<PlanningLifecycleServiceDependencies, "now">>,
): PlanningLifecycleService {
  return new PlanningLifecycleService({
    planningSets: new DrizzlePlanningSetRepository(dependencies),
    completedServiceRecords: new DrizzleCompletedServiceRecordRepository(dependencies),
    catalog: new DrizzleCatalogRepository(dependencies.db),
    now: dependencies.now,
  });
}

async function insertNewSet(db: DrizzleExecutor, set: PlanningSet, serviceContext: ServiceContext, now: Date): Promise<number> {
  const [context] = (await insertInto(db, serviceContexts)
    .values({ ...mapServiceContextToContextValues(serviceContext), serviceLanguage: set.language, createdAt: now, updatedAt: now })
    .returning({ id: serviceContexts.id })) as { id: number }[];

  const [serviceSet] = (await insertInto(db, serviceSets)
    .values({ serviceContextId: context.id, status: set.status, createdAt: now, updatedAt: now })
    .returning({ id: serviceSets.id })) as { id: number }[];

  return serviceSet.id;
}

async function updateExistingSet(db: DrizzleExecutor, id: number, set: PlanningSet, serviceContext: ServiceContext, now: Date): Promise<number> {
  const [existing] = (await selectAll(db)
    .from(serviceSets)
    .where(eq(serviceSets.id, id))
    .limit(1)) as ServiceSetRecord[];

  if (!existing) {
    throw new Error(`Planning set '${formatPlanningSetId(id)}' was not found.`);
  }

  await updateTable(db, serviceContexts)
    .set({ ...mapServiceContextToContextValues(serviceContext), serviceLanguage: set.language, updatedAt: now })
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
      songId: row.song?.songId,
      songLanguage: row.song?.language,
      songNumber: row.song?.number,
      songTitle: row.song?.title,
      note: row.note,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

async function replaceCompletedRows(db: DrizzleExecutor, completedServiceId: number, rows: PlanningRow[], now: Date): Promise<void> {
  await deleteFrom(db, completedServiceRows).where(eq(completedServiceRows.completedServiceId, completedServiceId));

  if (rows.length === 0) {
    return;
  }

  await insertInto(db, completedServiceRows).values(
    rows.map((row, index) => ({
      completedServiceId,
      position: index + 1,
      songId: row.song?.songId,
      songLanguage: row.song?.language,
      songNumber: row.song?.number,
      songTitle: row.song?.title,
      note: row.note,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

function mapContextRecordToServiceContext(context: ServiceContextRecord): ServiceContext {
  return {
    serviceDate: context.serviceDate,
    serviceTime: context.serviceTime ? normalizeServiceTime(context.serviceTime) : "",
    language: context.serviceLanguage,
    priest: { ...(context.priestId ? { id: context.priestId } : {}), displayName: context.priestDisplayName },
    organist: { ...(context.organistId ? { id: context.organistId } : {}), displayName: context.organistDisplayName },
  };
}

function mapServiceContextToContextValues(context: ServiceContext) {
  return {
    serviceDate: context.serviceDate,
    serviceTime: normalizeServiceTime(context.serviceTime),
    priestId: context.priest.id,
    priestDisplayName: context.priest.displayName,
    organistId: context.organist.id,
    organistDisplayName: context.organist.displayName,
  };
}

function mapRowRecordToPlanningRow(row: ServiceSetRowRecord): PlanningRow {
  return {
    ...(row.songLanguage && row.songNumber ? { song: { ...(row.songId ? { songId: row.songId } : {}), language: row.songLanguage, number: row.songNumber, ...(row.songTitle ? { title: row.songTitle } : {}) } } : {}),
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

function formatCompletedServiceRecordId(id: number): string {
  return id.toString();
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
    orderBy: (order: unknown) => Promise<unknown[]>;
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
