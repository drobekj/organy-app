"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogService, InMemoryCatalogRepository, type CatalogPerson, type CatalogSong, type PersonRole } from "../src/application/catalog";
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
import { enrichRowsWithCurrentSheetMusic, getCatalogLanguageDeviationRowNumbers, preserveRowsOnServiceLanguageChange } from "../src/planning-lifecycle/catalog-ui";
import {
  formatDateInputValue,
  getDefaultServiceLanguage,
  getNearestSunday,
} from "../src/planning-lifecycle/service-context-defaults";
import { canMutatePlanningEditor, clearLastSavedRecordOnOpen, getDraftPeopleDefaults, recordListClassName, type DraftPeopleDefaults, type PersistedRecordReference } from "../src/planning-lifecycle/ui-session";

type EditableRow = {
  id: number;
  songSearch: string;
  selectedSong?: CatalogSong | { songId?: string; language: ConcreteSongLanguage; number: string; title?: string };
  note: string;
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

type CatalogClient = CatalogService | DbCatalogClient;

type PlanningRepositories = {
  planningSets: InMemoryPlanningSetRepository;
  completedServiceRecords: InMemoryCompletedServiceRecordRepository;
};

const serviceLanguageOptions: ServiceLanguage[] = ["czech", "polish", "mixed"];
const defaultServiceTime = "10:00";

const localRoleOptions: PlanningRole[] = ["priest", "organist", "admin", "congregationMember"];

function createEmptyRow(id: number, _serviceLanguage: ServiceLanguage): EditableRow {
  return {
    id,
    songSearch: "",
    note: "",
  };
}


function fromPlanningRow(row: PlanningRow, id: number): EditableRow {
  return {
    id,
    songSearch: row.song ? formatSongLabel(row.song) : "",
    selectedSong: row.song ? { ...row.song } : undefined,
    note: row.note ?? "",
  };
}

function toPlanningRow(row: EditableRow): PlanningRow {
  const note = row.note.trim();
  return {
    ...(row.selectedSong
      ? {
          song: {
            ...(row.selectedSong.songId ? { songId: row.selectedSong.songId } : {}),
            language: row.selectedSong.language,
            number: row.selectedSong.number,
            ...(row.selectedSong.title ? { title: row.selectedSong.title } : {}),
          },
        }
      : {}),
    ...(note ? { note } : {}),
  };
}

function formatSongLabel(song: { language: ConcreteSongLanguage; number: string; title?: string }): string {
  return `${song.language} ${song.number}${song.title ? ` — ${song.title}` : ""}`;
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


class DbCatalogClient {
  async getPerson(input: { id: string }) { return callCatalogApi("getPerson", input); }
  async getSong(input: { songId: string }) { return callCatalogApi("getSong", input); }
  async searchPeople(input: { role: PersonRole; query?: string }) { return callCatalogApi("searchPeople", input); }
  async listPeople() { return callCatalogApi("listPeople", {}); }
  async savePerson(input: { role: PlanningRole; person: Omit<CatalogPerson, "id"> & { id?: string } }) { return callCatalogApi("savePerson", input); }
  async searchSongs(input: { language: ServiceLanguage; query?: string }) { return callCatalogApi("searchSongs", input); }
  async listSongs() { return callCatalogApi("listSongs", {}); }
  async setSongActive(input: { role: PlanningRole; songId: string; active: boolean }) { return callCatalogApi("setSongActive", input); }
}

async function callCatalogApi(action: string, input: unknown) {
  const response = await fetch("/api/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input }) });
  const payload = await response.json();
  if (!response.ok) return { success: false as const, error: { code: "invalidInput" as const, message: typeof payload?.error === "string" ? payload.error : "Catalog API request failed." } };
  return payload;
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
  const catalogRepository = useMemo(() => new InMemoryCatalogRepository(), []);
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
            catalog: catalogRepository,
          }),
    [repositories, runtimeMode, catalogRepository],
  );
  const catalogClient = useMemo<CatalogClient>(() => runtimeMode === "db" ? new DbCatalogClient() : new CatalogService(catalogRepository), [runtimeMode, catalogRepository]);
  const initialServiceSunday = useMemo(() => getNearestSunday(new Date()), []);
  const initialServiceDate = useMemo(() => formatDateInputValue(initialServiceSunday), [initialServiceSunday]);
  const initialServiceLanguage = useMemo(() => getDefaultServiceLanguage(initialServiceSunday), [initialServiceSunday]);
  const [serviceDate, setServiceDate] = useState(initialServiceDate);
  const [serviceTime, setServiceTime] = useState(defaultServiceTime);
  const [serviceLanguage, setServiceLanguage] = useState<ServiceLanguage>(initialServiceLanguage);
  const [priest, setPriest] = useState("");
  const [priestId, setPriestId] = useState<string | undefined>(undefined);
  const [priestResults, setPriestResults] = useState<CatalogPerson[]>([]);
  const [organist, setOrganist] = useState("");
  const [organistId, setOrganistId] = useState<string | undefined>(undefined);
  const [organistResults, setOrganistResults] = useState<CatalogPerson[]>([]);
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
  const [draftPeopleDefaults, setDraftPeopleDefaults] = useState<DraftPeopleDefaults>({ priest: { displayName: "" }, organist: { displayName: "" } });
  const [songResults, setSongResults] = useState<Record<number, CatalogSong[]>>({});
  const [peopleAdmin, setPeopleAdmin] = useState<CatalogPerson[]>([]);
  const [songsAdmin, setSongsAdmin] = useState<CatalogSong[]>([]);
  const [personForm, setPersonForm] = useState({ displayName: "", priest: true, organist: false, active: true });

  useEffect(() => {
    void refreshDbSets();
  }, [runtimeMode]);

  useEffect(() => {
    void refreshCatalogAdmin();
  }, [selectedRole, runtimeMode]);

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
  const hasServiceContext = Boolean(serviceDate && isValidServiceTime(serviceTime) && priest.trim() && organist.trim() && priestId && organistId);
  const isFinalSetOpen = persistedSet?.status === "final";
  const canMutateEditor = canMutatePlanningEditor({ isFinalSetOpen, isCompletedRecordOpen, selectedRole });
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
  const canEditCompletedRecord = isCompletedRecordOpen && selectedRole === "admin";
  const canEditRows = canMutateEditor && (canEditCompletedRecord || (!isCompletedRecordOpen && !isFinalSetOpen && (!persistedSet || persistedSet.status === "working" ? canSaveWorkingSet : false)));


  async function getEligibleDraftPeopleDefaults(records: CompletedServiceRecord[]): Promise<DraftPeopleDefaults> {
    const defaults = getDraftPeopleDefaults(records);
    const [priestResult, organistResult] = await Promise.all([
      defaults.priest.id ? catalogClient.getPerson({ id: defaults.priest.id }) : Promise.resolve({ success: false as const, error: { code: "notFound" as const, message: "No default priest." } }),
      defaults.organist.id ? catalogClient.getPerson({ id: defaults.organist.id }) : Promise.resolve({ success: false as const, error: { code: "notFound" as const, message: "No default organist." } }),
    ]);
    const priest = priestResult.success && priestResult.value.active && priestResult.value.priest ? { id: priestResult.value.id, displayName: priestResult.value.displayName } : { displayName: "" };
    const organist = organistResult.success && organistResult.value.active && organistResult.value.organist ? { id: organistResult.value.id, displayName: organistResult.value.displayName } : { displayName: "" };
    return { priest, organist };
  }

  async function refreshDbSets() {
    const result = await planningLifecycleService.listPlanningSets();
    const completedResult = await planningLifecycleService.listCompletedRecords();
    const activeSets = result.success ? result.value : savedDbSets;
    const completed = completedResult.success ? completedResult.value : completedRecords;
    const defaults = await getEligibleDraftPeopleDefaults(completed);

    if (result.success) setSavedDbSets(activeSets);
    if (completedResult.success) {
      setCompletedRecords(completed);
      setDraftPeopleDefaults(defaults);
    }

    return { activeSets, completedRecords: completed, draftPeopleDefaults: defaults };
  }


  async function refreshCatalogAdmin() {
    if (selectedRole !== "admin") return;
    const [people, songs] = await Promise.all([catalogClient.listPeople(), catalogClient.listSongs()]);
    if (people.success) setPeopleAdmin(people.value);
    if (songs.success) setSongsAdmin(songs.value);
  }


  async function applyAdminCatalogResult<T>(result: { success: true; value: T } | { success: false; error: PlanningServiceError }) {
    if (!result.success) {
      setServiceError(result.error);
      setSaveState("errors");
      return false;
    }
    setServiceError(null);
    await refreshCatalogAdmin();
    return true;
  }

  async function saveAdminPerson(person: Omit<CatalogPerson, "id"> & { id?: string }) {
    return applyAdminCatalogResult(await catalogClient.savePerson({ role: selectedRole, person }));
  }

  async function toggleAdminSong(song: CatalogSong) {
    return applyAdminCatalogResult(await catalogClient.setSongActive({ role: selectedRole, songId: song.songId, active: !song.active }));
  }

  async function openPersistedSet(set: PersistedPlanningSet) {
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
    setRows(await enrichRowsWithCurrentSheetMusic(editableRows, { findSongById: async (songId) => { const result = await catalogClient.getSong({ songId }); return result.success ? result.value : undefined; } }));
    setNextRowId(editableRows.length + 1);
    setSaveState(set.status === "working" ? "saved" : "finalized");
    setLastSavedRecord(clearLastSavedRecordOnOpen());
    setServiceError(null);
  }

  async function openCompletedRecord(record: CompletedServiceRecord) {
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
    setRows(await enrichRowsWithCurrentSheetMusic(editableRows, { findSongById: async (songId) => { const result = await catalogClient.getSong({ songId }); return result.success ? result.value : undefined; } }));
    setNextRowId(editableRows.length + 1);
    setSaveState("completed");
    setLastSavedRecord(clearLastSavedRecordOnOpen());
    setServiceError(null);
  }

  async function loadCompletedRecord(recordId: string) {
    const result = await planningLifecycleService.loadCompletedRecord(recordId);
    if (result.success) {
      await openCompletedRecord(result.value);
      await refreshDbSets();
      return;
    }
    setServiceError(result.error);
    setSaveState("errors");
  }

  async function loadDbSet(setId: PlanningSetId) {
    const result = await planningLifecycleService.loadPlanningSet(setId);
    if (result.success) {
      await openPersistedSet(result.value);
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

  async function updatePersonSearch(role: PersonRole, value: string) {
    guardedEditorUpdate(() => {
      if (role === "priest") { setPriest(value); setPriestId(undefined); }
      else { setOrganist(value); setOrganistId(undefined); }
    });
    const result = await catalogClient.searchPeople({ role, query: value });
    if (result.success) role === "priest" ? setPriestResults(result.value) : setOrganistResults(result.value);
  }

  function selectPerson(role: PersonRole, person: CatalogPerson) {
    guardedEditorUpdate(() => {
      if (role === "priest") { setPriest(person.displayName); setPriestId(person.id); setPriestResults([]); }
      else { setOrganist(person.displayName); setOrganistId(person.id); setOrganistResults([]); }
    });
  }

  async function updateSongSearch(rowId: number, value: string) {
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? { ...row, songSearch: value, selectedSong: undefined } : row)));
    const result = await catalogClient.searchSongs({ language: serviceLanguage, query: value });
    if (result.success) setSongResults((current) => ({ ...current, [rowId]: result.value }));
  }

  function selectSong(rowId: number, song: CatalogSong) {
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? { ...row, songSearch: formatSongLabel(song), selectedSong: song } : row)));
    setSongResults((current) => ({ ...current, [rowId]: [] }));
  }

  function clearSong(rowId: number) {
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? { ...row, songSearch: "", selectedSong: undefined } : row)));
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
      setRows((currentRows) => preserveRowsOnServiceLanguageChange(currentRows, nextServiceLanguage));
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
          ...(!priestId ? [{ path: "priest", message: "Priest must be selected from lookup." }] : []),
          ...(!organistId ? [{ path: "organist", message: "Organist must be selected from lookup." }] : []),
        ],
      });
      setSaveState("errors");
      return;
    }

    const languageDeviationRows = getCatalogLanguageDeviationRowNumbers(planningRows, serviceLanguage);
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


  async function saveCompletedChanges() {
    if (!completedRecord || selectedRole !== "admin") return;

    const languageDeviationRows = getCatalogLanguageDeviationRowNumbers(planningRows, serviceLanguage);
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

    setLastSavedRecord({ kind: "completed", id: result.value.id });
    setServiceError(null);
    setSaveState("completed");
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
  }

  async function deleteCompletedRecord() {
    if (!completedRecord || selectedRole !== "admin") return;
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
            <button type="button" onClick={startNewDbDraft}>Start new set</button>
          </div>
          {savedDbSets.length === 0 ? (
            <p className="field-help">No active planning sets saved yet.</p>
          ) : (
            <ul className="saved-set-list">
              {savedDbSets.map((set) => (
                <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}>
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
                <li key={record.id} className={recordListClassName(completedRecord?.id === record.id, lastSavedRecord?.kind === "completed" && lastSavedRecord.id === record.id)}>
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
              Priest lookup
              <input
                type="text"
                placeholder="Search active priests"
                disabled={isEditorLocked}
                value={priest}
                onChange={(event) => { void updatePersonSearch("priest", event.target.value); }}
              />
              <span className="field-help">{priestId ? `Selected catalog ID: ${priestId}` : priest ? "Search text only — choose a catalog priest before saving." : "No priest selected."}</span>
              {priestResults.length > 0 && !isEditorLocked && (
                <ul className="lookup-list">
                  {priestResults.map((person) => <li key={person.id}><button type="button" onClick={() => selectPerson("priest", person)}>{person.displayName}</button></li>)}
                </ul>
              )}
            </label>
            <label>
              Organist lookup
              <input
                type="text"
                placeholder="Search active organists"
                disabled={isEditorLocked}
                value={organist}
                onChange={(event) => { void updatePersonSearch("organist", event.target.value); }}
              />
              <span className="field-help">{organistId ? `Selected catalog ID: ${organistId}` : organist ? "Search text only — choose a catalog organist before saving." : "No organist selected."}</span>
              {organistResults.length > 0 && !isEditorLocked && (
                <ul className="lookup-list">
                  {organistResults.map((person) => <li key={person.id}><button type="button" onClick={() => selectPerson("organist", person)}>{person.displayName}</button></li>)}
                </ul>
              )}
            </label>
          </fieldset>

          <fieldset className="field-group local-role-block">
            <legend>Local role simulation</legend>
            <label>
              Local role
              <select
                value={selectedRole}
                onChange={(event) => {
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
                      Song lookup
                      <input
                        type="text"
                        value={row.songSearch}
                        onChange={(event) => { void updateSongSearch(row.id, event.target.value); }}
                        placeholder="Search by number or title"
                        disabled={!canEditRows}
                      />
                      {row.selectedSong ? (
                        <span className="field-help">
                          Selected: {formatSongLabel(row.selectedSong)}{row.selectedSong.songId ? ` (ID ${row.selectedSong.songId})` : " — legacy snapshot without catalog ID"}
                          {"sheetMusicUrl" in row.selectedSong && row.selectedSong.sheetMusicUrl ? <> · <a href={row.selectedSong.sheetMusicUrl} target="_blank" rel="noopener noreferrer">Sheet music</a></> : null}
                        </span>
                      ) : row.songSearch ? <span className="field-help">Search text only — choose a catalog song before saving, or clear it for a note-only row.</span> : <span className="field-help">No song selected; use the note field for note-only rows.</span>}
                      {row.selectedSong && canEditRows && <button type="button" onClick={() => clearSong(row.id)}>Clear song</button>}
                      {(songResults[row.id]?.length ?? 0) > 0 && canEditRows && (
                        <ul className="lookup-list">
                          {songResults[row.id].map((song) => (
                            <li key={song.songId}>
                              <button type="button" onClick={() => selectSong(row.id, song)}>{formatSongLabel(song)}</button>
                              {song.sheetMusicUrl ? <> <a href={song.sheetMusicUrl} target="_blank" rel="noopener noreferrer">Sheet music</a></> : null}
                            </li>
                          ))}
                        </ul>
                      )}
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
                    <button className="save-button" type="button" onClick={saveCompletedChanges} disabled={!hasServiceContext || hasValidationErrors}>
                      Save completed changes
                    </button>
                    <button type="button" onClick={deleteCompletedRecord}>Delete completed record</button>
                  </>
                )}
              </>
          </div>
          {completeDateReason && <p className="field-help">Complete service disabled: {completeDateReason}</p>}
        </form>


        {selectedRole === "admin" && (
          <section className="db-workspace" aria-label="Catalog administration">
            <div className="rows-header"><h2>Catalog administration</h2><button type="button" onClick={refreshCatalogAdmin}>Refresh catalog</button></div>
            <fieldset className="field-group">
              <legend>People</legend>
              <label>Display name<input value={personForm.displayName} onChange={(event) => setPersonForm({ ...personForm, displayName: event.target.value })} /></label>
              <label><input type="checkbox" checked={personForm.priest} onChange={(event) => setPersonForm({ ...personForm, priest: event.target.checked })} /> Priest role</label>
              <label><input type="checkbox" checked={personForm.organist} onChange={(event) => setPersonForm({ ...personForm, organist: event.target.checked })} /> Organist role</label>
              <label><input type="checkbox" checked={personForm.active} onChange={(event) => setPersonForm({ ...personForm, active: event.target.checked })} /> Active</label>
              <button type="button" onClick={async () => { if (await saveAdminPerson(personForm)) setPersonForm({ displayName: "", priest: true, organist: false, active: true }); }}>Add person</button>
              <ul className="saved-set-list">
                {peopleAdmin.map((person) => (
                  <li key={person.id}>{person.displayName} ({person.active ? "active" : "inactive"}; {person.priest ? "priest" : ""} {person.organist ? "organist" : ""})
                    <button type="button" onClick={async () => { await saveAdminPerson({ ...person, active: !person.active }); }}>{person.active ? "Deactivate" : "Activate"}</button>
                    <button type="button" onClick={async () => { const displayName = window.prompt("Display name", person.displayName); if (displayName) await saveAdminPerson({ ...person, displayName }); }}>Rename</button>
                    <button type="button" onClick={async () => { await saveAdminPerson({ ...person, priest: !person.priest }); }}>Toggle priest</button>
                    <button type="button" onClick={async () => { await saveAdminPerson({ ...person, organist: !person.organist }); }}>Toggle organist</button>
                  </li>
                ))}
              </ul>
            </fieldset>
            <fieldset className="field-group">
              <legend>Songs</legend>
              <ul className="saved-set-list">
                {songsAdmin.map((song) => <li key={song.songId}>{formatSongLabel(song)} ({song.active ? "active" : "inactive"}) {song.sheetMusicUrl ? <a href={song.sheetMusicUrl} target="_blank" rel="noopener noreferrer">Sheet music</a> : null} <button type="button" onClick={async () => { await toggleAdminSong(song); }}>{song.active ? "Deactivate" : "Activate"}</button></li>)}
              </ul>
            </fieldset>
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
