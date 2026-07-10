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
import { canPerformPlanningAction, validatePlanningRow } from "../src/planning-lifecycle";

type EditableRow = {
  id: number;
  songLanguage: "" | ConcreteSongLanguage;
  songNumber: string;
  note: string;
};

type SaveState = "unsaved" | "saved" | "finalized" | "completed" | "deleted" | "errors";

type WorkingSetSnapshot = {
  serviceDate: string;
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

function getNextSunday(date = new Date()): string {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const daysUntilSunday = (7 - utcDate.getUTCDay()) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + daysUntilSunday);
  return utcDate.toISOString().slice(0, 10);
}

function defaultRowLanguage(serviceLanguage: ServiceLanguage): "" | ConcreteSongLanguage {
  return serviceLanguage === "mixed" ? "" : serviceLanguage;
}

function createEmptyRow(id: number, serviceLanguage: ServiceLanguage): EditableRow {
  return {
    id,
    songLanguage: defaultRowLanguage(serviceLanguage),
    songNumber: "",
    note: "",
  };
}


function fromPlanningRow(row: PlanningRow, id: number): EditableRow {
  return {
    id,
    songLanguage: row.song?.language ?? "",
    songNumber: row.song?.number ?? "",
    note: row.note ?? "",
  };
}

function toPlanningRow(row: EditableRow): PlanningRow {
  const songNumber = row.songNumber.trim();
  const note = row.note.trim();

  return {
    ...(row.songLanguage || songNumber
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

export type RuntimeMode = "memory" | "db";

type PlanningLifecycleClientProps = {
  runtimeMode: RuntimeMode;
};

class DbPlanningLifecycleClient {
  async listPlanningSets() {
    return callPlanningLifecycleApi("listPlanningSets", {});
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
  const [serviceDate, setServiceDate] = useState(() => getNextSunday());
  const [serviceLanguage, setServiceLanguage] = useState<ServiceLanguage>("czech");
  const [priest, setPriest] = useState("");
  const [organist, setOrganist] = useState("");
  const [selectedRole, setSelectedRole] = useState<PlanningRole>("priest");
  const [rows, setRows] = useState<EditableRow[]>(() => [createEmptyRow(1, "czech")]);
  const [nextRowId, setNextRowId] = useState(2);
  const [saveState, setSaveState] = useState<SaveState>("unsaved");
  const [savedWorkingSet, setSavedWorkingSet] = useState<WorkingSetSnapshot | null>(null);
  const [persistedSet, setPersistedSet] = useState<PersistedPlanningSet | null>(null);
  const [completedRecord, setCompletedRecord] = useState<CompletedServiceRecord | null>(null);
  const [savedDbSets, setSavedDbSets] = useState<PersistedPlanningSet[]>([]);
  const [serviceError, setServiceError] = useState<PlanningServiceError | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{ label: string; action: () => void | Promise<void> } | null>(null);

  useEffect(() => {
    if (runtimeMode === "db") {
      void refreshDbSets();
    }
  }, [runtimeMode]);

  const planningRows = useMemo(() => rows.map(toPlanningRow), [rows]);
  const lifecycleState = persistedSet?.completedAt || completedRecord ? "completed" : persistedSet?.status ?? "working draft";
  const validationResults = useMemo(() => planningRows.map(validatePlanningRow), [planningRows]);
  const hasValidationErrors = validationResults.some((result) => !result.valid);
  const missingRequiredFields = useMemo(
    () => [
      ...(!serviceDate ? ["service date"] : []),
      ...(!organist.trim() ? ["organist"] : []),
      ...(!priest.trim() ? ["priest"] : []),
    ],
    [organist, priest, serviceDate],
  );
  const hasServiceContext = missingRequiredFields.length === 0;
  const isDirty = saveState === "unsaved" || saveState === "errors";
  const isCompletedSet = Boolean(persistedSet?.completedAt || completedRecord);
  const today = new Date().toISOString().slice(0, 10);
  const isServiceDateInPastOrToday = Boolean(serviceDate && serviceDate <= today);

  const canSaveWorkingSet = canPerformPlanningAction(
    selectedRole,
    persistedSet?.status === "working" ? "editWorkingSet" : "createWorkingSet",
  );
  const canFinalizeSet = canPerformPlanningAction(selectedRole, "saveFinalSet");
  const canCompleteSet = canPerformPlanningAction(selectedRole, "convertFinalSetToCompletedServiceRecord");
  const canDeleteCurrentSet = persistedSet
    ? canPerformPlanningAction(selectedRole, persistedSet.status === "working" ? "deleteWorkingSet" : "deleteFinalSet")
    : false;
  const canEditContext = (!persistedSet || persistedSet.status === "working") && !isCompletedSet && canSaveWorkingSet;
  const canEditRows = canEditContext;


  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function runWithDirtyProtection(label: string, action: () => void | Promise<void>) {
    if (isDirty) {
      setPendingNavigation({ label, action });
      return;
    }

    void action();
  }

  async function confirmPendingNavigation(choice: "save" | "discard" | "cancel") {
    const pending = pendingNavigation;
    setPendingNavigation(null);

    if (!pending || choice === "cancel") {
      return;
    }

    if (choice === "save") {
      if (!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || isCompletedSet) {
        setServiceError({ code: "invalidInput", message: "Current changes cannot be saved until validation is resolved." });
        setSaveState("errors");
        return;
      }
      await saveWorkingSet();
    }

    await pending.action();
  }

  async function refreshDbSets() {
    if (!(planningLifecycleService instanceof DbPlanningLifecycleClient)) {
      return;
    }
    const result = await planningLifecycleService.listPlanningSets();
    if (result.success) {
      setSavedDbSets(result.value);
    }
  }

  function openPersistedSet(set: PersistedPlanningSet) {
    setPersistedSet(set);
    setCompletedRecord(null);
    setServiceDate(set.serviceContext.serviceDate);
    setServiceLanguage(set.serviceContext.language);
    setPriest(set.serviceContext.priest.displayName);
    setOrganist(set.serviceContext.organist.displayName);
    const editableRows = set.rows.length ? set.rows.map((row, index) => fromPlanningRow(row, index + 1)) : [createEmptyRow(1, set.serviceContext.language)];
    setRows(editableRows);
    setNextRowId(editableRows.length + 1);
    setSaveState(set.completedAt ? "completed" : set.status === "working" ? "saved" : "finalized");
    setServiceError(null);
  }

  async function loadDbSet(setId: PlanningSetId) {
    if (!(planningLifecycleService instanceof DbPlanningLifecycleClient)) {
      return;
    }
    const result = await planningLifecycleService.loadPlanningSet(setId);
    if (result.success) {
      openPersistedSet(result.value);
      await refreshDbSets();
      return;
    }
    setServiceError(result.error);
    setSaveState("errors");
  }

  function startNewDbDraft() {
    if (runtimeMode !== "db") {
      return;
    }

    setPersistedSet(null);
    setCompletedRecord(null);
    setSavedWorkingSet(null);
    setServiceDate(getNextSunday());
    setServiceLanguage("czech");
    setPriest("");
    setOrganist("");
    setRows([createEmptyRow(1, "czech")]);
    setNextRowId(2);
    setServiceError(null);
    setSaveState("unsaved");
  }

  function markUnsaved() {
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateRow(id: number, changes: Partial<EditableRow>) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
    markUnsaved();
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, createEmptyRow(nextRowId, serviceLanguage)]);
    setNextRowId((currentId) => currentId + 1);
    markUnsaved();
  }

  function removeRow(id: number) {
    setRows((currentRows) => currentRows.filter((row) => row.id !== id));
    markUnsaved();
  }

  function moveRow(index: number, direction: -1 | 1) {
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

  async function saveWorkingSet() {
    if (!hasServiceContext) {
      setServiceError({
        code: "invalidInput",
        message: "Service context is required before saving a working set.",
        issues: [
          ...(!serviceDate ? [{ path: "serviceDate", message: "Service date is required." }] : []),
          ...(!priest.trim() ? [{ path: "priest", message: "Priest is required." }] : []),
          ...(!organist.trim() ? [{ path: "organist", message: "Organist is required." }] : []),
        ],
      });
      setSaveState("errors");
      return;
    }

    const result = await planningLifecycleService.saveWorkingSet({
      role: selectedRole,
      existingSetId: persistedSet?.status === "working" ? persistedSet.id : undefined,
      serviceContext: {
        serviceDate,
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

    setPersistedSet(result.value);
    setCompletedRecord(null);
    setServiceError(null);
    setSavedWorkingSet({
      serviceDate,
      serviceLanguage,
      priest,
      organist,
      rows: planningRows,
    });
    setSaveState("saved");
    await refreshDbSets();
  }

  async function finalizeWorkingSet() {
    if (!persistedSet || persistedSet.status !== "working") {
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

    setPersistedSet(result.value);
    setCompletedRecord(null);
    setServiceError(null);
    setSaveState("finalized");
    await refreshDbSets();
  }

  async function completeFinalSet() {
    if (!persistedSet || persistedSet.status !== "final") {
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

    setCompletedRecord(result.value);
    setPersistedSet({ ...persistedSet, completedAt: result.value.completedAt });
    setServiceError(null);
    setSaveState("completed");
    await refreshDbSets();
  }

  async function deletePersistedSet() {
    if (!persistedSet) {
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

        {runtimeMode === "db" && (
          <section className="db-workspace" aria-label="Saved DB planning sets">
            <div className="rows-header">
              <h2>Saved DB sets</h2>
              <button type="button" onClick={refreshDbSets}>Refresh list</button>
              <button type="button" onClick={() => runWithDirtyProtection("start a new set", startNewDbDraft)}>Start new set</button>
            </div>
            <p className="field-help">Working: {savedDbSets.filter((set) => set.status === "working" && !set.completedAt).length} · Final: {savedDbSets.filter((set) => set.status === "final" && !set.completedAt).length} · Completed: {savedDbSets.filter((set) => set.completedAt).length}</p>
            {(["working", "final", "completed"] as const).map((group) => {
              const groupedSets = savedDbSets.filter((set) =>
                group === "completed" ? set.completedAt : set.status === group && !set.completedAt,
              );
              return (
                <section key={group} aria-label={`${group} sets`}>
                  <h3>{group === "working" ? "Working" : group === "final" ? "Final" : "Completed"}</h3>
                  {groupedSets.length === 0 ? <p className="field-help">No {group} sets.</p> : (
                    <ul className="saved-set-list">
                      {groupedSets.map((set) => (
                        <li key={set.id}>
                          <button type="button" onClick={() => runWithDirtyProtection(`open set #${set.id}`, () => loadDbSet(set.id))}>
                            Open #{set.id}: {set.serviceContext.serviceDate}, {set.serviceContext.language}, priest {set.serviceContext.priest.displayName || "—"}, organist {set.serviceContext.organist.displayName || "—"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </section>
        )}

        <form className="planning-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="field-group">
            <legend>Service context</legend>
            <label>
              Service date
              <input
                type="date"
                value={serviceDate}
                disabled={!canEditContext}
                onChange={(event) => {
                  setServiceDate(event.target.value);
                  markUnsaved();
                }}
              />
            </label>
            <label>
              Service language
              <select
                value={serviceLanguage}
                disabled={!canEditContext}
                onChange={(event) => {
                  const nextLanguage = event.target.value as ServiceLanguage;
                  setServiceLanguage(nextLanguage);
                  setRows((currentRows) =>
                    currentRows.map((row) => ({
                      ...row,
                      songLanguage: row.songNumber.trim() || row.songLanguage ? row.songLanguage : defaultRowLanguage(nextLanguage),
                    })),
                  );
                  markUnsaved();
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
                value={priest}
                disabled={!canEditContext}
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
                value={organist}
                disabled={!canEditContext}
                onChange={(event) => {
                  setOrganist(event.target.value);
                  markUnsaved();
                }}
              />
            </label>
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
              Local in-memory dev selector only; lifecycle actions use this role for permission checks.
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
                        value={row.songLanguage}
                        disabled={!canEditRows}
                        onChange={(event) =>
                          updateRow(row.id, { songLanguage: event.target.value as EditableRow["songLanguage"] })
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
                        disabled={!canEditRows}
                        onChange={(event) => updateRow(row.id, { songNumber: event.target.value })}
                        placeholder="e.g. 42"
                      />
                    </label>
                    <label className="note-field">
                      Text note
                      <input
                        type="text"
                        value={row.note}
                        disabled={!canEditRows}
                        onChange={(event) => updateRow(row.id, { note: event.target.value })}
                        placeholder="Optional note without a song"
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
              disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || isCompletedSet}
            >
              Save working set
            </button>
            <button
              type="button"
              onClick={finalizeWorkingSet}
              disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors || isCompletedSet}
            >
              Finalize set
            </button>
            <button
              type="button"
              onClick={completeFinalSet}
              disabled={!canCompleteSet || !persistedSet || persistedSet.status !== "final" || !isServiceDateInPastOrToday || isCompletedSet}
            >
              Complete service
            </button>
            <button type="button" onClick={deletePersistedSet} disabled={!canDeleteCurrentSet || !persistedSet || isCompletedSet}>
              Delete saved set
            </button>
          </div>
        </form>

        {(!hasServiceContext || hasValidationErrors) && (
          <section className="error-summary" aria-live="polite">
            <strong>Missing:</strong>
            <ul>
              {missingRequiredFields.map((field) => <li key={field}>{field}</li>)}
              {hasValidationErrors && <li>valid rows</li>}
            </ul>
          </section>
        )}

        {persistedSet?.status === "final" && !isServiceDateInPastOrToday && !isCompletedSet && (
          <p className="field-help">Complete Service is available on or after the service date.</p>
        )}

        {isCompletedSet && <p className="field-help">Completed sets are read-only and remain available for review.</p>}

        {pendingNavigation && (
          <section className="error-summary" role="dialog" aria-modal="true" aria-label="Unsaved changes">
            <strong>Unsaved changes</strong>
            <p>Save or discard changes before you {pendingNavigation.label}.</p>
            <button type="button" onClick={() => confirmPendingNavigation("save")}>Save changes</button>
            <button type="button" onClick={() => confirmPendingNavigation("discard")}>Discard changes</button>
            <button type="button" onClick={() => confirmPendingNavigation("cancel")}>Cancel</button>
          </section>
        )}

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
