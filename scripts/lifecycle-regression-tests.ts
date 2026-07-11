import assert from "node:assert/strict";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
  type CompletedServiceRecord,
  type CompletedServiceRecordRepository,
  type PlanningSetId,
} from "../src/application/planning-lifecycle";
import type { PlanningSet, ServiceContext } from "../src/planning-lifecycle";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const fixedNow = new Date("2026-07-11T09:30:00.000Z");

const mixedContext = {
  serviceDate: "2026-07-11",
  serviceTime: "09:00",
  language: "mixed",
  priest: { id: "priest-1", displayName: "Confirmed Priest" },
  organist: { id: "organist-1", displayName: "Confirmed Organist" },
} satisfies ServiceContext;

const czechContext = {
  serviceDate: "2026-07-13",
  serviceTime: "10:00",
  language: "czech",
  priest: { id: "priest-2", displayName: "Second Priest" },
  organist: { id: "organist-2", displayName: "Second Organist" },
} satisfies ServiceContext;

const workingSet = {
  status: "working",
  language: "mixed",
  rows: [
    { song: { language: "czech", number: "101" }, note: "Entrance" },
    { note: "Note-only row is valid" },
  ],
} satisfies PlanningSet & { status: "working" };

const updatedWorkingSet = {
  status: "working",
  language: "mixed",
  rows: [
    { note: "Updated note-only row" },
    { song: { language: "polish", number: "202" } },
  ],
} satisfies PlanningSet & { status: "working" };

const secondWorkingSet = {
  status: "working",
  language: "czech",
  rows: [{ note: "Independent second working set" }],
} satisfies PlanningSet & { status: "working" };

const finalSet = {
  status: "final",
  language: "mixed",
  rows: workingSet.rows,
} satisfies PlanningSet & { status: "final" };

const tests: TestCase[] = [

  {
    name: "service identity requires service time, rejects duplicate date/time, and allows editing the same set",
    async run() {
      const { service } = createService();
      const missingTime = await service.saveWorkingSet({ role: "admin", serviceContext: { ...mixedContext, serviceTime: "" }, set: workingSet });
      assert.equal(missingTime.success, false);

      const first = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      assert.equal(first.success, true);
      const duplicate = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      assert.equal(duplicate.success, false);
      assert.match(duplicate.success ? "" : duplicate.error.message, /2026-07-11 at 09:00/);

      const ownEdit = await service.saveWorkingSet({
        role: "admin",
        existingSetId: first.success ? first.value.id : "missing",
        serviceContext: mixedContext,
        set: updatedWorkingSet,
      });
      assert.equal(ownEdit.success, true);
    },
  },
  {
    name: "complete rejects future services and allows today and past in Europe/Prague",
    async run() {
      const { service } = createService();
      const futureSaved = await service.saveWorkingSet({ role: "admin", serviceContext: { ...mixedContext, serviceDate: "2026-07-12" }, set: workingSet });
      assert.equal(futureSaved.success, true);
      const futureFinal = await service.finalizeWorkingSet({ role: "admin", workingSetId: futureSaved.success ? futureSaved.value.id : "missing" });
      assert.equal(futureFinal.success, true);
      const futureComplete = await service.completeFinalSet({ role: "admin", finalSetId: futureFinal.success ? futureFinal.value.id : "missing" });
      assert.equal(futureComplete.success, false);

      const todayContext = { ...mixedContext, serviceDate: "2026-07-11", serviceTime: "11:00" } satisfies ServiceContext;
      const pastContext = { ...mixedContext, serviceDate: "2026-07-10", serviceTime: "12:00" } satisfies ServiceContext;
      for (const context of [todayContext, pastContext]) {
        const saved = await service.saveWorkingSet({ role: "admin", serviceContext: context, set: workingSet });
        assert.equal(saved.success, true);
        const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.success ? saved.value.id : "missing" });
        assert.equal(finalized.success, true);
        const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
        assert.equal(completed.success, true);
      }
    },
  },
  {
    name: "completed records remain separate from active sets and keep service context",
    async run() {
      const { service } = createService();
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext: { ...mixedContext, serviceDate: "2026-07-10" }, set: workingSet });
      assert.equal(saved.success, true);
      const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.success ? saved.value.id : "missing" });
      assert.equal(finalized.success, true);
      const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
      assert.equal(completed.success, true);
      const active = await service.listPlanningSets();
      const records = await service.listCompletedRecords();
      assert.equal(active.success && active.value.some((set) => set.id === (saved.success ? saved.value.id : "")), false);
      assert.equal(records.success && records.value.length, 1);
      assert.equal(records.success ? records.value[0]?.serviceContext.serviceTime : undefined, "09:00");
    },
  },  {
    name: "repository saves, loads, lists, updates, preserves row order and service context, deletes, and isolates multiple sets",
    async run() {
      const repository = new InMemoryPlanningSetRepository();
      const saved = await repository.saveWorkingSet(workingSet, mixedContext);

      assert.equal(saved.id, "planning-set-1");
      assert.deepEqual(saved.serviceContext, mixedContext);

      const loaded = await repository.findById(saved.id);
      assert.deepEqual(loaded, saved);

      const second = await repository.saveWorkingSet(secondWorkingSet, czechContext);
      assert.equal(second.id, "planning-set-2");
      assert.deepEqual((await repository.list()).map((set) => set.id), [saved.id, second.id]);

      const updated = await repository.saveWorkingSet(updatedWorkingSet, mixedContext, saved.id);
      assert.equal(updated.id, saved.id);
      assert.deepEqual(updated.rows, updatedWorkingSet.rows);
      assert.deepEqual(updated.serviceContext, mixedContext);

      const stillSecond = await repository.findById(second.id);
      assert.deepEqual(stillSecond?.rows, secondWorkingSet.rows);

      await repository.deleteById(saved.id);
      assert.equal(await repository.findById(saved.id), undefined);
      assert.notEqual(await repository.findById(second.id), undefined);
    },
  },
  {
    name: "service creates and updates working sets with required service context and row validation",
    async run() {
      const { service } = createService();

      const missingContext = await service.saveWorkingSet({
        role: "admin",
        serviceContext: { ...mixedContext, priest: { displayName: " " } },
        set: workingSet,
      });
      assert.equal(missingContext.success, false);
      assert.equal(missingContext.success ? undefined : missingContext.error.code, "invalidInput");

      const invalidRow = await service.saveWorkingSet({
        role: "admin",
        serviceContext: mixedContext,
        set: { ...workingSet, rows: [{}] },
      });
      assert.equal(invalidRow.success, false);
      assert.equal(invalidRow.success ? undefined : invalidRow.error.code, "invalidInput");

      const saved = await service.saveWorkingSet({ role: "organist", serviceContext: mixedContext, set: workingSet });
      assert.equal(saved.success, true);

      const updated = await service.saveWorkingSet({
        role: "priest",
        existingSetId: saved.success ? saved.value.id : "missing",
        serviceContext: mixedContext,
        set: updatedWorkingSet,
      });
      assert.equal(updated.success, true);
      assert.deepEqual(updated.success ? updated.value.rows : [], updatedWorkingSet.rows);
    },
  },
  {
    name: "service finalizes, completes with injected time, deletes, cleans completed records, and keeps independent sets isolated",
    async run() {
      const { service, planningSets, completedRecords } = createService();
      const savedFirst = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      const savedSecond = await service.saveWorkingSet({ role: "admin", serviceContext: czechContext, set: secondWorkingSet });
      assert.equal(savedFirst.success, true);
      assert.equal(savedSecond.success, true);

      const finalized = await service.finalizeWorkingSet({ role: "priest", workingSetId: savedFirst.success ? savedFirst.value.id : "missing" });
      assert.equal(finalized.success, true);
      assert.equal(finalized.success ? finalized.value.status : undefined, "final");

      const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
      assert.equal(completed.success, true);
      assert.deepEqual(completed.success ? completed.value.completedAt : undefined, fixedNow);
      assert.equal(await planningSets.findById(finalized.success ? finalized.value.id : "missing"), undefined);
      assert.notEqual(await planningSets.findById(savedSecond.success ? savedSecond.value.id : "missing"), undefined);

      const finalForDelete = await planningSets.saveFinalSet(finalSet, mixedContext);
      await completedRecords.createFromFinalSet({ sourceFinalSetId: finalForDelete.id, set: finalSet, serviceContext: mixedContext, completedAt: fixedNow });
      assert.equal(completedRecords.countBySourceFinalSetId(finalForDelete.id), 1);

      const deleted = await service.deletePlanningSet({ role: "admin", setId: finalForDelete.id });
      assert.equal(deleted.success, true);
      assert.equal(await planningSets.findById(finalForDelete.id), undefined);
      assert.equal(completedRecords.countBySourceFinalSetId(finalForDelete.id), 0);
    },
  },
  {
    name: "service enforces role permissions in the application layer",
    async run() {
      const { service } = createService();
      const deniedCreate = await service.saveWorkingSet({ role: "congregationMember", serviceContext: mixedContext, set: workingSet });
      assert.equal(deniedCreate.success, false);
      assert.equal(deniedCreate.success ? undefined : deniedCreate.error.code, "permissionDenied");

      const saved = await service.saveWorkingSet({ role: "organist", serviceContext: mixedContext, set: workingSet });
      assert.equal(saved.success, true);

      const deniedFinalize = await service.finalizeWorkingSet({ role: "organist", workingSetId: saved.success ? saved.value.id : "missing" });
      assert.equal(deniedFinalize.success, false);
      assert.equal(deniedFinalize.success ? undefined : deniedFinalize.error.code, "permissionDenied");

      const finalized = await service.finalizeWorkingSet({ role: "priest", workingSetId: saved.success ? saved.value.id : "missing" });
      assert.equal(finalized.success, true);

      const deniedComplete = await service.completeFinalSet({ role: "organist", finalSetId: finalized.success ? finalized.value.id : "missing" });
      assert.equal(deniedComplete.success, false);
      assert.equal(deniedComplete.success ? undefined : deniedComplete.error.code, "permissionDenied");
    },
  },
];

async function main() {
  for (const test of tests) {
    await test.run();
    console.log(`✓ ${test.name}`);
  }

  console.log(`Lifecycle regression tests passed (${tests.length} test groups).`);
}

function createService() {
  const planningSets = new InMemoryPlanningSetRepository();
  const completedRecords = new InspectableCompletedServiceRecordRepository();
  return {
    planningSets,
    completedRecords,
    service: new PlanningLifecycleService({ planningSets, completedServiceRecords: completedRecords, now: () => fixedNow }),
  };
}

class InspectableCompletedServiceRecordRepository implements CompletedServiceRecordRepository {
  private readonly delegate = new InMemoryCompletedServiceRecordRepository();
  private readonly records = new Map<string, CompletedServiceRecord>();

  async createFromFinalSet(record: Omit<CompletedServiceRecord, "id">): Promise<CompletedServiceRecord> {
    const created = await this.delegate.createFromFinalSet(record);
    this.records.set(created.id, created);
    return created;
  }

  async list(): Promise<CompletedServiceRecord[]> {
    return [...this.records.values()];
  }

  async findById(id: string): Promise<CompletedServiceRecord | undefined> {
    return this.records.get(id);
  }

  async deleteBySourceFinalSetId(sourceFinalSetId: PlanningSetId): Promise<void> {
    await this.delegate.deleteBySourceFinalSetId(sourceFinalSetId);

    for (const [id, record] of this.records.entries()) {
      if (record.sourceFinalSetId === sourceFinalSetId) {
        this.records.delete(id);
      }
    }
  }

  countBySourceFinalSetId(sourceFinalSetId: PlanningSetId): number {
    return [...this.records.values()].filter((record) => record.sourceFinalSetId === sourceFinalSetId).length;
  }
}

void main().catch((error: unknown) => {
  console.error("Lifecycle regression tests failed.");
  console.error(error);
  process.exitCode = 1;
});
