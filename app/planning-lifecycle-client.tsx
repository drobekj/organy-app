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
  const [serviceTime, setServiceTime] = useState("09:00");
  const [serviceLanguage, setServiceLanguage] = useState<ServiceLanguage>(initialServiceLanguage);
  const [priest, setPriest] = useState("");
  const [organist, setOrganist] = useState("");
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

  useEffect(() => {
    void refreshDbSets();
  }, [runtimeMode]);

  const planningRows = useMemo(() => rows.map(toPlanningRow), [rows]);
  const lifecycleState = completedRecord ? "completed" : persistedSet?.status ?? "working draft";
  const validationResults = useMemo(() => planningRows.map(validatePlanningRow), [planningRows]);
  const hasValidationErrors = validationResults.some((result) => !result.valid);
  const isCompletedRecordOpen = Boolean(completedRecord);
  const hasServiceContext = Boolean(serviceDate && isValidServiceTime(serviceTime) && priest.trim() && organist.trim());
  const canSaveWorkingSet = !isCompletedRecordOpen && canPerformPlanningAction(
    selectedRole,
    persistedSet?.status === "working" ? "editWorkingSet" : "createWorkingSet",
  );
  const canFinalizeSet = !isCompletedRecordOpen && canPerformPlanningAction(selectedRole, "saveFinalSet");
  const completeDateReason = persistedSet?.status === "final" && isFuturePragueDate(persistedSet.serviceContext.serviceDate) ? "Future service cannot be completed before its date in Europe/Prague." : "";
  const canCompleteSet = !isCompletedRecordOpen && canPerformPlanningAction(selectedRole, "convertFinalSetToCompletedServiceRecord") && !completeDateReason;
  const canDeleteCurrentSet = !isCompletedRecordOpen && persistedSet
    ? canPerformPlanningAction(selectedRole, persistedSet.status === "working" ? "deleteWorkingSet" : "deleteFinalSet")
    : false;
  const canEditRows = !isCompletedRecordOpen && (!persistedSet || persistedSet.status === "working" ? canSaveWorkingSet : false);

  async function refreshDbSets() {
    const result = await planningLifecycleService.listPlanningSets();
    if (result.success) {
      setSavedDbSets(result.value);
    }
    const completedResult = await planningLifecycleService.listCompletedRecords();
    if (completedResult.success) {
      setCompletedRecords(completedResult.value);
    }
  }

  function openPersistedSet(set: PersistedPlanningSet) {
    setPersistedSet(set);
    setCompletedRecord(null);
    setServiceDate(set.serviceContext.serviceDate);
    setServiceTime(set.serviceContext.serviceTime);
    setServiceLanguage(set.serviceContext.language);
    setPriest(set.serviceContext.priest.displayName);
    setOrganist(set.serviceContext.organist.displayName);
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
    setOrganist(record.serviceContext.organist.displayName);
    const editableRows = record.set.rows.length ? record.set.rows.map((row, index) => fromPlanningRow(row, index + 1)) : [createEmptyRow(1, record.serviceContext.language)];
    setRows(editableRows);
    setNextRowId(editableRows.length + 1);
    setSaveState("completed");
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

  function startNewDraftAfterSuccess() {
    setPersistedSet(null);
    setCompletedRecord(null);
    setSavedWorkingSet(null);
    setServiceDate(initialServiceDate);
    setServiceTime("09:00");
    setServiceLanguage(initialServiceLanguage);
    setPriest("");
    setOrganist("");
    setRows([createEmptyRow(1, initialServiceLanguage)]);
    setNextRowId(2);
  }

  function startNewDbDraft() {
    setPersistedSet(null);
    setCompletedRecord(null);
    setSavedWorkingSet(null);
    setServiceDate(initialServiceDate);
    setServiceTime("09:00");
    setServiceLanguage(initialServiceLanguage);
    setPriest("");
    setOrganist("");
    setRows([createEmptyRow(1, initialServiceLanguage)]);
    setNextRowId(2);
    setServiceError(null);
    setSaveState("unsaved");
  }

  function markUnsaved() {
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateRow(id: number, changes: Partial<EditableRow>) {
    if (isCompletedRecordOpen) return;
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
    markUnsaved();
  }

  function addRow() {
    if (isCompletedRecordOpen) return;
    setRows((currentRows) => [...currentRows, createEmptyRow(nextRowId, serviceLanguage)]);
    setNextRowId((currentId) => currentId + 1);
    markUnsaved();
  }

  function removeRow(id: number) {
    if (isCompletedRecordOpen) return;
    setRows((currentRows) => currentRows.filter((row) => row.id !== id));
    markUnsaved();
  }

  function moveRow(index: number, direction: -1 | 1) {
    if (isCompletedRecordOpen) return;
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
    markUnsaved();
  }

  function updateServiceLanguage(nextServiceLanguage: ServiceLanguage) {
    if (isCompletedRecordOpen) return;
    setServiceLanguage(nextServiceLanguage);
    setRows((currentRows) => propagateServiceLanguageToRows(currentRows, nextServiceLanguage));
    markUnsaved();
  }

  async function saveWorkingSet() {
    if (isCompletedRecordOpen) return;
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
        priest: { displayName: priest },
        organist: { displayName: organist },
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
    setSaveState("saved");
    await refreshDbSets();
    startNewDraftAfterSuccess();
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
    setSaveState("finalized");
    await refreshDbSets();
    startNewDraftAfterSuccess();
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
    setSaveState("completed");
    await refreshDbSets();
    startNewDraftAfterSuccess();
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
    setSaveState("deleted");
    await refreshDbSets();
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
            <button type="button" onClick={startNewDbDraft}>Start new set</button>
          </div>
          {savedDbSets.length === 0 ? (
            <p className="field-help">No active planning sets saved yet.</p>
          ) : (
            <ul className="saved-set-list">
              {savedDbSets.map((set) => (
                <li key={set.id} className={persistedSet?.id === set.id ? "selected-record" : undefined}>
                  <button type="button" onClick={() => loadDbSet(set.id)}>
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
                <li key={record.id} className={completedRecord?.id === record.id ? "selected-record" : undefined}>
                  <button type="button" onClick={() => loadCompletedRecord(record.id)}>
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
                disabled={Boolean(completedRecord)}
                value={serviceDate}
                onChange={(event) => {
                  setServiceDate(event.target.value);
                  markUnsaved();
                }}
              />
            </label>
            <label>
              Service time
              <input
                type="time"
                disabled={Boolean(completedRecord)}
                value={serviceTime}
                onChange={(event) => {
                  setServiceTime(event.target.value);
                  markUnsaved();
                }}
              />
              {!serviceTime && <span className="field-help">Time missing</span>}
            </label>
            <label>
              Service language
              <select
                disabled={Boolean(completedRecord)}
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
                disabled={Boolean(completedRecord)}
                value={priest}
                onChange={(event) => {
                  setPriest(event.target.value);
                  markUnsaved();
                }}
              />
            </label>
            <label>
              Organist
              <input
                type="text"
                placeholder="Organist name or placeholder"
                disabled={Boolean(completedRecord)}
                value={organist}
                onChange={(event) => {
                  setOrganist(event.target.value);
                  markUnsaved();
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
                onChange={(event) => setSelectedRole(event.target.value as PlanningRole)}
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
            <button
              className="save-button"
              type="button"
              onClick={saveWorkingSet}
              disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors}
            >
              Save working set
            </button>
            <button
              type="button"
              onClick={finalizeWorkingSet}
              disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors}
            >
              Finalize set
            </button>
            <button
              type="button"
              onClick={completeFinalSet}
              disabled={!canCompleteSet || !persistedSet || persistedSet.status !== "final"}
              title={completeDateReason || undefined}
            >
              Complete service
            </button>
            <button type="button" onClick={deletePersistedSet} disabled={!canDeleteCurrentSet || !persistedSet}>
              Delete saved set
            </button>
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
