"use client";

import { useMemo, useState } from "react";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
  type CompletedServiceRecord,
  type PersistedPlanningSet,
  type PlanningSetId,
  type PlanningServiceError,
} from "../src/application/planning-lifecycle";
import type { ConcreteSongLanguage, PlanningRow, ServiceLanguage } from "../src/planning-lifecycle";
import { validatePlanningRow } from "../src/planning-lifecycle";

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

type PlanningRepositories = {
  planningSets: InMemoryPlanningSetRepository;
  completedServiceRecords: InMemoryCompletedServiceRecordRepository;
};

const serviceLanguageOptions: ServiceLanguage[] = ["czech", "polish", "mixed"];
const songLanguageOptions: ConcreteSongLanguage[] = ["czech", "polish"];

function createEmptyRow(id: number): EditableRow {
  return {
    id,
    songLanguage: "",
    songNumber: "",
    note: "",
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

export default function Home() {
  const repositories = useMemo<PlanningRepositories>(
    () => ({
      planningSets: new InMemoryPlanningSetRepository(),
      completedServiceRecords: new InMemoryCompletedServiceRecordRepository(),
    }),
    [],
  );
  const planningLifecycleService = useMemo(
    () =>
      new PlanningLifecycleService({
        planningSets: repositories.planningSets,
        completedServiceRecords: repositories.completedServiceRecords,
      }),
    [repositories],
  );
  const [serviceDate, setServiceDate] = useState("");
  const [serviceLanguage, setServiceLanguage] = useState<ServiceLanguage>("czech");
  const [priest, setPriest] = useState("");
  const [organist, setOrganist] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([createEmptyRow(1)]);
  const [nextRowId, setNextRowId] = useState(2);
  const [saveState, setSaveState] = useState<SaveState>("unsaved");
  const [savedWorkingSet, setSavedWorkingSet] = useState<WorkingSetSnapshot | null>(null);
  const [persistedSet, setPersistedSet] = useState<PersistedPlanningSet | null>(null);
  const [completedRecord, setCompletedRecord] = useState<CompletedServiceRecord | null>(null);
  const [serviceError, setServiceError] = useState<PlanningServiceError | null>(null);

  const planningRows = useMemo(() => rows.map(toPlanningRow), [rows]);
  const validationResults = useMemo(() => planningRows.map(validatePlanningRow), [planningRows]);
  const hasValidationErrors = validationResults.some((result) => !result.valid);

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
    setRows((currentRows) => [...currentRows, createEmptyRow(nextRowId)]);
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
    const result = await planningLifecycleService.saveWorkingSet({
      role: "priest",
      existingSetId: persistedSet?.status === "working" ? persistedSet.id : undefined,
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
  }

  async function finalizeWorkingSet() {
    if (!persistedSet || persistedSet.status !== "working") {
      return;
    }

    const result = await planningLifecycleService.finalizeWorkingSet({
      role: "priest",
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
  }

  async function completeFinalSet() {
    if (!persistedSet || persistedSet.status !== "final") {
      return;
    }

    const result = await planningLifecycleService.completeFinalSet({
      role: "priest",
      finalSetId: persistedSet.id,
    });

    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return;
    }

    setCompletedRecord(result.value);
    setPersistedSet(null);
    setServiceError(null);
    setSaveState("completed");
  }

  async function deletePersistedSet() {
    if (!persistedSet) {
      return;
    }

    const deletedSetId: PlanningSetId = persistedSet.id;
    const result = await planningLifecycleService.deletePlanningSet({
      role: "priest",
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
  }

  return (
    <main className="shell">
      <section className="card planning-card" aria-labelledby="page-title">
        <p className="eyebrow">Planning Lifecycle First</p>
        <h1 id="page-title">Working service set</h1>
        <p className="lede">Build a minimal in-memory set before persistence or final UX exists.</p>

        <div className={`status status-${saveState}`} role="status">
          {saveState === "unsaved" && "Unsaved"}
          {saveState === "saved" && "Saved in memory"}
          {saveState === "finalized" && "Finalized in memory"}
          {saveState === "completed" && "Completed in memory"}
          {saveState === "deleted" && "Deleted from memory"}
          {saveState === "errors" && "Validation errors"}
        </div>

        <form className="planning-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="field-group">
            <legend>Service context</legend>
            <label>
              Service date
              <input
                type="date"
                value={serviceDate}
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
                onChange={(event) => {
                  setServiceLanguage(event.target.value as ServiceLanguage);
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
                onChange={(event) => {
                  setOrganist(event.target.value);
                  markUnsaved();
                }}
              />
            </label>
          </fieldset>

          <div className="rows-header">
            <h2>Rows</h2>
            <button type="button" onClick={addRow}>
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
                    <button type="button" onClick={() => moveRow(index, -1)} disabled={index === 0}>
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(index, 1)}
                      disabled={index === rows.length - 1}
                    >
                      Move down
                    </button>
                    <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1}>
                      Remove
                    </button>
                  </div>
                  <div className="row-fields">
                    <label>
                      Song language
                      <select
                        value={row.songLanguage}
                        onChange={(event) =>
                          updateRow(row.id, { songLanguage: event.target.value as EditableRow["songLanguage"] })
                        }
                      >
                        <option value="">No song</option>
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
                      />
                    </label>
                    <label className="note-field">
                      Text note
                      <input
                        type="text"
                        value={row.note}
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
            <button className="save-button" type="button" onClick={saveWorkingSet}>
              Save working set
            </button>
            <button
              type="button"
              onClick={finalizeWorkingSet}
              disabled={!persistedSet || persistedSet.status !== "working" || hasValidationErrors}
            >
              Finalize set
            </button>
            <button type="button" onClick={completeFinalSet} disabled={!persistedSet || persistedSet.status !== "final"}>
              Complete service
            </button>
            <button type="button" onClick={deletePersistedSet} disabled={!persistedSet}>
              Delete saved set
            </button>
          </div>
        </form>

        {serviceError && (
          <p className="error-summary">
            {serviceError.message}
            {serviceError.issues?.length ? ` ${serviceError.issues.map((issue) => issue.message).join(" ")}` : ""}
          </p>
        )}

        {persistedSet && (
          <p className="saved-summary">
            Current in-memory set: {persistedSet.id} ({persistedSet.status}, {persistedSet.rows.length} row
            {persistedSet.rows.length === 1 ? "" : "s"}).
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
