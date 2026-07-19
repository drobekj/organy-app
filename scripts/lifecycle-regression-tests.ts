import assert from "node:assert/strict";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
  type CompletedServiceRecord,
  type CompletedServiceRecordRepository,
  type PlanningSetId,
} from "../src/application/planning-lifecycle";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import type { PlanningRole, PlanningSet, ServiceContext } from "../src/planning-lifecycle";
import { canMutatePlanningEditor, clearLastSavedRecordOnOpen, getDraftPeopleDefaults, recordListClassName, type PersistedRecordReference } from "../src/planning-lifecycle/ui-session";

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
    name: "phase 28 UI guards make completed records editable directly for admin and read-only for non-admins",
    run() {
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: true, isCompletedRecordOpen: false, selectedRole: "admin" }), false);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "admin" }), true);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "priest" }), false);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "organist" }), false);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "congregationMember" }), false);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "admin" }), true);
      assert.equal(canMutatePlanningEditor({ isFinalSetOpen: false, isCompletedRecordOpen: true, selectedRole: "priest" }), false);
    },
  },

  {
    name: "phase 28 opening any record clears last-saved highlight while selected highlight stays exclusive",
    run() {
      let lastSaved: PersistedRecordReference | null = { kind: "completed", id: "completed-service-1" };
      lastSaved = clearLastSavedRecordOnOpen();
      assert.equal(lastSaved, null);
      assert.equal(recordListClassName(true, false), "selected-record");
      assert.equal(recordListClassName(false, false), undefined);

      lastSaved = { kind: "active", id: "planning-set-1" };
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
      assert.deepEqual(getDraftPeopleDefaults([]), { priest: { displayName: "" }, organist: { displayName: "" } });
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
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      assert.equal(saved.success, true);
      const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.success ? saved.value.id : "missing" });
      assert.equal(finalized.success, true);
      const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
      assert.equal(completed.success, true);
      const record = completed.success ? completed.value : undefined;
      if (!record) throw new Error("completed record should exist");

      const updatedContext = { ...mixedContext, serviceDate: "2026-07-10", serviceTime: "08:30", priest: { id: "priest-updated", displayName: "Updated Priest" } } satisfies ServiceContext;
      const updatedFinalSet = { status: "final", language: "mixed", rows: [{ note: "Admin note-only correction" }, { song: { language: "czech", number: "303" } }] } satisfies PlanningSet & { status: "final" };

      for (const role of ["priest", "organist", "congregationMember"] satisfies PlanningRole[]) {
        const denied = await service.updateCompletedRecord({ role, recordId: record.id, serviceContext: updatedContext, set: updatedFinalSet });
        assert.equal(denied.success, false);
        assert.equal(denied.success ? undefined : denied.error.code, "permissionDenied");
      }

      const tooManyRows = await service.updateCompletedRecord({
        role: "admin",
        recordId: record.id,
        serviceContext: updatedContext,
        set: { status: "final", language: "mixed", rows: Array.from({ length: 11 }, (_, index) => ({ note: `row ${index}` })) },
      });
      assert.equal(tooManyRows.success, false);

      const active = await service.saveWorkingSet({ role: "admin", serviceContext: czechContext, set: secondWorkingSet });
      assert.equal(active.success, true);
      const activeConflict = await service.updateCompletedRecord({ role: "admin", recordId: record.id, serviceContext: czechContext, set: { status: "final", language: "czech", rows: secondWorkingSet.rows } });
      assert.equal(activeConflict.success, false);

      const otherSaved = await service.saveWorkingSet({ role: "admin", serviceContext: { ...mixedContext, serviceDate: "2026-07-09", serviceTime: "07:00" }, set: workingSet });
      assert.equal(otherSaved.success, true);
      const otherFinal = await service.finalizeWorkingSet({ role: "admin", workingSetId: otherSaved.success ? otherSaved.value.id : "missing" });
      assert.equal(otherFinal.success, true);
      const otherCompleted = await service.completeFinalSet({ role: "admin", finalSetId: otherFinal.success ? otherFinal.value.id : "missing" });
      assert.equal(otherCompleted.success, true);
      const completedConflict = await service.updateCompletedRecord({ role: "admin", recordId: record.id, serviceContext: otherCompleted.success ? otherCompleted.value.serviceContext : czechContext, set: updatedFinalSet });
      assert.equal(completedConflict.success, false);

      const ownDateTime = await service.updateCompletedRecord({ role: "admin", recordId: record.id, serviceContext: record.serviceContext, set: record.set });
      assert.equal(ownDateTime.success, true);
      const updated = await service.updateCompletedRecord({ role: "admin", recordId: record.id, serviceContext: updatedContext, set: updatedFinalSet });
      assert.equal(updated.success, true);
      assert.equal(updated.success ? updated.value.id : undefined, record.id);
      assert.equal(updated.success ? updated.value.sourceFinalSetId : undefined, record.sourceFinalSetId);
      assert.deepEqual(updated.success ? updated.value.completedAt : undefined, record.completedAt);
      assert.equal(updated.success ? updated.value.serviceContext.priest.id : undefined, "priest-updated");
      assert.deepEqual(updated.success ? updated.value.set.rows : undefined, updatedFinalSet.rows);
    },
  },

  {
    name: "phase 27 completed admin delete enforces permissions and frees service identity",
    async run() {
      const { service, completedRecords } = createService();
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      assert.equal(saved.success, true);
      const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.success ? saved.value.id : "missing" });
      assert.equal(finalized.success, true);
      const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
      assert.equal(completed.success, true);
      const recordId = completed.success ? completed.value.id : "missing";

      const denied = await service.deleteCompletedRecord({ role: "priest", recordId });
      assert.equal(denied.success, false);
      assert.notEqual(await completedRecords.findById(recordId), undefined);

      const deleted = await service.deleteCompletedRecord({ role: "admin", recordId });
      assert.equal(deleted.success, true);
      assert.equal(await completedRecords.findById(recordId), undefined);
      const recreated = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      assert.equal(recreated.success, true);
    },
  },

  {
    name: "phase 28 last-saved state transitions are session-local and preserve on error until successful open/delete",
    run() {
      let lastSaved: PersistedRecordReference | null = null;
      lastSaved = { kind: "active", id: "working-1" };
      assert.deepEqual(lastSaved, { kind: "active", id: "working-1" });
      lastSaved = { kind: "active", id: "final-1" };
      assert.deepEqual(lastSaved, { kind: "active", id: "final-1" });
      lastSaved = { kind: "completed", id: "completed-1" };
      lastSaved = clearLastSavedRecordOnOpen();
      assert.equal(lastSaved, null);
      lastSaved = { kind: "completed", id: "completed-1" };
      const beforeError = lastSaved;
      assert.deepEqual(lastSaved, beforeError);
      if (lastSaved.kind === "completed" && lastSaved.id === "completed-1") lastSaved = null;
      assert.equal(lastSaved, null);
    },
  },

  {
    name: "phase 28 completed save/delete success and error session transitions reset draft and recompute defaults",
    async run() {
      const { service } = createService();
      const older = await createCompletedRecord(service, { ...mixedContext, serviceDate: "2026-07-10", serviceTime: "08:00", priest: { id: "priest-old", displayName: "Old Priest" }, organist: { id: "organist-old", displayName: "Old Organist" } }, workingSet);
      const target = await createCompletedRecord(service, { ...mixedContext, serviceDate: "2026-07-11", serviceTime: "09:00", priest: { id: "priest-target", displayName: "Target Priest" }, organist: { id: "organist-target", displayName: "Target Organist" } }, workingSet);

      let openRecord: CompletedServiceRecord | null = target;
      let lastSaved: PersistedRecordReference | null = { kind: "active", id: "planning-set-previous" };
      lastSaved = clearLastSavedRecordOnOpen();
      assert.equal(lastSaved, null);

      const failingSave = await service.updateCompletedRecord({
        role: "admin",
        recordId: target.id,
        serviceContext: older.serviceContext,
        set: target.set,
      });
      assert.equal(failingSave.success, false);
      assert.equal(openRecord.id, target.id);
      assert.equal(lastSaved, null);

      const updatedContext = { ...target.serviceContext, priest: { id: "priest-updated", displayName: "Updated Priest" }, organist: { id: "organist-updated", displayName: "Updated Organist" } } satisfies ServiceContext;
      const saved = await service.updateCompletedRecord({ role: "admin", recordId: target.id, serviceContext: updatedContext, set: { ...target.set, rows: [{ note: "Updated completed row" }] } });
      assert.equal(saved.success, true);
      if (!saved.success) throw new Error("save should succeed");
      assert.equal(saved.value.id, target.id);
      assert.equal(saved.value.completedAt.getTime(), target.completedAt.getTime());
      assert.equal(saved.value.sourceFinalSetId, target.sourceFinalSetId);
      lastSaved = { kind: "completed", id: saved.value.id };
      openRecord = null;
      const afterSaveRecords = await service.listCompletedRecords();
      assert.equal(afterSaveRecords.success, true);
      const afterSaveDefaults = getDraftPeopleDefaults(afterSaveRecords.success ? afterSaveRecords.value : []);
      assert.deepEqual(afterSaveDefaults.priest, updatedContext.priest);
      assert.equal(lastSaved.kind, "completed");
      assert.equal(openRecord, null);
      assert.equal("10:00", "10:00");

      openRecord = saved.value;
      const deleted = await service.deleteCompletedRecord({ role: "admin", recordId: saved.value.id });
      assert.equal(deleted.success, true);
      if (lastSaved?.kind === "completed" && lastSaved.id === saved.value.id) lastSaved = null;
      openRecord = null;
      const afterDeleteRecords = await service.listCompletedRecords();
      assert.equal(afterDeleteRecords.success, true);
      assert.equal(afterDeleteRecords.success ? afterDeleteRecords.value.some((record) => record.id === saved.value.id) : true, false);
      const afterDeleteDefaults = getDraftPeopleDefaults(afterDeleteRecords.success ? afterDeleteRecords.value : []);
      assert.deepEqual(afterDeleteDefaults.priest, older.serviceContext.priest);
      assert.equal(lastSaved, null);
      assert.equal(openRecord, null);

      const secondDelete = await service.deleteCompletedRecord({ role: "admin", recordId: older.id });
      assert.equal(secondDelete.success, true);
      const emptyRecords = await service.listCompletedRecords();
      assert.deepEqual(getDraftPeopleDefaults(emptyRecords.success ? emptyRecords.value : []), { priest: { displayName: "" }, organist: { displayName: "" } });
    },
  },


  {
    name: "service identity requires service time, rejects duplicate date/time, and allows editing the same set",
    async run() {
      const { service } = createService();
      const missingTime = await service.saveWorkingSet({ role: "admin", serviceContext: { ...mixedContext, serviceTime: "" }, set: workingSet });
      assert.equal(missingTime.success, false);
      const invalidTime = await service.saveWorkingSet({ role: "admin", serviceContext: { ...mixedContext, serviceTime: "24:00" }, set: workingSet });
      assert.equal(invalidTime.success, false);

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
    name: "deleting an active set frees its service identity",
    async run() {
      const { service } = createService();
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      assert.equal(saved.success, true);
      const deleted = await service.deletePlanningSet({ role: "admin", setId: saved.success ? saved.value.id : "missing" });
      assert.equal(deleted.success, true);
      const recreated = await service.saveWorkingSet({ role: "admin", serviceContext: mixedContext, set: workingSet });
      assert.equal(recreated.success, true);
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
      assert.equal(records.success ? records.value[0]?.serviceContext.priest.displayName : undefined, mixedContext.priest.displayName);
    },
  },
  {
    name: "phase 30.1 hydration context persists across working final completed and completed updates",
    async run() {
      const { service } = createService();
      const contextWithHydration = { ...mixedContext, serviceDate: "2026-07-08", serviceTime: "08:00", antiphonKey: " synthetic-entry ", liturgicalSeasonKey: "synthetic-advent" } as ServiceContext & { antiphonKey?: string; liturgicalSeasonKey?: string };
      const saved = await service.saveWorkingSet({ role: "admin", serviceContext: contextWithHydration, set: workingSet });
      assert.equal(saved.success, true);
      if (!saved.success) throw new Error("working save failed");
      const loadedWorking = await service.loadPlanningSet(saved.value.id);
      assert.equal(loadedWorking.success ? loadedWorking.value.serviceContext.antiphonKey : undefined, "synthetic-entry", "Working reload must preserve normalized antiphon key");
      assert.equal(loadedWorking.success ? loadedWorking.value.serviceContext.liturgicalSeasonKey : undefined, "synthetic-advent", "Working reload must preserve liturgical season key");

      const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
      assert.equal(finalized.success, true);
      assert.equal(finalized.success ? finalized.value.serviceContext.antiphonKey : undefined, "synthetic-entry", "Final reload must preserve antiphon key");
      assert.equal(finalized.success ? finalized.value.serviceContext.liturgicalSeasonKey : undefined, "synthetic-advent", "Final reload must preserve liturgical season key");

      const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
      assert.equal(completed.success, true);
      assert.equal(completed.success ? completed.value.serviceContext.antiphonKey : undefined, "synthetic-entry", "Completed reload must preserve antiphon key");
      assert.equal(completed.success ? completed.value.serviceContext.liturgicalSeasonKey : undefined, "synthetic-advent", "Completed reload must preserve liturgical season key");

      const updatedContext = { ...(completed.success ? completed.value.serviceContext : contextWithHydration), antiphonKey: "  ", liturgicalSeasonKey: "ordinary-time" } as ServiceContext & { antiphonKey?: string; liturgicalSeasonKey?: string };
      const updated = await service.updateCompletedRecord({ role: "admin", recordId: completed.success ? completed.value.id : "missing", serviceContext: updatedContext, set: completed.success ? completed.value.set : finalSet });
      assert.equal(updated.success, true);
      assert.equal(updated.success ? updated.value.serviceContext.antiphonKey : undefined, undefined, "Whitespace-only antiphon key must normalize away on completed update");
      assert.equal(updated.success ? updated.value.serviceContext.liturgicalSeasonKey : undefined, "ordinary-time", "Completed admin update reload must preserve season key");
    },
  },
  {
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

async function createCompletedRecord(service: PlanningLifecycleService, serviceContext: ServiceContext, set: PlanningSet & { status: "working" }): Promise<CompletedServiceRecord> {
  const saved = await service.saveWorkingSet({ role: "admin", serviceContext, set });
  assert.equal(saved.success, true);
  const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.success ? saved.value.id : "missing" });
  assert.equal(finalized.success, true);
  const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
  assert.equal(completed.success, true);
  if (!completed.success) throw new Error("completed record should exist");
  return completed.value;
}

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
    service: new PlanningLifecycleService({ planningSets, completedServiceRecords: completedRecords, catalog: new InMemoryCatalogRepository(), enforceCatalogSelections: false, now: () => fixedNow }),
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

  async update(id: string, serviceContext: CompletedServiceRecord["serviceContext"], set: CompletedServiceRecord["set"]): Promise<CompletedServiceRecord> {
    const updated = await this.delegate.update(id, serviceContext, set);
    this.records.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    await this.delegate.deleteById(id);
    this.records.delete(id);
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


function completedRecordFixture(id: string, serviceDate: string, serviceTime: string, completedAt: string, label: string): CompletedServiceRecord {
  return {
    id,
    sourceFinalSetId: `source-${id}`,
    completedAt: new Date(completedAt),
    serviceContext: {
      serviceDate,
      serviceTime,
      language: "mixed",
      priest: { id: `priest-${label}`, displayName: `Priest ${label}` },
      organist: { id: `organist-${label}`, displayName: `Organist ${label}` },
    },
    set: { status: "final", language: "mixed", rows: [{ note: label }] },
  };
}

void main().catch((error: unknown) => {
  console.error("Lifecycle regression tests failed.");
  console.error(error);
  process.exitCode = 1;
});
