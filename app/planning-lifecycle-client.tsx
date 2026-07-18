"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogService, InMemoryCatalogRepository, type CatalogPerson, type CatalogSong, type PersonRole } from "../src/application/catalog";
import { InMemoryInteractionRepository, canAddOrPersistRows, canLeaveWorkspace, type ActorIdentity, restoreLookupOnCancel, restoreRowsForRowSwitch, type CandidateQueryResult } from "../src/application/interaction-contracts";
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
import { CatalogLookupRequestTracker, clearSongLookupResultsOnServiceLanguageChange, confirmLanguageDeviationSave, enrichRowsWithCurrentSheetMusic, getPersonLookupScope, getSongLookupScope, preserveRowsOnServiceLanguageChange } from "../src/planning-lifecycle/catalog-ui";
import { getCandidatePopupRows, getSelectedSongPresentation } from "../src/planning-lifecycle/candidate-flow";
import {
  formatDateInputValue,
  getDefaultServiceLanguage,
  getNearestSunday,
} from "../src/planning-lifecycle/service-context-defaults";
import { canMutatePlanningEditor, clearLastSavedRecordOnOpen, getDraftPeopleDefaults, recordListClassName, type DraftPeopleDefaults } from "../src/planning-lifecycle/ui-session";
import { formatCompletedRecordSummary, formatPlanningSetSummary, getSafeWorkspace, getWorkspaceAfterComplete, getWorkspaceAfterCompletedUpdate, getWorkspaceAfterDelete, getWorkspaceAfterFinalize, getWorkspaceAfterOpenRecord, getWorkspaceAfterSaveWorking, getWorkspaceAfterStartNewSet, getWorkspaceLabel, groupActivePlanningSets, type PersistedRecordReference, type Workspace } from "../src/planning-lifecycle/workspace";

type EditableRow = {
  id: number;
  songSearch: string;
  selectedSong?: CatalogSong | { songId?: string; language: ConcreteSongLanguage; number: string; title?: string };
  selectedCandidate?: CandidateQueryResult;
  note: string;
  lookupOpen?: boolean;
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
type InteractionClient = { saveOwnPreference(input: { actor: ActorIdentity; songId: string; score: number }): Promise<unknown>; setRepertoire(input: { actor: ActorIdentity; organistPersonId: string; songId: string; active: boolean }): Promise<unknown>; setMelodyWindow(input: { actor: ActorIdentity; daysBefore: number; daysAfter: number }): Promise<unknown>; queryCandidates(input: { songs: CatalogSong[]; serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; recentSongIds: string[]; recentSongs: { songId: string; serviceDate: string }[] }): Promise<CandidateQueryResult[]>; };

type PlanningRepositories = {
  planningSets: InMemoryPlanningSetRepository;
  completedServiceRecords: InMemoryCompletedServiceRecordRepository;
};

const serviceLanguageOptions: ServiceLanguage[] = ["czech", "polish", "mixed"];
const defaultServiceTime = "10:00";


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

function candidateFromSelectedSong(song: { songId?: string; language: ConcreteSongLanguage; number: string; title?: string }): CandidateQueryResult {
  return {
    songId: song.songId ?? `historical:${song.language}:${song.number}`,
    language: song.language,
    number: song.number,
    title: song.title ?? "Untitled snapshot",
    equivalentNumbers: [],
    aggregatePreferenceScore: 0,
    antiphonMatch: false,
    seasonMatch: false,
    signal: "none",
    preferenceShade: "none",
    repertoire: false,
    suppressedByMelodyWindow: false,
    orderKey: `${song.language}:${song.number}`,
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


class DbInteractionClient implements InteractionClient {
  async saveOwnPreference(input: { actor: ActorIdentity; songId: string; score: number }) { return callInteractionApi("saveOwnPreference", input); }
  async setRepertoire(input: { actor: ActorIdentity; organistPersonId: string; songId: string; active: boolean }) { return callInteractionApi("setRepertoire", input); }
  async setMelodyWindow(input: { actor: ActorIdentity; daysBefore: number; daysAfter: number }) { return callInteractionApi("setMelodyWindow", input); }
  async queryCandidates(input: { songs: CatalogSong[]; serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; recentSongIds: string[]; recentSongs: { songId: string; serviceDate: string }[] }) { const result = await callInteractionApi("queryCandidates", { serviceDate: input.serviceDate, serviceLanguage: input.serviceLanguage, organistPersonId: input.organistPersonId, antiphonKey: "synthetic-entry", liturgicalSeasonKey: "synthetic-advent", recentSongIds: input.recentSongIds, recentSongs: input.recentSongs }); return result.success ? result.value as CandidateQueryResult[] : []; }
}

class MemoryInteractionClient implements InteractionClient {
  constructor(private readonly repo: InMemoryInteractionRepository) {}
  async saveOwnPreference(input: { actor: ActorIdentity; songId: string; score: number }) { return this.repo.saveOwnPreference(input.actor, input.songId, input.score); }
  async setRepertoire(input: { actor: ActorIdentity; organistPersonId: string; songId: string; active: boolean }) { return this.repo.setRepertoire(input.actor, input.organistPersonId, input.songId, input.active); }
  async setMelodyWindow(input: { actor: ActorIdentity; daysBefore: number; daysAfter: number }) { return this.repo.setMelodyWindow(input.actor, { daysBefore: input.daysBefore, daysAfter: input.daysAfter }); }
  async queryCandidates(input: { songs: CatalogSong[]; serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; recentSongIds: string[]; recentSongs: { songId: string; serviceDate: string }[] }) { return this.repo.queryCandidates(input.songs, { serviceDate: input.serviceDate, serviceLanguage: input.serviceLanguage, organistPersonId: input.organistPersonId, antiphonKey: "synthetic-entry", liturgicalSeasonKey: "synthetic-advent", recentSongIds: input.recentSongIds, recentSongs: input.recentSongs }); }
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

async function callInteractionApi(action: string, input: unknown) {
  const response = await fetch("/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input }) });
  const payload = await response.json();
  if (!response.ok) return { success: false as const, error: { code: "invalidInput" as const, message: typeof payload?.error === "string" ? payload.error : "Interaction API request failed." } };
  return payload;
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
  const interactionRepository = useMemo(() => new InMemoryInteractionRepository(), []);
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
  const interactionClient = useMemo<InteractionClient>(() => runtimeMode === "db" ? new DbInteractionClient() : new MemoryInteractionClient(interactionRepository), [runtimeMode, interactionRepository]);
  const lookupTracker = useMemo(() => new CatalogLookupRequestTracker(), []);
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
  const [serviceNote, setServiceNote] = useState("");
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
  const [candidateResults, setCandidateResults] = useState<Record<number, CandidateQueryResult[]>>({});
  const [peopleAdmin, setPeopleAdmin] = useState<CatalogPerson[]>([]);
  const [songsAdmin, setSongsAdmin] = useState<CatalogSong[]>([]);
  const [candidateDetails, setCandidateDetails] = useState<CandidateQueryResult | null>(null);
  const [selectedCatalogTab, setSelectedCatalogTab] = useState<"songs" | "people" | "knowledge">("songs");
  const [catalogSongLanguage, setCatalogSongLanguage] = useState<ServiceLanguage>("mixed");
  const [catalogSongSearch, setCatalogSongSearch] = useState("");
  const [catalogSongPage, setCatalogSongPage] = useState(0);
  const [selectedCatalogSongId, setSelectedCatalogSongId] = useState<string | null>(null);
  const [catalogReturnRowId, setCatalogReturnRowId] = useState<number | null>(null);
  const [personForm, setPersonForm] = useState({ displayName: "", priest: true, organist: false, active: true });
  const [workspace, setWorkspace] = useState<Workspace>("planning");
  const demoUsers = useMemo(() => interactionRepository.listUsers().map((user) => ({ id: user.id, label: user.displayName, role: user.roles[0] })), [interactionRepository]);
  const [selectedUserId, setSelectedUserId] = useState("demo-priest-user");
  const activeActor: ActorIdentity = interactionRepository.resolveActor(selectedUserId) ?? interactionRepository.resolveActor("demo-priest-user")!;
  const selectedRole = activeActor.role;
  const activeUser = { id: activeActor.userId, label: activeActor.displayName, role: activeActor.role };

  useEffect(() => {
    void refreshDbSets();
  }, [runtimeMode]);

  useEffect(() => {
    void refreshCatalogAdmin();
    void catalogClient.searchPeople({ role: "priest", query: "" }).then((r) => { if (r.success) setPriestResults(r.value); });
    void catalogClient.searchPeople({ role: "organist", query: "" }).then((r) => { if (r.success) setOrganistResults(r.value); });
  }, [selectedRole, runtimeMode, catalogClient]);

  useEffect(() => {
    if (!persistedSet && !completedRecord && saveState === "unsaved") {
      setPriest(draftPeopleDefaults.priest.displayName);
      setPriestId(draftPeopleDefaults.priest.id);
      setOrganist(draftPeopleDefaults.organist.displayName);
      setOrganistId(draftPeopleDefaults.organist.id);
    }
  }, [draftPeopleDefaults]);

  const planningRows = useMemo(() => rows.map(toPlanningRow), [rows]);
  const activeRecordGroups = useMemo(() => groupActivePlanningSets(savedDbSets), [savedDbSets]);
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
  const rowLookupStates = rows.map((row) => row.lookupOpen && row.songSearch.trim() && !row.selectedSong ? { kind: "lookup" as const, text: row.songSearch } : row.selectedSong?.songId ? { kind: "selected" as const, songId: row.selectedSong.songId } : row.note.trim() ? { kind: "noteOnly" as const, note: row.note } : { kind: "empty" as const });
  const hasInvalidLookupState = !canAddOrPersistRows(rowLookupStates);
  const workspaceLeaveState = canLeaveWorkspace(rowLookupStates);
  const syntheticScaleSongs = useMemo(() => interactionRepository.createSyntheticScaleSongs(1600), [interactionRepository]);
  const catalogSongPool = useMemo(() => [...songsAdmin, ...syntheticScaleSongs], [songsAdmin, syntheticScaleSongs]);
  const visibleCatalogSongs = useMemo(() => {
    const q = catalogSongSearch.trim().toLowerCase();
    const allowedLanguages = new Set(catalogSongLanguage === "mixed" ? ["czech", "polish"] : [catalogSongLanguage]);
    return catalogSongPool.filter((song) => allowedLanguages.has(song.language) && (selectedRole === "admin" || song.active) && (!q || song.number.toLowerCase().includes(q) || song.title.toLowerCase().includes(q)));
  }, [catalogSongPool, catalogSongLanguage, catalogSongSearch, selectedRole]);
  const catalogPageSize = 40;
  const catalogPageCount = Math.max(1, Math.ceil(visibleCatalogSongs.length / catalogPageSize));
  const pagedCatalogSongs = visibleCatalogSongs.slice(catalogSongPage * catalogPageSize, (catalogSongPage + 1) * catalogPageSize);
  const selectedCatalogSong = selectedCatalogSongId ? catalogSongPool.find((song) => song.songId === selectedCatalogSongId) : undefined;

  useEffect(() => {
    setWorkspace((current) => getSafeWorkspace(current, selectedRole));
  }, [selectedRole]);


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
    setServiceNote(set.serviceContext.note ?? "");
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
    setServiceNote(record.serviceContext.note ?? "");
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
      setWorkspace(getWorkspaceAfterOpenRecord());
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
      setWorkspace(getWorkspaceAfterOpenRecord());
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
    setServiceNote("");
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
    setServiceNote("");
    setRows([createEmptyRow(1, initialServiceLanguage)]);
    setNextRowId(2);
    setServiceError(null);
    setSaveState("unsaved");
    setWorkspace(getWorkspaceAfterStartNewSet());
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
    const scope = getPersonLookupScope(role);
    const token = lookupTracker.begin(scope, value);
    guardedEditorUpdate(() => {
      if (role === "priest") { setPriest(value); setPriestId(undefined); }
      else { setOrganist(value); setOrganistId(undefined); }
    });
    const result = await catalogClient.searchPeople({ role, query: value });
    if (!lookupTracker.isCurrent(token, value)) return;
    if (result.success) role === "priest" ? setPriestResults(result.value) : setOrganistResults(result.value);
  }

  function selectPerson(role: PersonRole, person: CatalogPerson) {
    lookupTracker.invalidate(getPersonLookupScope(role));
    guardedEditorUpdate(() => {
      if (role === "priest") { setPriest(person.displayName); setPriestId(person.id); }
      else { setOrganist(person.displayName); setOrganistId(person.id); }
    });
  }

  function getRecentCompletedSongIds(): string[] { return completedRecords.flatMap((record) => record.set.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : [])); }
  function getRecentCompletedSongs(): { songId: string; serviceDate: string }[] { return completedRecords.flatMap((record) => record.set.rows.flatMap((row) => row.song?.songId ? [{ songId: row.song.songId, serviceDate: record.serviceContext.serviceDate }] : [])); }

  async function updateSongSearch(rowId: number, value: string) {
    const scope = getSongLookupScope(rowId);
    const languageAtRequest = serviceLanguage;
    const token = lookupTracker.begin(scope, `${languageAtRequest}:${value}`);
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? { ...row, songSearch: value, selectedSong: undefined, lookupOpen: Boolean(value.trim()) } : row)));
    const result = await catalogClient.searchSongs({ language: languageAtRequest, query: value });
    if (!lookupTracker.isCurrent(token, `${languageAtRequest}:${value}`)) return;
    if (result.success) {
      setSongResults((current) => ({ ...current, [rowId]: result.value }));
      const candidates = await interactionClient.queryCandidates({ songs: result.value, serviceDate, serviceLanguage: languageAtRequest, organistPersonId: organistId, recentSongIds: getRecentCompletedSongIds(), recentSongs: getRecentCompletedSongs() });
      setCandidateResults((current) => ({ ...current, [rowId]: candidates }));
    }
  }

  function selectSong(rowId: number, song: CatalogSong, candidate?: CandidateQueryResult) {
    lookupTracker.invalidate(getSongLookupScope(rowId));
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? { ...row, songSearch: formatSongLabel(song), selectedSong: song, selectedCandidate: candidate, lookupOpen: false } : row)));
    setSongResults((current) => ({ ...current, [rowId]: [] }));
    setCandidateResults((current) => ({ ...current, [rowId]: [] }));
  }

  function clearSong(rowId: number) {
    lookupTracker.invalidate(getSongLookupScope(rowId));
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? { ...row, songSearch: "", selectedSong: undefined, selectedCandidate: undefined, lookupOpen: false } : row)));
    setSongResults((current) => ({ ...current, [rowId]: [] }));
    setCandidateResults((current) => ({ ...current, [rowId]: [] }));
  }

  function cancelActiveLookup(rowId: number) {
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? restoreLookupOnCancel(row) : row));
    setSongResults((current) => ({ ...current, [rowId]: [] }));
    setCandidateResults((current) => ({ ...current, [rowId]: [] }));
    setServiceError(null);
  }

  function activateExistingRow(rowId: number) {
    setRows((currentRows) => restoreRowsForRowSwitch(currentRows, rowId));
  }

  function updateRow(id: number, changes: Partial<EditableRow>) {
    guardedEditorUpdate(() => setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    ));
  }

  function addRow() {
    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: "Select a candidate or cancel the active lookup before adding another row." }); setSaveState("errors"); return; }
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
      lookupTracker.invalidatePrefix("song:");
      setSongResults(clearSongLookupResultsOnServiceLanguageChange());
    });
  }

  async function saveWorkingSet() {
    if (isCompletedRecordOpen || isFinalSetOpen) return;
    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }
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

    const languageDeviationConfirmation = confirmLanguageDeviationSave(planningRows, serviceLanguage, window.confirm);
    if (languageDeviationConfirmation.cancelled) {
      setServiceError({
        code: "invalidInput",
        message: `Save cancelled. Rows ${languageDeviationConfirmation.deviationRows.join(", ")} do not match the ${serviceLanguage} service language.`,
      });
      setSaveState("errors");
      return;
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
        ...(serviceNote.trim() ? { note: serviceNote.trim() } : {}),
      },
      set: {
        status: "working",
        language: serviceLanguage,
        rows: planningRows,
      },
      allowLanguageDeviations: languageDeviationConfirmation.allowLanguageDeviations || undefined,
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
    setWorkspace(getWorkspaceAfterSaveWorking());
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
    setWorkspace(getWorkspaceAfterFinalize());
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
    setWorkspace(getWorkspaceAfterComplete());
  }


  async function saveCompletedChanges() {
    if (!completedRecord || selectedRole !== "admin") return;

    const languageDeviationConfirmation = confirmLanguageDeviationSave(planningRows, serviceLanguage, window.confirm);
    if (languageDeviationConfirmation.cancelled) {
      setServiceError({ code: "invalidInput", message: `Save cancelled. Rows ${languageDeviationConfirmation.deviationRows.join(", ")} do not match the ${serviceLanguage} service language.` });
      setSaveState("errors");
      return;
    }

    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }

    const result = await planningLifecycleService.updateCompletedRecord({
      role: selectedRole,
      recordId: completedRecord.id,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
        ...(serviceNote.trim() ? { note: serviceNote.trim() } : {}),
      },
      set: { status: "final", language: serviceLanguage, rows: planningRows },
      allowLanguageDeviations: languageDeviationConfirmation.allowLanguageDeviations || undefined,
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
    setWorkspace(getWorkspaceAfterCompletedUpdate());
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
    setWorkspace(getWorkspaceAfterDelete({ kind: "completed", id: deletedRecordId }, groupActivePlanningSets(refreshed.activeSets), refreshed.completedRecords));
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
    setWorkspace(getWorkspaceAfterDelete({ kind: "active", id: deletedSetId }, groupActivePlanningSets(refreshed.activeSets), refreshed.completedRecords));
    setSaveState("deleted");
  }

  function navigateWorkspace(nextWorkspace: Workspace) {
    if (nextWorkspace !== workspace && !workspaceLeaveState.allowed) {
      setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before leaving Planning." });
      setSaveState("errors");
      return;
    }
    setWorkspace(nextWorkspace);
  }

  function openCatalogSongDetail(songId: string, rowId?: number) {
    setSelectedCatalogTab("songs");
    setSelectedCatalogSongId(songId);
    setCatalogReturnRowId(rowId ?? null);
    setCandidateDetails(null);
    navigateWorkspace("catalog");
  }

  return (
    <main className="shell">
      <section className="card planning-card" aria-labelledby="page-title">
        <p className="eyebrow">Organ Planner workspace</p>
        <div className="app-header">
          <div>
            <h1 id="page-title">{getWorkspaceLabel(workspace)}</h1>
            <p className="lede">Plan services, review active plans and history, administer the catalog, and keep development tools separate.</p>
          </div>
          <div className="role-pill" aria-label="Current simulated user">User: <strong>{activeUser.label}</strong> · Role: <strong>{selectedRole}</strong></div>
        </div>
        <nav className="workspace-nav" aria-label="Application workspaces">
          <button type="button" className={workspace === "planning" ? "active-workspace" : undefined} onClick={() => navigateWorkspace("planning")}>Planning</button>
          <button type="button" className={workspace === "plans" ? "active-workspace" : undefined} onClick={() => navigateWorkspace("plans")}>Plans</button>
          <button type="button" className={workspace === "history" ? "active-workspace" : undefined} onClick={() => navigateWorkspace("history")}>History</button>
          <button type="button" className={workspace === "catalog" ? "active-workspace" : undefined} onClick={() => navigateWorkspace("catalog")}>Catalog</button>
          <button type="button" className={workspace === "development" ? "active-workspace" : undefined} onClick={() => navigateWorkspace("development")}>Development</button>
        </nav>

        <div className={`status status-${saveState}`} role="status">
          {saveState === "unsaved" && "Unsaved"}
          {saveState === "saved" && (runtimeMode === "db" ? "Saved to DB" : "Saved in memory")}
          {saveState === "finalized" && (runtimeMode === "db" ? "Finalized in DB" : "Finalized in memory")}
          {saveState === "completed" && (runtimeMode === "db" ? "Completed in DB" : "Completed in memory")}
          {saveState === "deleted" && (runtimeMode === "db" ? "Deleted from DB" : "Deleted from memory")}
          {saveState === "errors" && "Service error"}
        </div>

        {workspace === "plans" && (
          <section className="db-workspace" aria-label="Plans">
            <div className="rows-header"><h2>Working plans</h2><button type="button" onClick={startNewDbDraft}>Start new set</button></div>
            {activeRecordGroups.working.length === 0 ? <p className="field-help">No working plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.working.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}><button type="button" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button></li>)}</ul>}
            <h2>Final plans</h2>
            {activeRecordGroups.final.length === 0 ? <p className="field-help">No final plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.final.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}><button type="button" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button></li>)}</ul>}
          </section>
        )}

        {workspace === "history" && (
          <section className="db-workspace" aria-label="Completed history">
            <h2>Completed history</h2>
            {completedRecords.length === 0 ? <p className="field-help">No completed service records saved yet.</p> : <ul className="saved-set-list">{completedRecords.map((record) => <li key={record.id} className={recordListClassName(completedRecord?.id === record.id, lastSavedRecord?.kind === "completed" && lastSavedRecord.id === record.id)}><button type="button" onClick={() => loadCompletedRecord(record.id)}>{formatCompletedRecordSummary(record)}</button></li>)}</ul>}
          </section>
        )}

        {workspace === "planning" && (
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
              <select disabled={isEditorLocked} value={priestId ?? ""} onChange={(event) => { const person = priestResults.find((p) => p.id === event.target.value); if (person) selectPerson("priest", person); }}>
                <option value="">Select active priest</option>
                {priestId && !priestResults.some((person) => person.id === priestId) && <option value={priestId} disabled aria-label={`Historical inactive priest ${priest}`}>{priest} (historical inactive)</option>}
                {priestResults.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
              <span className="field-help">{priestId ? "Selected catalog priest." : priest ? "Historical or incomplete priest selection — choose an active catalog priest before saving." : "No priest selected."}</span>
            </label>
            <label>
              Organist
              <select disabled={isEditorLocked} value={organistId ?? ""} onChange={(event) => { const person = organistResults.find((p) => p.id === event.target.value); if (person) selectPerson("organist", person); }}>
                <option value="">Select active organist</option>
                {organistId && !organistResults.some((person) => person.id === organistId) && <option value={organistId} disabled aria-label={`Historical inactive organist ${organist}`}>{organist} (historical inactive)</option>}
                {organistResults.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
              <span className="field-help">{organistId ? "Selected catalog organist." : organist ? "Historical or incomplete organist selection — choose an active catalog organist before saving." : "No organist selected."}</span>
            </label>
            <label className="note-field">
              Service note
              <textarea rows={4} disabled={isEditorLocked} value={serviceNote} onChange={(event) => guardedEditorUpdate(() => setServiceNote(event.target.value))} placeholder="Gospel readings, links, or planning information" />
            </label>
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
                <fieldset className="row-card" key={row.id} onFocus={() => activateExistingRow(row.id)} onKeyDown={(event) => { if (event.key === "Escape") cancelActiveLookup(row.id); }}>
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
                      {row.selectedSong ? (() => {
                        const candidate = row.selectedCandidate ?? candidateFromSelectedSong(row.selectedSong);
                        const presentation = getSelectedSongPresentation(candidate, row.note);
                        const candidateLine = presentation.lines[0];
                        const noteLine = presentation.lines[1];
                        return (
                          <div className="selected-song-card" aria-label={`Selected song for row ${index + 1}`}>
                            <div className="selected-song-summary" data-content-row="candidate">
                              <strong className="sticky-song-number">{candidateLine.number}</strong>
                              <span>{candidateLine.title || "Untitled snapshot"} · {candidateLine.language} · {candidateLine.signal} · preference {candidateLine.preferenceShade}{candidateLine.repertoire ? " · repertoire" : ""}</span>
                              {candidateLine.songId && <button type="button" className="candidate-detail-button" onClick={() => openCatalogSongDetail(candidateLine.songId, row.id)}>Detail</button>}
                            </div>
                            <span data-content-row="note">{noteLine.text.trim() ? noteLine.text : "No text note."}</span>
                          </div>
                        );
                      })() : row.songSearch ? <span className="field-help">Lookup text is temporary — select a candidate or cancel before saving or adding rows.</span> : <span className="field-help">No song selected; use the note field for note-only rows.</span>}
                      {row.selectedSong && canEditRows && <button type="button" onClick={() => clearSong(row.id)}>Clear song</button>}
                      {getCandidatePopupRows(candidateResults[row.id] ?? []).length > 0 && canEditRows && (
                        <div className="candidate-popup" role="listbox" aria-label={`Song candidates for row ${index + 1}`}>
                          {getCandidatePopupRows(candidateResults[row.id] ?? []).map((candidate) => {
                            const fullCandidate = (candidateResults[row.id] ?? []).find((item) => item.songId === candidate.songId);
                            const song = songResults[row.id].find((item) => item.songId === candidate.songId);
                            if (!song) return null;
                            return (
                              <div key={candidate.songId} className="candidate-card">
                                <button type="button" onClick={() => selectSong(row.id, song, fullCandidate)}>{candidate.number} · {candidate.title}</button>
                                <span>{candidate.language} · {candidate.signal} · preference {candidate.preferenceShade}{candidate.repertoire ? " · repertoire" : ""}</span>
                              </div>
                            );
                          })}
                          <button type="button" onClick={() => cancelActiveLookup(row.id)}>Cancel lookup</button>
                        </div>
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
                    <button className="save-button" type="button" onClick={saveWorkingSet} disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || hasInvalidLookupState}>
                      Save working set
                    </button>
                    <button type="button" onClick={finalizeWorkingSet} disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors || hasInvalidLookupState}>
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
                    <button className="save-button" type="button" onClick={saveCompletedChanges} disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState}>
                      Save completed changes
                    </button>
                    <button type="button" onClick={deleteCompletedRecord}>Delete completed record</button>
                  </>
                )}
              </>
          </div>
          {completeDateReason && <p className="field-help">Complete service disabled: {completeDateReason}</p>}
        </form>
        )}


        {candidateDetails && (
          <section className="detail-panel" aria-label="Song detail">
            <div className="rows-header"><h2>Song detail</h2><button type="button" onClick={() => setCandidateDetails(null)}>Back to Planning row</button></div>
            <div className="selected-song-card"><strong>{candidateDetails.number} · {candidateDetails.title}</strong><span>{candidateDetails.language} · {candidateDetails.songId}</span></div>
            <p className="field-help">Signal: {candidateDetails.signal}; preference: {candidateDetails.preferenceShade} ({candidateDetails.aggregatePreferenceScore}); repertoire: {candidateDetails.repertoire ? "yes" : "no"}; melody window: {candidateDetails.suppressedByMelodyWindow ? "recent equivalent found" : "clear"}.</p>
            {candidateDetails.equivalentNumbers.length > 0 && <p className="field-help">Equivalent numbers: {candidateDetails.equivalentNumbers.map((item) => `${item.number}${item.repertoire ? " repertoire" : ""}`).join(", ")}</p>}
          </section>
        )}

        {workspace === "catalog" && (
          <section className="db-workspace" aria-label="Catalog">
            <div className="rows-header"><h2>Catalog</h2><button type="button" onClick={refreshCatalogAdmin}>Refresh catalog</button></div>
            <div className="workspace-nav" role="tablist" aria-label="Catalog sections">
              <button type="button" className={selectedCatalogTab === "songs" ? "active-workspace" : undefined} onClick={() => setSelectedCatalogTab("songs")}>Songs</button>
              <button type="button" className={selectedCatalogTab === "people" ? "active-workspace" : undefined} onClick={() => setSelectedCatalogTab("people")}>People</button>
              <button type="button" className={selectedCatalogTab === "knowledge" ? "active-workspace" : undefined} onClick={() => setSelectedCatalogTab("knowledge")}>Knowledge</button>
            </div>
            {selectedCatalogTab === "people" && (
              <fieldset className="field-group">
                <legend>People {selectedRole !== "admin" ? "(read-only)" : ""}</legend>
                {selectedRole === "admin" && <>
                  <label>Display name<input value={personForm.displayName} onChange={(event) => setPersonForm({ ...personForm, displayName: event.target.value })} /></label>
                  <label><input type="checkbox" checked={personForm.priest} onChange={(event) => setPersonForm({ ...personForm, priest: event.target.checked })} /> Priest role</label>
                  <label><input type="checkbox" checked={personForm.organist} onChange={(event) => setPersonForm({ ...personForm, organist: event.target.checked })} /> Organist role</label>
                  <label><input type="checkbox" checked={personForm.active} onChange={(event) => setPersonForm({ ...personForm, active: event.target.checked })} /> Active</label>
                  <button type="button" onClick={async () => { if (await saveAdminPerson(personForm)) setPersonForm({ displayName: "", priest: true, organist: false, active: true }); }}>Add person</button>
                </>}
                <ul className="saved-set-list">{peopleAdmin.map((person) => <li key={person.id}>{person.displayName} ({person.active ? "active" : "inactive"}; {person.priest ? "priest" : ""} {person.organist ? "organist" : ""}) {selectedRole === "admin" && <><button type="button" onClick={async () => { await saveAdminPerson({ ...person, active: !person.active }); }}>{person.active ? "Deactivate" : "Activate"}</button><button type="button" onClick={async () => { const displayName = window.prompt("Display name", person.displayName); if (displayName) await saveAdminPerson({ ...person, displayName }); }}>Rename</button><button type="button" onClick={async () => { await saveAdminPerson({ ...person, priest: !person.priest }); }}>Toggle priest</button><button type="button" onClick={async () => { await saveAdminPerson({ ...person, organist: !person.organist }); }}>Toggle organist</button></>}</li>)}</ul>
              </fieldset>
            )}
            {selectedCatalogTab === "songs" && (
              <fieldset className="field-group catalog-panel">
                <legend>Songs {selectedRole !== "admin" ? "(active only, own preference/repertoire allowed)" : "(admin includes inactive)"}</legend>
                <label>Language<select value={catalogSongLanguage} onChange={(event) => { setCatalogSongLanguage(event.target.value as ServiceLanguage); setCatalogSongPage(0); }}><option value="mixed">All</option><option value="czech">Czech</option><option value="polish">Polish</option></select></label>
                <label>Search<input value={catalogSongSearch} onChange={(event) => { setCatalogSongSearch(event.target.value); setCatalogSongPage(0); }} placeholder="Search by number or title" /></label>
                <p className="field-help">Showing {pagedCatalogSongs.length} of {visibleCatalogSongs.length} songs over demo + 1,600 synthetic scale records.</p>
                {selectedCatalogSong && (
                  <div className="detail-panel" aria-label="Catalog song detail">
                    <div className="rows-header"><h2>{selectedCatalogSong.number} · {selectedCatalogSong.title}</h2>{catalogReturnRowId ? <button type="button" onClick={() => { setWorkspace("planning"); setCatalogReturnRowId(null); }}>Back to Planning row {catalogReturnRowId}</button> : null}</div>
                    <p className="field-help">{selectedCatalogSong.language} · {selectedCatalogSong.songId} · {selectedCatalogSong.active ? "active" : "inactive"}</p>
                    {selectedCatalogSong.sheetMusicUrl && <a href={selectedCatalogSong.sheetMusicUrl} target="_blank" rel="noopener noreferrer">Sheet music</a>}
                    {selectedRole !== "admin" && <button type="button" onClick={() => interactionClient.saveOwnPreference({ actor: activeActor, songId: selectedCatalogSong.songId, score: selectedRole === "priest" ? 3 : selectedRole === "organist" ? 2 : 1 })}>Set own max preference</button>}
                    {activeActor.personId && selectedRole === "organist" && <button type="button" onClick={() => interactionClient.setRepertoire({ actor: activeActor, organistPersonId: activeActor.personId!, songId: selectedCatalogSong.songId, active: true })}>Mark in my repertoire</button>}
                    {selectedRole === "admin" && <><button type="button" onClick={async () => { await toggleAdminSong(selectedCatalogSong); }}>Toggle active</button><button type="button" onClick={() => interactionClient.setRepertoire({ actor: activeActor, organistPersonId: "demo-organist", songId: selectedCatalogSong.songId, active: true })}>Add to demo organist repertoire</button></>}
                  </div>
                )}
                <ul className="saved-set-list catalog-song-list">{pagedCatalogSongs.map((song) => <li key={song.songId}><button type="button" onClick={() => setSelectedCatalogSongId(song.songId)}>{formatSongLabel(song)} ({song.active ? "active" : "inactive"})</button></li>)}</ul>
                <div className="row-actions"><button type="button" disabled={catalogSongPage === 0} onClick={() => setCatalogSongPage((page) => Math.max(0, page - 1))}>Previous</button><span className="field-help">Page {catalogSongPage + 1} / {catalogPageCount}</span><button type="button" disabled={catalogSongPage >= catalogPageCount - 1} onClick={() => setCatalogSongPage((page) => Math.min(catalogPageCount - 1, page + 1))}>Next</button></div>
              </fieldset>
            )}
            {selectedCatalogTab === "knowledge" && (
              <fieldset className="field-group">
                <legend>Knowledge {selectedRole !== "admin" ? "(read-only)" : ""}</legend>
                <p className="field-help">Melody non-repetition is one shared configurable window: {interactionRepository.getMelodyWindow().daysBefore} days before / {interactionRepository.getMelodyWindow().daysAfter} days after.</p>
                {selectedRole === "admin" && <button type="button" onClick={() => interactionClient.setMelodyWindow({ actor: activeActor, daysBefore: 21, daysAfter: 0 })}>Set demo 21-day window</button>}
                <ul className="saved-set-list">{interactionRepository.listKnowledge().melodyClasses.map((item) => <li key={item.id}>{item.label}: {item.songIds.join(", ")} ({item.synthetic ? "synthetic" : "production"})</li>)}</ul>
              </fieldset>
            )}
          </section>
        )}
        {workspace === "development" && (
          <section className="release-guidance" aria-label="Development workspace">
            <div><span className="guidance-label">Runtime mode</span><strong>{runtimeMode === "db" ? "Local DB opt-in" : "Local in-memory only"}</strong><p>{runtimeMode === "db" ? "Planning Lifecycle actions use the local database service selected by ORGANY_RUNTIME=db." : "Data is kept only in the current browser runtime and is not durable across refreshes or restarts."}</p></div>
            <div><span className="guidance-label">Deterministic test user</span><strong>{activeUser.label} ({activeUser.id})</strong><label>Change user<select value={selectedUserId} onChange={(event) => { const user = demoUsers.find((candidate) => candidate.id === event.target.value); if (user) setSelectedUserId(user.id); }}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}</select></label><p>Development switches stable user IDs and effective roles until authentication exists.</p></div>
            <div><span className="guidance-label">Local checks</span><strong>Smoke guidance</strong><p>Use npm run db:start, db:migrate, db:seed:catalog, db:lifecycle-smoke, db:catalog-lifecycle-smoke, and db:catalog-seed-smoke for DB runtime verification.</p></div>
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
            Opened {formatPlanningSetSummary(persistedSet)}.
          </p>
        )}

        {completedRecord && (
          <p className="saved-summary">
            Opened {formatCompletedRecordSummary(completedRecord)}.
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
