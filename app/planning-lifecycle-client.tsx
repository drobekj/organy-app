"use client";

import { useEffect, useMemo, useState } from "react";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
  type CompletedServiceRecord,
  type PersistedPlanningSet,
  type PlanningSetId,
  type PlanningServiceError,
} from "../src/application/planning-lifecycle";
import type { ConcreteSongLanguage, PlanningRole, PlanningRow, ServiceLanguage } from "../src/planning-lifecycle";
import { canPerformPlanningAction, isValidServiceTime, normalizeServiceTime, validatePlanningRow } from "../src/planning-lifecycle";
import {
  formatDateInputValue,
  getDefaultRowLanguage,
  getDefaultServiceLanguage,
  getLanguageDeviationRowNumbers,
  getNearestSunday,
  propagateServiceLanguageToRows,
} from "../src/planning-lifecycle/service-context-defaults";
import { canMutatePlanningEditor, getDraftPeopleDefaults, recordListClassName, type DraftPeopleDefaults, type PersistedRecordReference } from "../src/planning-lifecycle/ui-session";

type EditableRow = {
  id: number;
  songLanguage: "" | ConcreteSongLanguage;
  songNumber: string;
  note: string;
  languageTouched: boolean;
};

type SaveState = "unsaved" | "saved" | "finalized" | "completed" | "deleted" | "errors";

type WorkingSetSnapshot = {
  serviceDate: string;
  serviceTime: string;
  serviceLanguage: ServiceLanguage;
  priest: string;
  organist: string;
  rows: PlanningRow[];
};

type PlanningLifecycleClientApi = PlanningLifecycleService | DbPlanningLifecycleClient;

type PlanningRepositories = {
  planningSets: InMemoryPlanningSetRepository;
  completedServiceRecords: InMemoryCompletedServiceRecordRepository;
};

const serviceLanguageOptions: ServiceLanguage[] = ["czech", "polish", "mixed"];
const songLanguageOptions: ConcreteSongLanguage[] = ["czech", "polish"];
const defaultServiceTime = "10:00";

const localRoleOptions: PlanningRole[] = ["priest", "organist", "admin", "congregationMember"];

function createEmptyRow(id: number, serviceLanguage: ServiceLanguage): EditableRow {
  return {
    id,
    songLanguage: getDefaultRowLanguage(serviceLanguage),
    songNumber: "",
    note: "",
    languageTouched: false,
  };
}


function fromPlanningRow(row: PlanningRow, id: number): EditableRow {
  return {
    id,
    songLanguage: row.song?.language ?? "",
    songNumber: row.song?.number ?? "",
    note: row.note ?? "",
    languageTouched: Boolean(row.song?.language),
  };
}

function toPlanningRow(row: EditableRow): PlanningRow {
  const songNumber = row.songNumber.trim();
  const note = row.note.trim();

  return {
    ...(songNumber
      ? {
          song: {
            language: row.songLanguage as ConcreteSongLanguage,
            number: songNumber,
          },
        }
      : {}),
    ...(note ? { note } : {}),
  };
}

function isFuturePragueDate(serviceDate: string): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return serviceDate > today;
}

export type RuntimeMode = "memory" | "db";

type PlanningLifecycleClientProps = {
  runtimeMode: RuntimeMode;
};

class DbPlanningLifecycleClient {
  async listPlanningSets() {
    return callPlanningLifecycleApi("listPlanningSets", {});
  }

  async listCompletedRecords() {
    return callPlanningLifecycleApi("listCompletedRecords", {});
  }

  async loadCompletedRecord(recordId: string) {
    return callPlanningLifecycleApi("loadCompletedRecord", { recordId });
  }

  async loadPlanningSet(setId: PlanningSetId) {
    return callPlanningLifecycleApi("loadPlanningSet", { setId });
  }

  async saveWorkingSet(input: Parameters<PlanningLifecycleService["saveWorkingSet"]>[0]) {
    return callPlanningLifecycleApi("saveWorkingSet", input);
  }

  async finalizeWorkingSet(input: Parameters<PlanningLifecycleService["finalizeWorkingSet"]>[0]) {
    return callPlanningLifecycleApi("finalizeWorkingSet", input);
  }

  async completeFinalSet(input: Parameters<PlanningLifecycleService["completeFinalSet"]>[0]) {
    return callPlanningLifecycleApi("completeFinalSet", input);
  }

  async deletePlanningSet(input: Parameters<PlanningLifecycleService["deletePlanningSet"]>[0]) {
    return callPlanningLifecycleApi("deletePlanningSet", input);
  }

  async updateCompletedRecord(input: Parameters<PlanningLifecycleService["updateCompletedRecord"]>[0]) {
    return callPlanningLifecycleApi("updateCompletedRecord", input);
  }

  async deleteCompletedRecord(input: Parameters<PlanningLifecycleService["deleteCompletedRecord"]>[0]) {
    return callPlanningLifecycleApi("deleteCompletedRecord", input);
  }
}

async function callPlanningLifecycleApi(action: string, input: unknown) {
  const response = await fetch("/api/planning-lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });

  const payload = await response.json();

  if (!response.ok) {
    return {
      success: false as const,
      error: {
        code: "invalidInput" as const,
        message: typeof payload?.error === "string" ? payload.error : "Planning Lifecycle API request failed.",
      },
    };
  }

  return payload;
}

export default function PlanningLifecycleClient({ runtimeMode }: PlanningLifecycleClientProps) {
  const repositories = useMemo<PlanningRepositories>(
    () => ({
      planningSets: new InMemoryPlanningSetRepository(),
      completedServiceRecords: new InMemoryCompletedServiceRecordRepository(),
    }),
    [],
  );
  const planningLifecycleService = useMemo(
    () =>
      runtimeMode === "db"
        ? new DbPlanningLifecycleClient()
        : new PlanningLifecycleService({
            planningSets: repositories.planningSets,
            completedServiceRecords: repositories.completedServiceRecords,
          }),
    [repositories, runtimeMode],
  );
  const initialServiceSunday = useMemo(() => getNearestSunday(new Date()), []);
  const initialServiceDate = useMemo(() => formatDateInputValue(initialServiceSunday), [initialServiceSunday]);
  const initialServiceLanguage = useMemo(() => getDefaultServiceLanguage(initialServiceSunday), [initialServiceSunday]);
  const [serviceDate, setServiceDate] = useState(initialServiceDate);
  const [serviceTime, setServiceTime] = useState(defaultServiceTime);
  const [serviceLanguage, setServiceLanguage] = useState<ServiceLanguage>(initialServiceLanguage);
  const [priest, setPriest] = useState("");
  const [priestId, setPriestId] = useState<string | undefined>(undefined);
  const [organist, setOrganist] = useState("");
  const [organistId, setOrganistId] = useState<string | undefined>(undefined);
  const [selectedRole, setSelectedRole] = useState<PlanningRole>("priest");
  const [rows, setRows] = useState<EditableRow[]>(() => [createEmptyRow(1, initialServiceLanguage)]);
  const [nextRowId, setNextRowId] = useState(2);
  const [saveState, setSaveState] = useState<SaveState>("unsaved");
  const [savedWorkingSet, setSavedWorkingSet] = useState<WorkingSetSnapshot | null>(null);
  const [persistedSet, setPersistedSet] = useState<PersistedPlanningSet | null>(null);
  const [completedRecord, setCompletedRecord] = useState<CompletedServiceRecord | null>(null);
  const [savedDbSets, setSavedDbSets] = useState<PersistedPlanningSet[]>([]);
  const [completedRecords, setCompletedRecords] = useState<CompletedServiceRecord[]>([]);
  const [serviceError, setServiceError] = useState<PlanningServiceError | null>(null);
  const [lastSavedRecord, setLastSavedRecord] = useState<PersistedRecordReference | null>(null);
  const [isCompletedAdminEditMode, setIsCompletedAdminEditMode] = useState(false);
  const [draftPeopleDefaults, setDraftPeopleDefaults] = useState<DraftPeopleDefaults>({ priest: { displayName: "" }, organist: { displayName: "" } });

  useEffect(() => {
    void refreshDbSets();
  }, [runtimeMode]);

  useEffect(() => {
    if (!persistedSet && !completedRecord && saveState === "unsaved") {
      setPriest(draftPeopleDefaults.priest.displayName);
      setPriestId(draftPeopleDefaults.priest.id);
      setOrganist(draftPeopleDefaults.organist.displayName);
      setOrganistId(draftPeopleDefaults.organist.id);
    }
  }, [draftPeopleDefaults]);

  const planningRows = useMemo(() => rows.map(toPlanningRow), [rows]);
  const lifecycleState = completedRecord ? "completed" : persistedSet?.status ?? "working draft";
  const validationResults = useMemo(() => planningRows.map(validatePlanningRow), [planningRows]);
  const hasValidationErrors = validationResults.some((result) => !result.valid);
  const isCompletedRecordOpen = Boolean(completedRecord);
  const hasServiceContext = Boolean(serviceDate && isValidServiceTime(serviceTime) && priest.trim() && organist.trim());
  const isFinalSetOpen = persistedSet?.status === "final";
  const canMutateEditor = canMutatePlanningEditor({ isFinalSetOpen, isCompletedRecordOpen, isCompletedAdminEditMode, selectedRole });
  const isEditorLocked = !canMutateEditor;
  const canSaveWorkingSet = !isCompletedRecordOpen && !isFinalSetOpen && canPerformPlanningAction(
    selectedRole,
    persistedSet?.status === "working" ? "editWorkingSet" : "createWorkingSet",
  );
  const canFinalizeSet = !isCompletedRecordOpen && !isFinalSetOpen && canPerformPlanningAction(selectedRole, "saveFinalSet");
  const completeDateReason = persistedSet?.status === "final" && isFuturePragueDate(persistedSet.serviceContext.serviceDate) ? "Future service cannot be completed before its date in Europe/Prague." : "";
  const canCompleteSet = !isCompletedRecordOpen && canPerformPlanningAction(selectedRole, "convertFinalSetToCompletedServiceRecord") && !completeDateReason;
  const canDeleteCurrentSet = !isCompletedRecordOpen && persistedSet
    ? canPerformPlanningAction(selectedRole, persistedSet.status === "working" ? "deleteWorkingSet" : "deleteFinalSet")
    : false;
  const canEditCompletedRecord = isCompletedRecordOpen && isCompletedAdminEditMode && selectedRole === "admin";
  const canEditRows = canMutateEditor && (canEditCompletedRecord || (!isCompletedRecordOpen && !isFinalSetOpen && (!persistedSet || persistedSet.status === "working" ? canSaveWorkingSet : false)));

  async function refreshDbSets() {
    const result = await planningLifecycleService.listPlanningSets();
    const completedResult = await planningLifecycleService.listCompletedRecords();
    const activeSets = result.success ? result.value : savedDbSets;
    const completed = completedResult.success ? completedResult.value : completedRecords;
    const defaults = getDraftPeopleDefaults(completed);

    if (result.success) setSavedDbSets(activeSets);
    if (completedResult.success) {
      setCompletedRecords(completed);
      setDraftPeopleDefaults(defaults);
    }

    return { activeSets, completedRecords: completed, draftPeopleDefaults: defaults };
  }

  function openPersistedSet(set: PersistedPlanningSet) {
    setPersistedSet(set);
    setCompletedRecord(null);
    setServiceDate(set.serviceContext.serviceDate);
    setServiceTime(set.serviceContext.serviceTime);
    setServiceLanguage(set.serviceContext.language);
    setPriest(set.serviceContext.priest.displayName);
    setPriestId(set.serviceContext.priest.id);
    setOrganist(set.serviceContext.organist.displayName);
    setOrganistId(set.serviceContext.organist.id);
    const editableRows = set.rows.length ? set.rows.map((row, index) => fromPlanningRow(row, index + 1)) : [createEmptyRow(1, set.serviceContext.language)];
    setRows(editableRows);
    setNextRowId(editableRows.length + 1);
    setSaveState(set.status === "working" ? "saved" : "finalized");
    setServiceError(null);
  }

  function openCompletedRecord(record: CompletedServiceRecord) {
    setCompletedRecord(record);
    setPersistedSet(null);
    setServiceDate(record.serviceContext.serviceDate);
    setServiceTime(record.serviceContext.serviceTime);
    setServiceLanguage(record.serviceContext.language);
    setPriest(record.serviceContext.priest.displayName);
    setPriestId(record.serviceContext.priest.id);
    setOrganist(record.serviceContext.organist.displayName);
    setOrganistId(record.serviceContext.organist.id);
    const editableRows = record.set.rows.length ? record.set.rows.map((row, index) => fromPlanningRow(row, index + 1)) : [createEmptyRow(1, record.serviceContext.language)];
    setRows(editableRows);
    setNextRowId(editableRows.length + 1);
    setSaveState("completed");
    setIsCompletedAdminEditMode(false);
    setServiceError(null);
  }

  async function loadCompletedRecord(recordId: string) {
    const result = await planningLifecycleService.loadCompletedRecord(recordId);
    if (result.success) {
      openCompletedRecord(result.value);
      await refreshDbSets();
      return;
    }
    setServiceError(result.error);
    setSaveState("errors");
  }

  async function loadDbSet(setId: PlanningSetId) {
    const result = await planningLifecycleService.loadPlanningSet(setId);
    if (result.success) {
      openPersistedSet(result.value);
      await refreshDbSets();
      return;
    }
    setServiceError(result.error);
    setSaveState("errors");
  }

  function startNewDraftAfterSuccess(defaults: DraftPeopleDefaults = draftPeopleDefaults) {
    setPersistedSet(null);
    setCompletedRecord(null);
    setSavedWorkingSet(null);
    setServiceDate(initialServiceDate);
    setServiceTime(defaultServiceTime);
    setServiceLanguage(initialServiceLanguage);
    setPriest(defaults.priest.displayName);
    setPriestId(defaults.priest.id);
    setOrganist(defaults.organist.displayName);
    setOrganistId(defaults.organist.id);
    setRows([createEmptyRow(1, initialServiceLanguage)]);
    setNextRowId(2);
  }

  async function startNewDbDraft() {
    if (isCompletedAdminEditMode) return;
    const { draftPeopleDefaults: defaults } = await refreshDbSets();
    setPersistedSet(null);
    setCompletedRecord(null);
    setSavedWorkingSet(null);
    setServiceDate(initialServiceDate);
    setServiceTime(defaultServiceTime);
    setServiceLanguage(initialServiceLanguage);
    setPriest(defaults.priest.displayName);
    setPriestId(defaults.priest.id);
    setOrganist(defaults.organist.displayName);
    setOrganistId(defaults.organist.id);
    setRows([createEmptyRow(1, initialServiceLanguage)]);
    setNextRowId(2);
    setServiceError(null);
    setSaveState("unsaved");
  }

  function guardedEditorUpdate(update: () => void) {
    if (!canMutateEditor) return;
    update();
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateServiceDateValue(value: string) {
    guardedEditorUpdate(() => setServiceDate(value));
  }

  function updateServiceTimeValue(value: string) {
    guardedEditorUpdate(() => setServiceTime(value));
  }

  function updatePriestValue(value: string) {
    guardedEditorUpdate(() => {
      setPriest(value);
      setPriestId(undefined);
    });
  }

  function updateOrganistValue(value: string) {
    guardedEditorUpdate(() => {
      setOrganist(value);
      setOrganistId(undefined);
    });
  }

  function markUnsaved() {
    if (isEditorLocked) return;
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateRow(id: number, changes: Partial<EditableRow>) {
    guardedEditorUpdate(() => setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    ));
  }

  function addRow() {
    guardedEditorUpdate(() => {
      setRows((currentRows) => [...currentRows, createEmptyRow(nextRowId, serviceLanguage)]);
      setNextRowId((currentId) => currentId + 1);
    });
  }

  function removeRow(id: number) {
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.filter((row) => row.id !== id)));
  }

  function moveRow(index: number, direction: -1 | 1) {
    if (!canMutateEditor) return;
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= rows.length) {
      return;
    }

    setRows((currentRows) => {
      const nextRows = [...currentRows];
      const [movedRow] = nextRows.splice(index, 1);
      nextRows.splice(targetIndex, 0, movedRow);
      return nextRows;
    });
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateServiceLanguage(nextServiceLanguage: ServiceLanguage) {
    guardedEditorUpdate(() => {
      setServiceLanguage(nextServiceLanguage);
      setRows((currentRows) => propagateServiceLanguageToRows(currentRows, nextServiceLanguage));
    });
  }

  async function saveWorkingSet() {
    if (isCompletedRecordOpen || isFinalSetOpen) return;
    if (!hasServiceContext) {
      setServiceError({
        code: "invalidInput",
        message: "Service context is required before saving a working set.",
        issues: [
          ...(!serviceDate ? [{ path: "serviceDate", message: "Service date is required." }] : []),
          ...(!isValidServiceTime(serviceTime) ? [{ path: "serviceTime", message: "Service time is required in HH:mm format between 00:00 and 23:59." }] : []),
          ...(!priest.trim() ? [{ path: "priest", message: "Priest is required." }] : []),
          ...(!organist.trim() ? [{ path: "organist", message: "Organist is required." }] : []),
        ],
      });
      setSaveState("errors");
      return;
    }

    const languageDeviationRows = getLanguageDeviationRowNumbers(rows, serviceLanguage);
    if (languageDeviationRows.length > 0) {
      const confirmed = window.confirm(
        `Rows ${languageDeviationRows.join(", ")} do not match the ${serviceLanguage} service language. Save this combination?`,
      );
      if (!confirmed) {
        setServiceError({
          code: "invalidInput",
          message: `Save cancelled. Rows ${languageDeviationRows.join(", ")} do not match the ${serviceLanguage} service language.`,
        });
        setSaveState("errors");
        return;
      }
    }

    const result = await planningLifecycleService.saveWorkingSet({
      role: selectedRole,
      existingSetId: persistedSet?.status === "working" ? persistedSet.id : undefined,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
      },
      set: {
        status: "working",
        language: serviceLanguage,
        rows: planningRows,
      },
    });

    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return;
    }

    setServiceError(null);
    setSavedWorkingSet({
      serviceDate,
      serviceTime,
      serviceLanguage,
      priest,
      organist,
      rows: planningRows,
    });
    setLastSavedRecord({ kind: "active", id: result.value.id });
    setSaveState("saved");
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
  }

  async function finalizeWorkingSet() {
    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "working") {
      return;
    }

    const result = await planningLifecycleService.finalizeWorkingSet({
      role: selectedRole,
      workingSetId: persistedSet.id,
    });

    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return;
    }

    setServiceError(null);
    setLastSavedRecord({ kind: "active", id: result.value.id });
    setSaveState("finalized");
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
  }

  async function completeFinalSet() {
    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "final") {
      return;
    }

    const result = await planningLifecycleService.completeFinalSet({
      role: selectedRole,
      finalSetId: persistedSet.id,
    });

    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return;
    }

    setCompletedRecord(null);
    setPersistedSet(null);
    setServiceError(null);
    setLastSavedRecord({ kind: "completed", id: result.value.id });
    setSaveState("completed");
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
  }


  function editCompletedRecord() {
    if (!completedRecord || selectedRole !== "admin") return;
    setSelectedRole("admin");
    setIsCompletedAdminEditMode(true);
    setServiceError(null);
  }

  async function saveCompletedChanges() {
    if (!completedRecord || !isCompletedAdminEditMode || selectedRole !== "admin") return;

    const languageDeviationRows = getLanguageDeviationRowNumbers(rows, serviceLanguage);
    if (languageDeviationRows.length > 0) {
      const confirmed = window.confirm(
        `Rows ${languageDeviationRows.join(", ")} do not match the ${serviceLanguage} service language. Save this combination?`,
      );
      if (!confirmed) {
        setServiceError({ code: "invalidInput", message: `Save cancelled. Rows ${languageDeviationRows.join(", ")} do not match the ${serviceLanguage} service language.` });
        setSaveState("errors");
        return;
      }
    }

    const result = await planningLifecycleService.updateCompletedRecord({
      role: selectedRole,
      recordId: completedRecord.id,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
      },
      set: { status: "final", language: serviceLanguage, rows: planningRows },
    });

    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return;
    }

    openCompletedRecord(result.value);
    setLastSavedRecord({ kind: "completed", id: result.value.id });
    setServiceError(null);
    setSaveState("completed");
    await refreshDbSets();
  }

  async function cancelCompletedEditing() {
    if (!completedRecord) return;
    const result = await planningLifecycleService.loadCompletedRecord(completedRecord.id);
    if (result.success) {
      openCompletedRecord(result.value);
      await refreshDbSets();
      return;
    }
    setServiceError(result.error);
    setSaveState("errors");
  }

  async function deleteCompletedRecord() {
    if (!completedRecord || selectedRole !== "admin" || isCompletedAdminEditMode) return;
    const confirmed = window.confirm(`Delete completed record for ${completedRecord.serviceContext.serviceDate} at ${completedRecord.serviceContext.serviceTime}?`);
    if (!confirmed) return;
    const deletedRecordId = completedRecord.id;
    const result = await planningLifecycleService.deleteCompletedRecord({ role: selectedRole, recordId: deletedRecordId });
    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return;
    }
    if (lastSavedRecord?.kind === "completed" && lastSavedRecord.id === deletedRecordId) setLastSavedRecord(null);
    setServiceError(null);
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
    setSaveState("deleted");
  }

  async function deletePersistedSet() {
    if (isCompletedRecordOpen || !persistedSet) {
      return;
    }

    const deletedSetId: PlanningSetId = persistedSet.id;
    const result = await planningLifecycleService.deletePlanningSet({
      role: selectedRole,
      setId: deletedSetId,
    });

    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return;
    }

    setPersistedSet(null);
    setCompletedRecord(null);
    setSavedWorkingSet(null);
    setServiceError(null);
    if (lastSavedRecord?.kind === "active" && lastSavedRecord.id === deletedSetId) setLastSavedRecord(null);
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
    setSaveState("deleted");
  }

  return (
    <main className="shell">
      <section className="card planning-card" aria-labelledby="page-title">
        <p className="eyebrow">Planning Lifecycle First</p>
        <h1 id="page-title">Working service set</h1>
        <p className="lede">Build a minimal in-memory set before persistence or final UX exists.</p>

        <section className="release-guidance" aria-label="First local release guidance">
          <div>
            <span className="guidance-label">Runtime mode</span>
            <strong>{runtimeMode === "db" ? "Local DB opt-in" : "Local in-memory only"}</strong>
            <p>
              {runtimeMode === "db"
                ? "Planning Lifecycle actions use the local database service selected by ORGANY_RUNTIME=db."
                : "Data is kept only in the current browser runtime and is not durable across refreshes or restarts."}
            </p>
          </div>
          <div>
            <span className="guidance-label">Selected role</span>
            <strong>{selectedRole}</strong>
            <p>Permission checks use this local selector; there is no auth, session, or account model yet.</p>
          </div>
          <div>
            <span className="guidance-label">Lifecycle state</span>
            <strong>{lifecycleState}</strong>
            <p>Use Save, Finalize, Complete, and Delete to walk the first local smoke flow.</p>
          </div>
        </section>

        <div className={`status status-${saveState}`} role="status">
          {saveState === "unsaved" && "Unsaved"}
          {saveState === "saved" && (runtimeMode === "db" ? "Saved to DB" : "Saved in memory")}
          {saveState === "finalized" && (runtimeMode === "db" ? "Finalized in DB" : "Finalized in memory")}
          {saveState === "completed" && (runtimeMode === "db" ? "Completed in DB" : "Completed in memory")}
          {saveState === "deleted" && (runtimeMode === "db" ? "Deleted from DB" : "Deleted from memory")}
          {saveState === "errors" && "Service error"}
        </div>

        <section className="db-workspace" aria-label="Saved planning records">
          <div className="rows-header">
            <h2>Active sets</h2>
            <button type="button" onClick={startNewDbDraft} disabled={isCompletedAdminEditMode}>Start new set</button>
          </div>
          {savedDbSets.length === 0 ? (
            <p className="field-help">No active planning sets saved yet.</p>
          ) : (
            <ul className="saved-set-list">
              {savedDbSets.map((set) => (
                <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}>
                  <button type="button" onClick={() => loadDbSet(set.id)} disabled={isCompletedAdminEditMode}>
                    Open #{set.id}: {set.status}, {set.serviceContext.serviceDate} {set.serviceContext.serviceTime || "Time missing"}, {set.serviceContext.language}, priest {set.serviceContext.priest.displayName || "—"}, organist {set.serviceContext.organist.displayName || "—"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h2>Completed records</h2>
          {completedRecords.length === 0 ? (
            <p className="field-help">No completed service records saved yet.</p>
          ) : (
            <ul className="saved-set-list">
              {completedRecords.map((record) => (
                <li key={record.id} className={recordListClassName(completedRecord?.id === record.id, lastSavedRecord?.kind === "completed" && lastSavedRecord.id === record.id)}>
                  <button type="button" onClick={() => loadCompletedRecord(record.id)} disabled={isCompletedAdminEditMode}>
                    Read #{record.id}: {record.serviceContext.serviceDate} {record.serviceContext.serviceTime || "Time missing"}, {record.set.rows.length} rows
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form className="planning-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="field-group">
            <legend>Service context</legend>
            <label>
              Service date
              <input
                type="date"
                disabled={isEditorLocked}
                value={serviceDate}
                onChange={(event) => {
                  updateServiceDateValue(event.target.value);
                }}
              />
            </label>
            <label>
              Service time
              <input
                type="time"
                disabled={isEditorLocked}
                value={serviceTime}
                onChange={(event) => {
                  updateServiceTimeValue(event.target.value);
                }}
              />
              {!serviceTime && <span className="field-help">Time missing</span>}
            </label>
            <label>
              Service language
              <select
                disabled={isEditorLocked}
                value={serviceLanguage}
                onChange={(event) => {
                  updateServiceLanguage(event.target.value as ServiceLanguage);
                }}
              >
                {serviceLanguageOptions.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priest
              <input
                type="text"
                placeholder="Priest name or placeholder"
                disabled={isEditorLocked}
                value={priest}
                onChange={(event) => {
                  updatePriestValue(event.target.value);
                }}
              />
            </label>
            <label>
              Organist
              <input
                type="text"
                placeholder="Organist name or placeholder"
                disabled={isEditorLocked}
                value={organist}
                onChange={(event) => {
                  updateOrganistValue(event.target.value);
                }}
              />
            </label>
          </fieldset>

          <fieldset className="field-group local-role-block">
            <legend>Local role simulation</legend>
            <label>
              Local role
              <select
                value={selectedRole}
                disabled={isCompletedAdminEditMode}
                onChange={(event) => {
                  if (isCompletedAdminEditMode) return;
                  setSelectedRole(event.target.value as PlanningRole);
                }}
                aria-describedby="local-role-help"
              >
                {localRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <p id="local-role-help" className="field-help">
              Local in-memory dev selector only; lifecycle actions use this role for permission checks. It is not part of ServiceContext.
            </p>
          </fieldset>

          <div className="rows-header">
            <h2>Rows</h2>
            <button type="button" onClick={addRow} disabled={!canEditRows}>
              Add row
            </button>
          </div>

          <div className="rows-list">
            {rows.map((row, index) => {
              const validation = validationResults[index];

              return (
                <fieldset className="row-card" key={row.id}>
                  <legend>Row {index + 1}</legend>
                  <div className="row-actions">
                    <button type="button" onClick={() => moveRow(index, -1)} disabled={!canEditRows || index === 0}>
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(index, 1)}
                      disabled={!canEditRows || index === rows.length - 1}
                    >
                      Move down
                    </button>
                    <button type="button" onClick={() => removeRow(row.id)} disabled={!canEditRows || rows.length === 1}>
                      Remove
                    </button>
                  </div>
                  <div className="row-fields">
                    <label>
                      Song language
                      <select
                        disabled={!canEditRows}
                        value={row.songLanguage}
                        onChange={(event) =>
                          updateRow(row.id, {
                            songLanguage: event.target.value as EditableRow["songLanguage"],
                            languageTouched: true,
                          })
                        }
                      >
                        <option value="">No language</option>
                        {songLanguageOptions.map((language) => (
                          <option key={language} value={language}>
                            {language}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Song number
                      <input
                        type="text"
                        value={row.songNumber}
                        onChange={(event) => updateRow(row.id, { songNumber: event.target.value })}
                        placeholder="e.g. 42"
                        disabled={!canEditRows}
                      />
                    </label>
                    <label className="note-field">
                      Text note
                      <input
                        type="text"
                        value={row.note}
                        onChange={(event) => updateRow(row.id, { note: event.target.value })}
                        placeholder="Optional note without a song"
                        disabled={!canEditRows}
                      />
                    </label>
                  </div>
                  {!validation.valid && (
                    <ul className="validation-list" aria-label={`Row ${index + 1} validation errors`}>
                      {validation.issues.map((issue) => (
                        <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
                      ))}
                    </ul>
                  )}
                </fieldset>
              );
            })}
          </div>

          <div className="form-actions">
            {isCompletedAdminEditMode ? (
              <>
                <button className="save-button" type="button" onClick={saveCompletedChanges} disabled={selectedRole !== "admin" || !hasServiceContext || hasValidationErrors}>
                  Save completed changes
                </button>
                <button type="button" onClick={cancelCompletedEditing}>Cancel editing</button>
              </>
            ) : (
              <>
                {!isCompletedRecordOpen && !isFinalSetOpen && (
                  <>
                    <button className="save-button" type="button" onClick={saveWorkingSet} disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors}>
                      Save working set
                    </button>
                    <button type="button" onClick={finalizeWorkingSet} disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors}>
                      Finalize set
                    </button>
                  </>
                )}
                {!isCompletedRecordOpen && (
                  <>
                    <button type="button" onClick={completeFinalSet} disabled={!canCompleteSet || !persistedSet || persistedSet.status !== "final"} title={completeDateReason || undefined}>
                      Complete service
                    </button>
                    <button type="button" onClick={deletePersistedSet} disabled={!canDeleteCurrentSet || !persistedSet}>
                      Delete saved set
                    </button>
                  </>
                )}
                {isCompletedRecordOpen && selectedRole === "admin" && (
                  <>
                    <button type="button" onClick={editCompletedRecord}>Edit completed record</button>
                    <button type="button" onClick={deleteCompletedRecord}>Delete completed record</button>
                  </>
                )}
              </>
            )}
          </div>
          {completeDateReason && <p className="field-help">Complete service disabled: {completeDateReason}</p>}
        </form>

        {serviceError && (
          <p className="error-summary">
            {serviceError.message}
            {serviceError.issues?.length ? ` ${serviceError.issues.map((issue) => issue.message).join(" ")}` : ""}
          </p>
        )}

        {persistedSet && (
          <p className="saved-summary">
            {runtimeMode === "db" ? "Current DB set ID" : "Current in-memory set ID"}: {persistedSet.id}. Display order: current saved set 1 (
            {persistedSet.status}, {persistedSet.rows.length} row{persistedSet.rows.length === 1 ? "" : "s"}).
          </p>
        )}

        {completedRecord && (
          <p className="saved-summary">
            Completed record: {completedRecord.id} from {completedRecord.sourceFinalSetId}.
          </p>
        )}

        {savedWorkingSet && saveState === "saved" && (
          <p className="saved-summary">
            Saved {savedWorkingSet.rows.length} row{savedWorkingSet.rows.length === 1 ? "" : "s"} for{" "}
            {savedWorkingSet.serviceDate || "an unscheduled service"}.
          </p>
        )}
      </section>
    </main>
  );
}
