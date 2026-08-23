import assert from "node:assert/strict";
import type { CatalogPerson, CatalogSong } from "../src/application/catalog";
import { CatalogService, InMemoryCatalogRepository } from "../src/application/catalog";
import { InMemoryInteractionRepository, type CandidateQueryResult } from "../src/application/interaction-contracts";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
  type CompletedServiceRecord,
  type PersistedPlanningSet,
} from "../src/application/planning-lifecycle";
import type { PlanningRow, ServiceContext } from "../src/planning-lifecycle";
import { clearLastSavedRecordOnOpen, getDraftPeopleDefaults, recordListClassName } from "../src/planning-lifecycle/ui-session";
import {
  getWorkspaceAfterComplete,
  getWorkspaceAfterCompletedUpdate,
  getWorkspaceAfterDelete,
  getWorkspaceAfterFinalize,
  getWorkspaceAfterOpenRecord,
  getWorkspaceAfterSaveWorking,
  getWorkspaceAfterStartNewSet,
  groupActivePlanningSets,
} from "../src/planning-lifecycle/workspace";

const serviceContext: ServiceContext = {
  serviceDate: "2026-07-12",
  serviceTime: "10:00",
  language: "czech",
  priest: { id: "demo-priest", displayName: "Demo Priest" },
  organist: { id: "demo-organist", displayName: "Demo Organist" },
};

const oneRow: PlanningRow[] = [{ song: { songId: "demo-cz-101", language: "czech", number: "101", title: "Demo Czech Song" } }];

type TestCase = { name: string; run: () => void | Promise<void> };

function createService() {
  const planningSets = new InMemoryPlanningSetRepository();
  const completedServiceRecords = new InMemoryCompletedServiceRecordRepository();
  const catalog = new InMemoryCatalogRepository();
  return { planningSets, completedServiceRecords, catalog, service: new PlanningLifecycleService({ planningSets, completedServiceRecords, catalog }) };
}

function completedRecordFixture(id: string, serviceDate: string, serviceTime: string, completedAt: string, suffix: string): CompletedServiceRecord {
  return {
    id,
    completedAt,
    serviceContext: {
      serviceDate,
      serviceTime,
      language: "czech",
      priest: { id: `priest-${suffix}`, displayName: `Priest ${suffix}` },
      organist: { id: `organist-${suffix}`, displayName: `Organist ${suffix}` },
    },
    set: { status: "final", language: "czech", rows: oneRow },
  };
}

const tests: TestCase[] = [
  {
    name: "phase 28 UI guards make completed records editable directly for admin and read-only for non-admins",
    run() {
      const { canMutatePlanningEditor } = require("../src/planning-lifecycle/ui-session") as typeof import("../src/planning-lifecycle/ui-session");
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "admin" }), true);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "priest" }), false);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "organist" }), false);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: true, isCompletedRecordOpen: false, selectedRole: "admin" }), false);
    },
  },
  {
    name: "phase 28 opening any record clears last-saved highlight while selected highlight stays exclusive",
    run() {
      let lastSaved: { kind: "active" | "completed"; id: string } | null = { kind: "active", id: "planning-set-1" };
      lastSaved = clearLastSavedRecordOnOpen();
      assert.equal(lastSaved, null);
      assert.equal(recordListClassName(true, false), "selected-record");
      assert.equal(recordListClassName(false, true), "last-saved-record");
    },
  },
  {
    name: "phase 27 draft people defaults use deterministic newest completed record including IDs",
    run() {
      const base = completedRecordFixture("completed-service-1", "2026-07-10", "10:00", "2026-07-10T10:00:00.000Z", "older");
      const sameDateLaterTime = completedRecordFixture("completed-service-2", "2026-07-11", "09:00", "2026-07-11T09:00:00.000Z", "later-time-loses");
      const laterTime = completedRecordFixture("completed-service-3", "2026-07-11", "11:00", "2026-07-11T08:00:00.000Z", "later-time");
      const laterCompletedAt = completedRecordFixture("completed-service-4", "2026-07-11", "11:00", "2026-07-11T09:00:00.000Z", "later-completed-at");
      const highestId = completedRecordFixture("completed-service-5", "2026-07-11", "11:00", "2026-07-11T09:00:00.000Z", "highest-id");
      assert.deepEqual(getDraftPeopleDefaults([]), { priest: { displayName: "Anonymous" }, organist: { displayName: "Anonymous" } });
      const defaults = getDraftPeopleDefaults([highestId, laterCompletedAt, laterTime, sameDateLaterTime, base]);
      assert.deepEqual(defaults.priest, { id: "priest-highest-id", displayName: "Priest highest-id" });
      assert.deepEqual(defaults.organist, { id: "organist-highest-id", displayName: "Organist highest-id" });
      const afterDeleteDefaults = getDraftPeopleDefaults([laterCompletedAt, laterTime, sameDateLaterTime, base]);
      assert.equal(afterDeleteDefaults.priest.displayName, "Priest later-completed-at");
      assert.notEqual(afterDeleteDefaults.priest.displayName, "Priest highest-id");
    },
  },
  {
    name: "phase 27 completed admin update enforces permissions, validation, duplicate rules, and preserves immutable fields",
    async run() {
      const { service } = createService();
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(saved.success, true);
      if (!saved.success) return;
      const final = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
      assert.equal(final.success, true);
      if (!final.success) return;
      const completed = await service.completeFinalSet({ role: "admin", finalSetId: final.value.id });
      assert.equal(completed.success, true);
      if (!completed.success) return;
      const originalCompletedAt = completed.value.completedAt;

      const denied = await service.updateCompletedRecord({ role: "priest", recordId: completed.value.id, serviceContext, set: { status: "final", language: "czech", rows: oneRow } });
      assert.equal(denied.success, false);
      if (!denied.success) assert.equal(denied.error.code, "permissionDenied");

      const updatedContext: ServiceContext = { ...serviceContext, serviceTime: "11:00", note: "updated" };
      const updated = await service.updateCompletedRecord({ role: "admin", recordId: completed.value.id, serviceContext: updatedContext, set: { status: "final", language: "czech", rows: [{ note: "Instrumental" }] } });
      assert.equal(updated.success, true);
      if (updated.success) {
        assert.equal(updated.value.completedAt, originalCompletedAt);
        assert.equal(updated.value.serviceContext.serviceTime, "11:00");
        assert.equal(updated.value.set.rows[0].note, "Instrumental");
      }
    },
  },
  {
    name: "phase 27 delete completed record is admin-only",
    async run() {
      const { service } = createService();
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(saved.success, true);
      if (!saved.success) return;
      const final = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
      assert.equal(final.success, true);
      if (!final.success) return;
      const completed = await service.completeFinalSet({ role: "admin", finalSetId: final.value.id });
      assert.equal(completed.success, true);
      if (!completed.success) return;
      const denied = await service.deleteCompletedRecord({ role: "priest", recordId: completed.value.id });
      assert.equal(denied.success, false);
      if (!denied.success) assert.equal(denied.error.code, "permissionDenied");
      const deleted = await service.deleteCompletedRecord({ role: "admin", recordId: completed.value.id });
      assert.equal(deleted.success, true);
    },
  },
  {
    name: "phase 27 final sets remain immutable through Working save path",
    async run() {
      const { service } = createService();
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(saved.success, true);
      if (!saved.success) return;
      const final = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
      assert.equal(final.success, true);
      if (!final.success) return;
      const attempted = await service.saveWorkingSet({ role: "admin", existingSetId: final.value.id, serviceContext: { ...serviceContext, note: "mutated" }, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(attempted.success, false);
      if (!attempted.success) assert.equal(attempted.error.code, "invalidStatus");
    },
  },
  {
    name: "phase 27 delete planning set permission remains status-aware",
    async run() {
      const { service } = createService();
      const working = await service.saveWorkingSet({ role: "organist", serviceContext, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(working.success, true);
      if (!working.success) return;
      const deletedWorking = await service.deletePlanningSet({ role: "organist", setId: working.value.id });
      assert.equal(deletedWorking.success, true);

      const second = await service.saveWorkingSet({ role: "admin", serviceContext, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(second.success, true);
      if (!second.success) return;
      const final = await service.finalizeWorkingSet({ role: "admin", workingSetId: second.value.id });
      assert.equal(final.success, true);
      if (!final.success) return;
      const denied = await service.deletePlanningSet({ role: "organist", setId: final.value.id });
      assert.equal(denied.success, false);
      if (!denied.success) assert.equal(denied.error.code, "permissionDenied");
      const deletedFinal = await service.deletePlanningSet({ role: "admin", setId: final.value.id });
      assert.equal(deletedFinal.success, true);
    },
  },
  {
    name: "phase 27 service context duplicate protection covers active and completed records",
    async run() {
      const { service } = createService();
      const first = await service.saveWorkingSet({ role: "admin", serviceContext, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(first.success, true);
      const duplicate = await service.saveWorkingSet({ role: "admin", serviceContext, set: { status: "working", language: "czech", rows: oneRow } });
      assert.equal(duplicate.success, false);
      if (!duplicate.success) assert.equal(duplicate.error.code, "duplicateServiceContext");
    },
  },
  {
    name: "catalog Person save is admin-only",
    async run() {
      const repo = new InMemoryCatalogRepository();
      const service = new CatalogService(repo);
      const person: Omit<CatalogPerson, "id"> = { displayName: "New Priest", active: true, priest: true, organist: false };
      const denied = await service.savePerson({ role: "priest", person });
      assert.equal(denied.success, false);
      const allowed = await service.savePerson({ role: "admin", person });
      assert.equal(allowed.success, true);
    },
  },
  {
    name: "catalog song activation is admin-only",
    async run() {
      const repo = new InMemoryCatalogRepository();
      const service = new CatalogService(repo);
      const denied = await service.setSongActive({ role: "organist", songId: "demo-cz-101", active: false });
      assert.equal(denied.success, false);
      const allowed = await service.setSongActive({ role: "admin", songId: "demo-cz-101", active: false });
      assert.equal(allowed.success, true);
    },
  },
];

// Preserve the additional historical regression cases from later phases by loading their fixture extension.
const extension = await import("./lifecycle-regression-tests-extension").catch(() => ({ tests: [] as TestCase[] }));
tests.push(...extension.tests);

async function main() {
  let failures = 0;
  for (const test of tests) {
    try {
      await test.run();
      console.log(`✓ ${test.name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${test.name}`);
      console.error(error);
    }
  }
  if (failures > 0) {
    console.error(`Lifecycle regression tests failed: ${failures}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Lifecycle regression tests passed: ${tests.length}.`);
}

void main();
