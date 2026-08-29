"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogService, InMemoryCatalogRepository, type CatalogPerson, type CatalogSong, type PersonRole } from "../src/application/catalog";
import { InMemoryInteractionRepository, canAddOrPersistRows, canLeaveWorkspace, type ActorIdentity, type AppUser, type CatalogCandidateQueryInput, type CandidateQueryResult, type ReferenceOwnPreference, type ReferencePreferenceAggregate } from "../src/application/interaction-contracts";
import type { ReferenceRepertoireMembership } from "../src/application/reference-repertoire";
import type { ReferenceMelodyClass } from "../src/application/reference-melody";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
  type CompletedServiceRecord,
  type PersistedPlanningSet,
  type PlanningSetId,
  type PlanningServiceError,
} from "../src/application/planning-lifecycle";
import type { ConcreteSongLanguage, PlanningRole, PlanningRow, PlanningSet, ServiceAntiphonReference, ServiceContext, ServiceLanguage, ServiceTopicReference } from "../src/planning-lifecycle";
import { canPerformPlanningAction, findMelodyCollisions, isValidServiceTime, melodyCollisionSummary, normalizeServiceTime, serviceAntiphonMatchesLanguage, serviceTopicMatchesLanguage, validatePlanningRow } from "../src/planning-lifecycle";
import { CatalogLookupRequestTracker, clearSongLookupResultsOnServiceLanguageChange, confirmLanguageDeviationSave, enrichRowsWithCurrentSheetMusic, getPersonLookupScope, getSongLookupScope, preserveRowsOnServiceLanguageChange } from "../src/planning-lifecycle/catalog-ui";
import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";
import { resolvePlanningDraftConflictRow, type PlanningDraftConflictPreviewState } from "../src/planning-lifecycle/conflict-ui";
import { MelodyClassDetail } from "../src/planning-lifecycle/melody-detail";
import { buildCandidateQueryInput, buildCanonicalCandidateUsages, candidateToSelectedSong, formatPlanningSongField, formatSongLabel, getPlanningCandidateRowLookupState, rehydrateCandidateFromSelectedSong, openSingleCandidateRow, planningCandidateRowReducer, restoreRowsExceptActive } from "../src/planning-lifecycle/candidate-flow";
import { InteractionService, InMemoryInteractionServiceRepository } from "../src/application/interaction-service";
import { apiFailure } from "../src/application/api-error";
import type { CompletedPlanInvalidationPreview } from "../src/application/completed-plan-conflict-preview";
import { ACTIVE_ROLE_CHANGED_EVENT, serializeActiveRoleCookie } from "../src/application/active-role";
import { MemoryReferenceAntiphonProvider } from "../src/application/reference-antiphon";
import { MemoryReferenceThematicSectionProvider } from "../src/application/reference-thematic-section";
import { DbReferenceAntiphonRecommendationClient } from "../src/application/reference-antiphon-recommendation-client";
import type { ReferenceAntiphonRecommendation } from "../src/application/reference-antiphon-recommendation";
import { ServiceContextReferenceAntiphonField } from "./service-context-reference-antiphon-field";
import { ServiceContextReferenceTopicField } from "./service-context-reference-topic-field";
import { NonRepetitionPeriodPanel } from "./non-repetition-period-panel";
import { CatalogWorkspace } from "./catalog-workspace";
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
type SelectedCandidateAvailability = "available" | "unavailable" | "error";
type SelectedCandidateAvailabilitySnapshot = { key: string; byRow: Record<number, SelectedCandidateAvailability> };

type WorkingSetSnapshot = {
  serviceDate: string;
  serviceTime: string;
  serviceLanguage: ServiceLanguage;
  priest: string;
  organist: string;
  rows: PlanningRow[];
};

type PlanningExpansion =
  | { kind: "candidateList"; rowId: number; focusSongId?: string }
  | { kind: "candidateDetail"; rowId: number; songId: string; candidate: CandidateQueryResult; returnQuery: string }
  | { kind: "selectedSongDetail"; rowId: number; songId: string; candidate: CandidateQueryResult }
  | null;

type CatalogClient = CatalogService | DbCatalogClient;
type CandidateHydrationClientInput = { songs: NonNullable<PlanningRow["song"]>[]; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string };
type MelodyResult = { success: true; value: ReferenceMelodyClass } | { success: false; error: PlanningServiceError };
type RepertoireResult = { success: true; value: ReferenceRepertoireMembership } | { success: false; error: PlanningServiceError };
type InteractionClient = { saveOwnPreference(input: { actor: ActorIdentity; songId: string; score: number }): Promise<unknown>; getReferenceOwnPreference(input: { actor: ActorIdentity; referenceSongId: string }): Promise<{ success: true; value: ReferenceOwnPreference } | { success: false; error: PlanningServiceError }>; saveReferenceOwnPreference(input: { actor: ActorIdentity; referenceSongId: string; score: number }): Promise<{ success: true; value: ReferenceOwnPreference } | { success: false; error: PlanningServiceError }>; getReferencePreferenceAggregate(input: { actor: ActorIdentity; referenceSongId: string }): Promise<{ success: true; value: ReferencePreferenceAggregate } | { success: false; error: PlanningServiceError }>; getReferenceRepertoireMembership(input: { actor: ActorIdentity; referenceSongId: string; organistPersonId?: string }): Promise<RepertoireResult>; setReferenceRepertoireMembership(input: { actor: ActorIdentity; referenceSongId: string; organistPersonId?: string; active: boolean }): Promise<RepertoireResult>; getReferenceMelodyClass(input: { actor: ActorIdentity; referenceSongId: string }): Promise<MelodyResult>; mergeReferenceMelodyClasses(input: { actor: ActorIdentity; referenceSongId: string; mergeWithReferenceSongId: string }): Promise<MelodyResult>; getReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }): Promise<{ success: true; value: { exists: boolean } } | { success: false; error: PlanningServiceError }>; addReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }): Promise<MelodyResult>; removeReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }): Promise<MelodyResult>; setRepertoire(input: { actor: ActorIdentity; organistPersonId: string; songId: string; active: boolean }): Promise<unknown>; setMelodyWindow(input: { actor: ActorIdentity; months: number }): Promise<unknown>; queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }): Promise<CandidateQueryResult[]>; queryCatalogCandidates(input: CatalogCandidateQueryInput): Promise<CandidateQueryResult[]>; hydrateCandidates(input: CandidateHydrationClientInput): Promise<CandidateQueryResult[]>; };
const PHASE_30_1_PREFERENCE_THRESHOLD = 0;

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
    songSearch: row.song ? formatPlanningSongField(row.song) : "",
    selectedSong: row.song ? { ...row.song } : undefined,
    selectedCandidate: row.song ? rehydrateCandidateFromSelectedSong(row.song, row.note ?? "") : undefined,
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
    availability: { kind: "available" },
    suppressedByMelodyWindow: false,
    orderKey: `${song.language}:${song.number}`,
  };
}



function formatConflictPreviewPlanLabel(
  impact: CompletedPlanInvalidationPreview["newlyImpactedPlans"][number],
  plans: PersistedPlanningSet[],
): string {
  const plan = plans.find((candidate) => candidate.id === impact.planId);
  const status = impact.planStatus === "final" ? "Final" : "Working";
  return plan ? `${status} ${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}` : `${status} plan`;
}

function RecordListSummary({ summary }: { summary: string }) {
  const rowsMarker = " · rows:";
  const rowsIndex = summary.indexOf(rowsMarker);
  if (rowsIndex < 0) return <>{summary}</>;

  return <>
    {summary.slice(0, rowsIndex)}
    <span className="record-summary-rows">{summary.slice(rowsIndex + 3)}</span>
  </>;
}

function isFuturePragueDate(serviceDate: string): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return serviceDate > today;
}

export type RuntimeMode = "memory" | "db";

type PlanningLifecycleClientProps = {
  runtimeMode: RuntimeMode;
  authenticatedUser?: AppUser;
  initialActiveRole?: PlanningRole;
};

class DbPlanningLifecycleClient {
  async getWorkspaceSnapshot() {
    return callPlanningLifecycleApi("getWorkspaceSnapshot", {});
  }

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

  async previewCompletedRecordInvalidation(input: { role: PlanningRole; localActorUserId: string; recordId: string; serviceContext: ServiceContext; set: PlanningSet & { status: "final" } }) {
    return callPlanningLifecycleApi("previewCompletedRecordInvalidation", input, actorContextFrom(input));
  }

  async previewPlanningSetConflict(input: { setId: PlanningSetId; serviceDate: string; rows: PlanningRow[] }) {
    return callPlanningLifecycleApi("previewPlanningSetConflict", input);
  }

  async saveWorkingSet(input: Parameters<PlanningLifecycleService["saveWorkingSet"]>[0]) {
    return callPlanningLifecycleApi("saveWorkingSet", input, actorContextFrom(input));
  }

  async finalizeWorkingSet(input: Parameters<PlanningLifecycleService["finalizeWorkingSet"]>[0]) {
    return callPlanningLifecycleApi("finalizeWorkingSet", input, actorContextFrom(input));
  }

  async reopenFinalSet(input: Parameters<PlanningLifecycleService["reopenFinalSet"]>[0]) {
    return callPlanningLifecycleApi("reopenFinalSet", input, actorContextFrom(input));
  }

  async completeFinalSet(input: Parameters<PlanningLifecycleService["completeFinalSet"]>[0]) {
    return callPlanningLifecycleApi("completeFinalSet", input, actorContextFrom(input));
  }

  async deletePlanningSet(input: Parameters<PlanningLifecycleService["deletePlanningSet"]>[0]) {
    return callPlanningLifecycleApi("deletePlanningSet", input, actorContextFrom(input));
  }

  async updateCompletedRecord(input: Parameters<PlanningLifecycleService["updateCompletedRecord"]>[0]) {
    return callPlanningLifecycleApi("updateCompletedRecord", input, actorContextFrom(input));
  }

  async deleteCompletedRecord(input: Parameters<PlanningLifecycleService["deleteCompletedRecord"]>[0]) {
    return callPlanningLifecycleApi("deleteCompletedRecord", input, actorContextFrom(input));
  }
}


export type InteractionTransport = (action: string, input: unknown, actor?: LocalActorRequest) => ReturnType<typeof callInteractionApi>;
export class DbInteractionClient implements InteractionClient {
  constructor(private readonly transport: InteractionTransport = callInteractionApi) {}
  async saveOwnPreference(input: { actor: ActorIdentity; songId: string; score: number }) { return callInteractionApi("saveOwnPreference", input, input.actor); }
  async getReferenceOwnPreference(input: { actor: ActorIdentity; referenceSongId: string }) { return this.transport("getReferenceOwnPreference", { referenceSongId: input.referenceSongId }, input.actor); }
  async saveReferenceOwnPreference(input: { actor: ActorIdentity; referenceSongId: string; score: number }) { return this.transport("saveReferenceOwnPreference", { referenceSongId: input.referenceSongId, score: input.score }, input.actor); }
  async getReferencePreferenceAggregate(input: { actor: ActorIdentity; referenceSongId: string }) { return this.transport("getReferencePreferenceAggregate", { referenceSongId: input.referenceSongId }, input.actor); }
  async getReferenceRepertoireMembership(input: { actor: ActorIdentity; referenceSongId: string; organistPersonId?: string }) { return this.transport("getReferenceRepertoireMembership", { referenceSongId: input.referenceSongId, ...(input.organistPersonId ? { organistPersonId: input.organistPersonId } : {}) }, input.actor); }
  async setReferenceRepertoireMembership(input: { actor: ActorIdentity; referenceSongId: string; organistPersonId?: string; active: boolean }) { return this.transport("setReferenceRepertoireMembership", { referenceSongId: input.referenceSongId, ...(input.organistPersonId ? { organistPersonId: input.organistPersonId } : {}), active: input.active }, input.actor); }
  async getReferenceMelodyClass(input: { actor: ActorIdentity; referenceSongId: string }) { return this.transport("getReferenceMelodyClass", { referenceSongId: input.referenceSongId }, input.actor); }
  async mergeReferenceMelodyClasses(input: { actor: ActorIdentity; referenceSongId: string; mergeWithReferenceSongId: string }) { return this.transport("mergeReferenceMelodyClasses", { referenceSongId: input.referenceSongId, mergeWithReferenceSongId: input.mergeWithReferenceSongId }, input.actor); }
  async getReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }) { return this.transport("getReferenceMelodyEdge", { referenceSongId: input.referenceSongId, otherReferenceSongId: input.otherReferenceSongId }, input.actor); }
  async addReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }) { return this.transport("addReferenceMelodyEdge", { referenceSongId: input.referenceSongId, otherReferenceSongId: input.otherReferenceSongId }, input.actor); }
  async removeReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }) { return this.transport("removeReferenceMelodyEdge", { referenceSongId: input.referenceSongId, otherReferenceSongId: input.otherReferenceSongId }, input.actor); }
  async setRepertoire(input: { actor: ActorIdentity; organistPersonId: string; songId: string; active: boolean }) { return callInteractionApi("setRepertoire", input, input.actor); }
  async setMelodyWindow(input: { actor: ActorIdentity; months: number }) { return callInteractionApi("setMelodyWindow", input, input.actor); }
  async queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }) { return unwrapCandidateResponse(await this.transport("queryCandidates", buildCandidateQueryInput(input))); }
  async queryCatalogCandidates(input: CatalogCandidateQueryInput) { return unwrapCandidateResponse(await this.transport("queryCatalogCandidates", input)); }
  async hydrateCandidates(input: CandidateHydrationClientInput) { return unwrapCandidateResponse(await this.transport("hydrateCandidates", input)); }
}

function unwrapCandidateResponse(result: { success: true; value: unknown } | { success: false; error: PlanningServiceError }): CandidateQueryResult[] {
  if (!result.success) {
    const error = new Error(result.error.message) as Error & { code?: PlanningServiceError["code"] };
    error.code = result.error.code;
    throw error;
  }
  if (!Array.isArray(result.value)) throw new Error("Candidate API returned a malformed result.");
  return result.value as CandidateQueryResult[];
}

export class MemoryInteractionClient implements InteractionClient {
  private readonly service: InteractionService;
  constructor(private readonly repo: InMemoryInteractionRepository, catalog: CatalogClient) { this.service = new InteractionService(new InMemoryInteractionServiceRepository(repo), { listSongs: async () => { const songs = await catalog.listSongs(); return songs.success ? songs.value : []; } }); }
  async saveOwnPreference(input: { actor: ActorIdentity; songId: string; score: number }) { return this.repo.saveOwnPreference(input.actor, input.songId, input.score); }
  async getReferenceOwnPreference() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference preferences are available only in DB runtime." } }; }
  async saveReferenceOwnPreference() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference preferences are available only in DB runtime." } }; }
  async getReferencePreferenceAggregate() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference preferences are available only in DB runtime." } }; }
  async getReferenceRepertoireMembership() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference repertoire is available only in DB runtime." } }; }
  async setReferenceRepertoireMembership() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference repertoire is available only in DB runtime." } }; }
  async getReferenceMelodyClass() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference melody classes are available only in DB runtime." } }; }
  async mergeReferenceMelodyClasses() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference melody classes are available only in DB runtime." } }; }
  async getReferenceMelodyEdge() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference melody edges are available only in DB runtime." } }; }
  async addReferenceMelodyEdge() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference melody edges are available only in DB runtime." } }; }
  async removeReferenceMelodyEdge() { return { success: false as const, error: { code: "permissionDenied" as const, message: "Reference melody edges are available only in DB runtime." } }; }
  async setRepertoire(input: { actor: ActorIdentity; organistPersonId: string; songId: string; active: boolean }) { return this.repo.setRepertoire(input.actor, input.organistPersonId, input.songId, input.active); }
  async setMelodyWindow(input: { actor: ActorIdentity; months: number }) { return this.repo.setMelodyWindow(input.actor, { months: input.months }); }
  async queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }) {
    const result = await this.service.queryCandidates(buildCandidateQueryInput(input));
    return result.success ? applyMemoryTopicSignal(result.value, input.referenceTopicId) : [];
  }
  async queryCatalogCandidates(input: CatalogCandidateQueryInput) {
    if (input.availabilityMode === "unavailable") return [];
    const result = await this.service.queryCandidates({
      serviceDate: "2000-01-01",
      serviceLanguage: input.serviceLanguage,
      ...(input.organistPersonId ? { organistPersonId: input.organistPersonId } : {}),
      ...(input.referenceAntiphonId ? { referenceAntiphonId: input.referenceAntiphonId } : {}),
      ...(input.referenceTopicId ? { referenceTopicId: input.referenceTopicId } : {}),
      ...(input.queryText !== undefined ? { queryText: input.queryText } : {}),
      candidateUsages: [],
    });
    return result.success ? applyMemoryTopicSignal(result.value, input.referenceTopicId) : [];
  }
  async hydrateCandidates(input: CandidateHydrationClientInput) {
    const result = await this.service.hydrateCandidates(input);
    return result.success ? applyMemoryTopicSignal(result.value, input.referenceTopicId) : [];
  }
}

const memoryTopicProvider = new MemoryReferenceThematicSectionProvider();
async function applyMemoryTopicSignal(candidates: CandidateQueryResult[], referenceTopicId?: string): Promise<CandidateQueryResult[]> {
  if (!referenceTopicId) return candidates;
  const topic = await memoryTopicProvider.getSectionById(referenceTopicId);
  if (!topic) return candidates.map((candidate) => ({ ...candidate, seasonMatch: false, signal: candidate.antiphonMatch ? "antiphon" : "none" }));
  return candidates.map((candidate) => {
    const base = candidateBaseNumber(candidate.number);
    const seasonMatch = candidate.language === topic.language && base !== undefined && topic.ranges.some((range) => base >= range.from && base <= range.to);
    return { ...candidate, seasonMatch, signal: candidate.antiphonMatch ? "antiphon" : seasonMatch ? "season" : "none" };
  });
}
function candidateBaseNumber(value: string): number | undefined {
  const match = value.match(/^([1-9]\d*)(?:\/\d+)?$/);
  return match ? Number(match[1]) : undefined;
}

class DbCatalogClient {
  async getPerson(input: { id: string }) { return callCatalogApi("getPerson", input); }
  async getSong(input: { songId: string }) { return callCatalogApi("getSong", input); }
  async getSongs(input: { songIds: string[] }) { return callCatalogApi("getSongs", input); }
  async getPlanningPeople() { return callCatalogApi("getPlanningPeople", {}); }
  async searchPeople(input: { role: PersonRole; query?: string }) { return callCatalogApi("searchPeople", input); }
  async listPeople() { return callCatalogApi("listPeople", {}); }
  async savePerson(input: { role: PlanningRole; actorUserId?: string; person: Omit<CatalogPerson, "id"> & { id?: string } }) { return callCatalogApi("savePerson", input, input.actorUserId ? { userId: input.actorUserId, role: input.role } : undefined); }
  async searchSongs(input: { language: ServiceLanguage; query?: string }) { return callCatalogApi("searchSongs", input); }
  async listSongs() { return callCatalogApi("listSongs", {}); }
  async setSongActive(input: { role: PlanningRole; actorUserId?: string; songId: string; active: boolean }) { return callCatalogApi("setSongActive", input, input.actorUserId ? { userId: input.actorUserId, role: input.role } : undefined); }
}

type LocalActorRequest = { userId: string; role?: PlanningRole };
function protectedActorEnvelope(actor?: LocalActorRequest) { return actor ? { actor: { ...(actor.role ? { role: actor.role } : {}) } } : {}; }
async function callInteractionApi(action: string, input: unknown, actor?: LocalActorRequest) {
  const response = await fetch("/api/interaction", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ action, input, ...protectedActorEnvelope(actor) }) });
  const payload = await response.json();
  if (!response.ok) return apiFailure(payload, "Interaction API request failed.");
  return payload;
}

async function callCatalogApi(action: string, input: unknown, actor?: LocalActorRequest) {
  const response = await fetch("/api/catalog", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ action, input, ...protectedActorEnvelope(actor) }) });
  const payload = await response.json();
  if (!response.ok) return apiFailure(payload, "Catalog API request failed.");
  return payload;
}

async function callPlanningLifecycleApi(action: string, input: unknown, actor?: LocalActorRequest) {
  const response = await fetch("/api/planning-lifecycle", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action, input, ...protectedActorEnvelope(actor) }),
  });

  const payload = await response.json();

  if (!response.ok) {
    return apiFailure(payload, "Planning Lifecycle API request failed.");
  }

  return payload;
}

const jsonHeaders = { "content-type": "application/json" };
function actorContextFrom(input: unknown): LocalActorRequest | undefined { if (typeof input !== "object" || input === null || !("localActorUserId" in input)) return undefined; const value = input as { localActorUserId?: unknown; role?: unknown }; return typeof value.localActorUserId === "string" ? { userId: value.localActorUserId, ...(typeof value.role === "string" ? { role: value.role as PlanningRole } : {}) } : undefined; }

export default function PlanningLifecycleClient({ runtimeMode, authenticatedUser, initialActiveRole }: PlanningLifecycleClientProps) {
  const catalogRepository = useMemo(() => new InMemoryCatalogRepository(), []);
  const interactionRepository = useMemo(() => new InMemoryInteractionRepository(), []);
  const repositories = useMemo<PlanningRepositories>(() => {
    const planningSets = new InMemoryPlanningSetRepository();
    return { planningSets, completedServiceRecords: new InMemoryCompletedServiceRecordRepository(planningSets) };
  }, []);
  const planningLifecycleService = useMemo(
    () =>
      runtimeMode === "db"
        ? new DbPlanningLifecycleClient()
        : new PlanningLifecycleService({
            planningSets: repositories.planningSets,
            completedServiceRecords: repositories.completedServiceRecords,
            catalog: catalogRepository,
            referenceAntiphons: new MemoryReferenceAntiphonProvider(),
            referenceTopics: new MemoryReferenceThematicSectionProvider(),
          }),
    [repositories, runtimeMode, catalogRepository],
  );
  const catalogClient = useMemo<CatalogClient>(() => runtimeMode === "db" ? new DbCatalogClient() : new CatalogService(catalogRepository), [runtimeMode, catalogRepository]);
  const interactionClient = useMemo<InteractionClient>(() => runtimeMode === "db" ? new DbInteractionClient() : new MemoryInteractionClient(interactionRepository, catalogClient), [runtimeMode, interactionRepository, catalogClient]);
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
  const [referenceAntiphon, setReferenceAntiphon] = useState<ServiceAntiphonReference | undefined>();
  const [planningAntiphonRecommendation, setPlanningAntiphonRecommendation] = useState<ReferenceAntiphonRecommendation>();
  const [planningAntiphonRecommendationLoading, setPlanningAntiphonRecommendationLoading] = useState(false);
  const [planningAntiphonRecommendationError, setPlanningAntiphonRecommendationError] = useState<string>();
  const [antiphonRecommendationGeneration, setAntiphonRecommendationGeneration] = useState(0);
  const [referenceTopic, setReferenceTopic] = useState<ServiceTopicReference | undefined>();
  const [serviceContextGeneration, setServiceContextGeneration] = useState(0);
  const [candidateAntiphonKey, setCandidateAntiphonKey] = useState("");
  const [candidateSeasonKey, setCandidateSeasonKey] = useState("");
  const [rows, setRows] = useState<EditableRow[]>(() => [createEmptyRow(1, initialServiceLanguage)]);
  const [nextRowId, setNextRowId] = useState(2);
  const [saveState, setSaveState] = useState<SaveState>("unsaved");
  const [savedWorkingSet, setSavedWorkingSet] = useState<WorkingSetSnapshot | null>(null);
  const [persistedSet, setPersistedSet] = useState<PersistedPlanningSet | null>(null);
  const [completedRecord, setCompletedRecord] = useState<CompletedServiceRecord | null>(null);
  const [completedInvalidationPreview, setCompletedInvalidationPreview] = useState<CompletedPlanInvalidationPreview | null>(null);
  const completedInvalidationPreviewRequest = useRef(0);
  const [planningDraftConflictPreview, setPlanningDraftConflictPreview] = useState<PlanningDraftConflictPreviewState | null>(null);
  const planningDraftConflictPreviewRequest = useRef(0);
  const [savedDbSets, setSavedDbSets] = useState<PersistedPlanningSet[]>([]);
  const [completedRecords, setCompletedRecords] = useState<CompletedServiceRecord[]>([]);
  const [serviceError, setServiceError] = useState<PlanningServiceError | null>(null);
  const [lastSavedRecord, setLastSavedRecord] = useState<PersistedRecordReference | null>(null);
  const [draftPeopleDefaults, setDraftPeopleDefaults] = useState<DraftPeopleDefaults>({ priest: { displayName: "" }, organist: { displayName: "" } });
  const [songResults, setSongResults] = useState<Record<number, CatalogSong[]>>({});
  const [candidateResults, setCandidateResults] = useState<Record<number, CandidateQueryResult[]>>({});
  const [planningExpansion, setPlanningExpansion] = useState<PlanningExpansion>(null);
  const openCandidateRowId = planningExpansion?.kind === "candidateList" ? planningExpansion.rowId : null;
  const [candidateLoading, setCandidateLoading] = useState<Record<number, boolean>>({});
  const [candidateErrors, setCandidateErrors] = useState<Record<number, string | undefined>>({});
  const [candidateRefreshGeneration, setCandidateRefreshGeneration] = useState(0);
  const [detailEligibilityCandidates, setDetailEligibilityCandidates] = useState<CandidateQueryResult[]>([]);
  const [detailEligibilityLoading, setDetailEligibilityLoading] = useState(false);
  const [detailEligibilityError, setDetailEligibilityError] = useState<string | undefined>();
  const detailEligibilityRequest = useRef(0);
  const [selectedCandidateAvailability, setSelectedCandidateAvailability] = useState<SelectedCandidateAvailabilitySnapshot>({ key: "", byRow: {} });
  const selectedCandidateAvailabilityRequest = useRef(0);
  const planningAntiphonRecommendationRequest = useRef(0);
  const [workspace, setWorkspace] = useState<Workspace>("planning");
  const memoryUsers = useMemo(() => interactionRepository.listUsers(), [interactionRepository]);
  const availableUsers = runtimeMode === "db" ? (authenticatedUser ? [authenticatedUser] : []) : memoryUsers;
  const demoUsers = availableUsers.map((user) => ({ id: user.id, label: user.displayName, roles: user.roles }));
  const [selectedUserId, setSelectedUserId] = useState(authenticatedUser?.id ?? "demo-priest-user");
  const [selectedAssignedRole, setSelectedAssignedRole] = useState<PlanningRole>(initialActiveRole ?? authenticatedUser?.roles[0] ?? "priest");
  const storedUser = availableUsers.find((user) => user.id === selectedUserId) ?? availableUsers[0] ?? memoryUsers[0];
  const effectiveRole = storedUser.roles.includes(selectedAssignedRole) ? selectedAssignedRole : storedUser.roles[0];
  const activeActor: ActorIdentity = { userId: storedUser.id, displayName: storedUser.displayName, role: effectiveRole, ...(storedUser.personId ? { personId: storedUser.personId } : {}) };
  const selectedRole = activeActor.role;
  const activeUser = { id: activeActor.userId, label: activeActor.displayName, role: activeActor.role };

  const planningAntiphonRecommendationClient = useMemo(
    () => runtimeMode === "db" ? new DbReferenceAntiphonRecommendationClient({ userId: activeActor.userId, role: activeActor.role }) : null,
    [runtimeMode, activeActor.userId, activeActor.role],
  );

  function selectAssignedRole(role: PlanningRole) {
    setSelectedAssignedRole(role);
    if (runtimeMode === "db") {
      document.cookie = serializeActiveRoleCookie(role);
      window.dispatchEvent(new CustomEvent(ACTIVE_ROLE_CHANGED_EVENT, { detail: role }));
    }
  }

  useEffect(() => {
    void refreshDbSets();
  }, [runtimeMode]);

  useEffect(() => {
    const token = ++planningAntiphonRecommendationRequest.current;
    setPlanningAntiphonRecommendation(undefined);
    setPlanningAntiphonRecommendationError(undefined);
    setPlanningAntiphonRecommendationLoading(false);
    if (!planningAntiphonRecommendationClient || !referenceAntiphon) return;

    setPlanningAntiphonRecommendationLoading(true);
    void planningAntiphonRecommendationClient.get(referenceAntiphon.id).then((result) => {
      if (planningAntiphonRecommendationRequest.current !== token) return;
      if (result.success) setPlanningAntiphonRecommendation(result.value);
      else setPlanningAntiphonRecommendationError(result.error.message);
    }).catch((cause: unknown) => {
      if (planningAntiphonRecommendationRequest.current === token) {
        setPlanningAntiphonRecommendationError(cause instanceof Error ? cause.message : "Antiphon Reference song could not be loaded.");
      }
    }).finally(() => {
      if (planningAntiphonRecommendationRequest.current === token) setPlanningAntiphonRecommendationLoading(false);
    });

    return () => {
      if (planningAntiphonRecommendationRequest.current === token) planningAntiphonRecommendationRequest.current += 1;
    };
  }, [planningAntiphonRecommendationClient, referenceAntiphon?.id, antiphonRecommendationGeneration]);

  useEffect(() => {
    if (workspace !== "planning" && workspace !== "catalog") return;
    if (runtimeMode === "db" && catalogClient instanceof DbCatalogClient) {
      void catalogClient.getPlanningPeople().then((result) => {
        if (!result.success) return;
        setPriestResults(result.value.priests);
        setOrganistResults(result.value.organists);
      });
      return;
    }
    void Promise.all([
      catalogClient.searchPeople({ role: "priest", query: "" }),
      catalogClient.searchPeople({ role: "organist", query: "" }),
    ]).then(([priests, organists]) => {
      if (priests.success) setPriestResults(priests.value);
      if (organists.success) setOrganistResults(organists.value);
    });
  }, [workspace, runtimeMode, catalogClient]);

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
  const revisionPlanCount = activeRecordGroups.working.filter((set) => set.needsRevision).length + activeRecordGroups.final.filter((set) => set.needsRevision).length;
  const conflictingRevisionRowIndexes = useMemo(() => new Set(persistedSet?.needsRevision?.conflictingRowIndexes ?? []), [persistedSet?.id, persistedSet?.needsRevision]);
  const planningConflictPreviewKey = useMemo(() => (
    persistedSet && persistedSet.status === "working" && !completedRecord
      ? JSON.stringify([persistedSet.id, serviceDate, planningRows.map((row) => row.song?.songId ?? null)])
      : ""
  ), [persistedSet?.id, persistedSet?.status, completedRecord?.id, serviceDate, planningRows]);
  const completedConflictImpacts = completedInvalidationPreview?.impactedPlans ?? [];
  const completedConflictPlanCount = completedInvalidationPreview
    ? new Set(completedConflictImpacts.map((impact) => impact.planId)).size
    : new Set(completedRecord?.conflictState?.conflictingPlanIds ?? []).size;
  const completedConflictRowIndexes = useMemo(() => new Set(
    completedInvalidationPreview
      ? completedConflictImpacts.flatMap((impact) => impact.conflictingCompletedRowIndexes)
      : completedRecord?.conflictState?.conflictingRowIndexes ?? [],
  ), [completedInvalidationPreview, completedRecord?.id, completedRecord?.conflictState]);
  const historyConflictCount = completedRecords.filter((record) => record.conflictState).length;
  const completedRecordsNewestFirst = useMemo(() => [...completedRecords].sort((left, right) => {
    const dateOrder = right.serviceContext.serviceDate.localeCompare(left.serviceContext.serviceDate);
    if (dateOrder !== 0) return dateOrder;
    const completedOrder = new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime();
    return completedOrder || right.id.localeCompare(left.id);
  }), [completedRecords]);
  const lifecycleState = completedRecord ? "completed" : persistedSet?.status ?? "working draft";
  const validationResults = useMemo(() => planningRows.map(validatePlanningRow), [planningRows]);
  const hasValidationErrors = !completedRecord && validationResults.some((result) => !result.valid);
  const melodyCollisions = useMemo(() => findMelodyCollisions(rows.map((row, index) => ({
    rowId: row.id,
    rowLabel: `Row ${index + 1}`,
    songId: row.selectedSong?.songId,
    melodyClassId: row.selectedCandidate?.melodyClassId,
  }))), [rows]);
  const melodyFinalizationReason = melodyCollisionSummary(melodyCollisions);
  const hasMelodyCollisions = melodyCollisions.length > 0;
  const isCompletedRecordOpen = Boolean(completedRecord);
  const hasServiceContext = Boolean(serviceDate && isValidServiceTime(serviceTime) && priest.trim() && organist.trim());
  const hasConcreteFinalPeople = Boolean(priestId && organistId);
  const hasAntiphonLanguageMismatch = Boolean(referenceAntiphon && !serviceAntiphonMatchesLanguage(referenceAntiphon, serviceLanguage));
  const hasTopicLanguageMismatch = Boolean(referenceTopic && !serviceTopicMatchesLanguage(referenceTopic, serviceLanguage));
  const isFinalSetOpen = persistedSet?.status === "final";
  const canMutateEditor = canMutatePlanningEditor({ isFinalSetOpen, isCompletedRecordOpen, selectedRole });
  const isEditorLocked = !canMutateEditor;
  const serviceContextRecordKey = `${serviceContextGeneration}:${completedRecord ? `completed:${completedRecord.id}` : persistedSet ? `set:${persistedSet.id}:${persistedSet.status}` : "new"}`;
  const candidateRecordKeyRef = useRef(serviceContextRecordKey);
  useEffect(() => {
    const recordChanged = candidateRecordKeyRef.current !== serviceContextRecordKey;
    candidateRecordKeyRef.current = serviceContextRecordKey;
    lookupTracker.invalidatePrefix("song:");
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    if (recordChanged) {
      detailEligibilityRequest.current += 1;
      setDetailEligibilityCandidates([]);
      setDetailEligibilityLoading(false);
      setDetailEligibilityError(undefined);
      setPlanningExpansion(null);
      setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
      return;
    }
    if (openCandidateRowId !== null) {
      const openRow = rows.find((row) => row.id === openCandidateRowId);
      if (openRow) void queryCandidateResults(openRow.id, openRow.songSearch);
    } else if (planningExpansion && planningExpansion.kind !== "candidateList") {
      void loadDetailEligibility(planningExpansion.rowId);
    }
  }, [runtimeMode, serviceContextRecordKey, organistId, referenceAntiphon?.id, referenceTopic?.id, serviceLanguage, serviceDate, lookupTracker, candidateRefreshGeneration]);
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
  const rowLookupStates = rows.map(getPlanningCandidateRowLookupState);
  const hasInvalidLookupState = !canAddOrPersistRows(rowLookupStates);
  const workspaceLeaveState = canLeaveWorkspace(rowLookupStates);
  const selectedCandidateRows = rows.flatMap((row) => row.selectedSong?.songId ? [{ rowId: row.id, songId: row.selectedSong.songId, language: row.selectedSong.language }] : []);
  const candidateAvailabilityKey = JSON.stringify({
    runtimeMode,
    serviceContextGeneration,
    candidateRefreshGeneration,
    serviceDate,
    serviceLanguage,
    organistId: organistId ?? "",
    referenceAntiphonId: referenceAntiphon?.id ?? "",
    referenceTopicId: referenceTopic?.id ?? "",
    candidateAntiphonKey,
    candidateSeasonKey,
    currentPlanId: persistedSet?.id ?? "",
    selected: selectedCandidateRows,
    activePlans: savedDbSets.map((set) => [set.id, set.status, set.serviceContext.serviceDate, set.rows.map((row) => row.song?.songId ?? "")]),
    completed: completedRecords.map((record) => [record.id, record.serviceContext.serviceDate, record.set.rows.map((row) => row.song?.songId ?? "")]),
  });
  const candidateAvailabilityCurrent = selectedCandidateAvailability.key === candidateAvailabilityKey;
  const candidateAvailabilityApplies = !isCompletedRecordOpen;
  const hasUnavailableCandidates = candidateAvailabilityApplies && selectedCandidateRows.some((selected) => {
    if (serviceLanguage !== "mixed" && selected.language !== serviceLanguage) return true;
    return candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[selected.rowId] === "unavailable";
  });
  const hasCandidateAvailabilityError = candidateAvailabilityApplies && candidateAvailabilityCurrent && selectedCandidateRows.some((selected) => selectedCandidateAvailability.byRow[selected.rowId] === "error");
  const candidateAvailabilityPending = candidateAvailabilityApplies && selectedCandidateRows.length > 0 && !candidateAvailabilityCurrent;
  const hasCandidateAvailabilityBlock = candidateAvailabilityPending || hasUnavailableCandidates || hasCandidateAvailabilityError;
  const rowCandidateUnavailable = (row: EditableRow) => candidateAvailabilityApplies && Boolean(row.selectedSong?.songId) && (
    (serviceLanguage !== "mixed" && row.selectedSong!.language !== serviceLanguage)
    || (candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[row.id] === "unavailable")
  );
  const hasEmptyRowValidation = !isCompletedRecordOpen && validationResults.some((result) => result.issues.some((issue) => issue.path === "row"));
  const planningActionValidationMessages = [
    ...(!serviceDate ? ["Service date is required."] : []),
    ...(!isValidServiceTime(serviceTime) ? ["Service time is required in HH:mm format between 00:00 and 23:59."] : []),
    ...(!priest.trim() ? ["Priest is required."] : []),
    ...(!organist.trim() ? ["Organist is required."] : []),
    ...(!isCompletedRecordOpen && persistedSet?.status === "working" && !hasConcreteFinalPeople ? ["Choose a concrete active priest and organist before finalization."] : []),
    ...(hasAntiphonLanguageMismatch ? ["Selected antiphon must match the service language."] : []),
    ...(hasTopicLanguageMismatch ? ["Selected topic must match the service language."] : []),
    ...(hasEmptyRowValidation ? ["Every row must include either a complete song reference or a non-empty textual note."] : []),
    ...(hasUnavailableCandidates ? ["Every candidate must be available."] : []),
    ...(hasCandidateAvailabilityError ? ["Candidate availability could not be checked."] : []),
    ...(!isCompletedRecordOpen ? validationResults : []).flatMap((result, index) => result.issues
      .filter((issue) => issue.path !== "row")
      .map((issue) => `Row ${index + 1}: ${issue.message}`)),
    ...(hasInvalidLookupState ? [workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving."] : []),
    ...(melodyFinalizationReason && !isCompletedRecordOpen && !isFinalSetOpen ? [melodyFinalizationReason] : []),
    ...(completeDateReason ? [`Complete service disabled: ${completeDateReason}`] : []),
  ].filter((message, index, messages) => messages.indexOf(message) === index);

  function completedDraftInput(record: CompletedServiceRecord) {
    return {
      role: selectedRole,
      localActorUserId: activeActor.userId,
      recordId: record.id,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
        ...(serviceNote.trim() ? { note: serviceNote.trim() } : {}),
        ...(referenceAntiphon ? { referenceAntiphon: { ...referenceAntiphon } } : {}),
        ...(referenceTopic ? { referenceTopic: { ...referenceTopic } } : {}),
        ...(candidateAntiphonKey.trim() ? { antiphonKey: candidateAntiphonKey.trim() } : {}),
        ...(candidateSeasonKey.trim() ? { liturgicalSeasonKey: candidateSeasonKey.trim() } : {}),
      },
      set: { status: "final" as const, language: serviceLanguage, rows: planningRows },
    };
  }

  useEffect(() => {
    const request = ++planningDraftConflictPreviewRequest.current;
    const previewKey = planningConflictPreviewKey;
    if (runtimeMode !== "db" || !previewKey || !persistedSet || persistedSet.status !== "working" || completedRecord || !(planningLifecycleService instanceof DbPlanningLifecycleClient)) {
      setPlanningDraftConflictPreview(null);
      return;
    }
    void planningLifecycleService.previewPlanningSetConflict({
      setId: persistedSet.id,
      serviceDate,
      rows: planningRows,
    }).then((result) => {
      if (request !== planningDraftConflictPreviewRequest.current) return;
      if (!result.success) {
        setPlanningDraftConflictPreview(null);
        return;
      }
      const value = result.value as { conflictingRowIndexes?: number[] };
      setPlanningDraftConflictPreview({ key: previewKey, conflictingRowIndexes: value.conflictingRowIndexes ?? [] });
    }).catch(() => {
      if (request === planningDraftConflictPreviewRequest.current) setPlanningDraftConflictPreview(null);
    });
    return () => {
      if (planningDraftConflictPreviewRequest.current === request) planningDraftConflictPreviewRequest.current += 1;
    };
  }, [runtimeMode, planningConflictPreviewKey, persistedSet?.id, persistedSet?.status, completedRecord?.id, serviceDate, planningLifecycleService]);

  useEffect(() => {
    const request = ++completedInvalidationPreviewRequest.current;
    if (runtimeMode !== "db" || selectedRole !== "admin" || !completedRecord || !(planningLifecycleService instanceof DbPlanningLifecycleClient)) {
      setCompletedInvalidationPreview(null);
      return;
    }
    const input = completedDraftInput(completedRecord);
    void planningLifecycleService.previewCompletedRecordInvalidation(input)
      .then((result) => {
        if (request !== completedInvalidationPreviewRequest.current) return;
        setCompletedInvalidationPreview(result.success ? result.value as CompletedPlanInvalidationPreview : null);
      })
      .catch(() => {
        if (request === completedInvalidationPreviewRequest.current) setCompletedInvalidationPreview(null);
      });
    return () => {
      if (completedInvalidationPreviewRequest.current === request) completedInvalidationPreviewRequest.current += 1;
    };
  }, [runtimeMode, selectedRole, completedRecord?.id, serviceDate, serviceTime, serviceLanguage, priest, priestId, organist, organistId, serviceNote, referenceAntiphon, referenceTopic, candidateAntiphonKey, candidateSeasonKey, planningRows, planningLifecycleService]);

  useEffect(() => {
    const request = ++selectedCandidateAvailabilityRequest.current;
    if (!candidateAvailabilityApplies || selectedCandidateRows.length === 0) {
      setSelectedCandidateAvailability({ key: candidateAvailabilityKey, byRow: {} });
      return;
    }
    if (!serviceDate) {
      setSelectedCandidateAvailability({
        key: candidateAvailabilityKey,
        byRow: Object.fromEntries(selectedCandidateRows.map((selected) => [selected.rowId, "unavailable"])) as Record<number, SelectedCandidateAvailability>,
      });
      return;
    }
    void Promise.all(selectedCandidateRows.map(async (selected) => {
      if (serviceLanguage !== "mixed" && selected.language !== serviceLanguage) return [selected.rowId, "unavailable"] as const;
      try {
        const candidates = await interactionClient.queryCandidates({
          serviceDate,
          serviceLanguage,
          organistPersonId: organistId,
          referenceAntiphonId: referenceAntiphon?.id,
          referenceTopicId: referenceTopic?.id,
          antiphonKey: candidateAntiphonKey,
          liturgicalSeasonKey: candidateSeasonKey,
          queryText: "",
          preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD,
          candidateUsages: getCanonicalCandidateUsages(selected.rowId),
          currentPlanId: persistedSet?.id,
        });
        const candidate = candidates.find((item) => item.songId === selected.songId);
        return [selected.rowId, candidate?.availability.kind === "available" ? "available" : "unavailable"] as const;
      } catch {
        return [selected.rowId, "error"] as const;
      }
    })).then((entries) => {
      if (request !== selectedCandidateAvailabilityRequest.current) return;
      setSelectedCandidateAvailability({
        key: candidateAvailabilityKey,
        byRow: Object.fromEntries(entries) as Record<number, SelectedCandidateAvailability>,
      });
    });
    return () => {
      if (selectedCandidateAvailabilityRequest.current === request) selectedCandidateAvailabilityRequest.current += 1;
    };
  }, [candidateAvailabilityKey, interactionClient, candidateAvailabilityApplies]);
  useEffect(() => {
    setWorkspace((current) => getSafeWorkspace(current, selectedRole));
  }, [selectedRole]);


  async function getEligibleDraftPeopleDefaults(records: CompletedServiceRecord[]): Promise<DraftPeopleDefaults> {
    const defaults = getDraftPeopleDefaults(records);
    const [priestResult, organistResult] = await Promise.all([
      defaults.priest.id ? catalogClient.getPerson({ id: defaults.priest.id }) : Promise.resolve({ success: false as const, error: { code: "notFound" as const, message: "No default priest." } }),
      defaults.organist.id ? catalogClient.getPerson({ id: defaults.organist.id }) : Promise.resolve({ success: false as const, error: { code: "notFound" as const, message: "No default organist." } }),
    ]);
    const priest = priestResult.success && priestResult.value.active && priestResult.value.priest ? { id: priestResult.value.id, displayName: priestResult.value.displayName } : { displayName: "Anonymous" };
    const organist = organistResult.success && organistResult.value.active && organistResult.value.organist ? { id: organistResult.value.id, displayName: organistResult.value.displayName } : { displayName: "Anonymous" };
    return { priest, organist };
  }

  async function refreshDbSets() {
    if (runtimeMode === "db" && planningLifecycleService instanceof DbPlanningLifecycleClient) {
      const snapshot = await planningLifecycleService.getWorkspaceSnapshot();
      if (snapshot.success) {
        setSavedDbSets(snapshot.value.activeSets);
        setCompletedRecords(snapshot.value.completedRecords);
        setDraftPeopleDefaults(snapshot.value.draftPeopleDefaults);
        return snapshot.value;
      }
      return { activeSets: savedDbSets, completedRecords, draftPeopleDefaults };
    }

    const [result, completedResult] = await Promise.all([
      planningLifecycleService.listPlanningSets(),
      planningLifecycleService.listCompletedRecords(),
    ]);
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


  async function enrichEditableRowsWithCurrentSheetMusic(rowsToEnrich: EditableRow[]): Promise<EditableRow[]> {
    const songIds = [...new Set(rowsToEnrich.flatMap((row) => row.selectedSong?.songId ? [row.selectedSong.songId] : []))];
    if (songIds.length === 0) return rowsToEnrich;
    if (runtimeMode === "db" && catalogClient instanceof DbCatalogClient) {
      const result = await catalogClient.getSongs({ songIds });
      if (!result.success) return rowsToEnrich;
      const byId = new Map<string, CatalogSong>((result.value as CatalogSong[]).map((song) => [song.songId, song]));
      return rowsToEnrich.map((row) => {
        if (!row.selectedSong?.songId) return row;
        const current = byId.get(row.selectedSong.songId);
        return current?.sheetMusicUrl ? { ...row, selectedSong: { ...row.selectedSong, sheetMusicUrl: current.sheetMusicUrl } } : row;
      });
    }
    return enrichRowsWithCurrentSheetMusic(rowsToEnrich, { findSongById: async (songId) => { const result = await catalogClient.getSong({ songId }); return result.success ? result.value : undefined; } });
  }

  async function hydrateEditableRows(rowsToHydrate: EditableRow[], context: { organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string }): Promise<EditableRow[]> {
    const rowIndexes = rowsToHydrate.map((row, index) => row.selectedSong?.songId ? index : -1).filter((index) => index >= 0);
    const songs = rowIndexes.map((index) => rowsToHydrate[index].selectedSong!).filter((song): song is NonNullable<PlanningRow["song"]> => Boolean(song.songId));
    if (songs.length === 0) return rowsToHydrate;
    try {
      const hydrated = await interactionClient.hydrateCandidates({ songs, organistPersonId: context.organistPersonId, referenceAntiphonId: context.referenceAntiphonId, referenceTopicId: context.referenceTopicId, antiphonKey: context.antiphonKey, liturgicalSeasonKey: context.liturgicalSeasonKey });
      return rowsToHydrate.map((row, index) => {
        const hydratedIndex = rowIndexes.indexOf(index);
        return hydratedIndex >= 0 && hydrated[hydratedIndex] ? { ...row, selectedCandidate: hydrated[hydratedIndex] } : row;
      });
    } catch {
      // Historical rows remain usable even when current authoritative metadata cannot be refreshed.
      return rowsToHydrate;
    }
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
    setReferenceAntiphon(set.serviceContext.referenceAntiphon ? { ...set.serviceContext.referenceAntiphon } : undefined);
    setReferenceTopic(set.serviceContext.referenceTopic ? { ...set.serviceContext.referenceTopic } : undefined);
    setServiceContextGeneration((current) => current + 1);
    setCandidateAntiphonKey(set.serviceContext.antiphonKey ?? "");
    setCandidateSeasonKey(set.serviceContext.liturgicalSeasonKey ?? "");
    const editableRows = set.rows.length ? set.rows.map((row, index) => fromPlanningRow(row, index + 1)) : [createEmptyRow(1, set.serviceContext.language)];
    setRows(await hydrateEditableRows(await enrichEditableRowsWithCurrentSheetMusic(editableRows), { organistPersonId: set.serviceContext.organist.id, referenceAntiphonId: set.serviceContext.referenceAntiphon?.id, referenceTopicId: set.serviceContext.referenceTopic?.id, antiphonKey: set.serviceContext.antiphonKey, liturgicalSeasonKey: set.serviceContext.liturgicalSeasonKey }));
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
    setReferenceAntiphon(record.serviceContext.referenceAntiphon ? { ...record.serviceContext.referenceAntiphon } : undefined);
    setReferenceTopic(record.serviceContext.referenceTopic ? { ...record.serviceContext.referenceTopic } : undefined);
    setServiceContextGeneration((current) => current + 1);
    setCandidateAntiphonKey(record.serviceContext.antiphonKey ?? "");
    setCandidateSeasonKey(record.serviceContext.liturgicalSeasonKey ?? "");
    const editableRows = record.set.rows.length ? record.set.rows.map((row, index) => fromPlanningRow(row, index + 1)) : [createEmptyRow(1, record.serviceContext.language)];
    setRows(await hydrateEditableRows(await enrichEditableRowsWithCurrentSheetMusic(editableRows), { organistPersonId: record.serviceContext.organist.id, referenceAntiphonId: record.serviceContext.referenceAntiphon?.id, referenceTopicId: record.serviceContext.referenceTopic?.id, antiphonKey: record.serviceContext.antiphonKey, liturgicalSeasonKey: record.serviceContext.liturgicalSeasonKey }));
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
    setReferenceAntiphon(undefined);
    setReferenceTopic(undefined);
    setServiceContextGeneration((current) => current + 1);
    setCandidateAntiphonKey("");
    setCandidateSeasonKey("");
    setRows([createEmptyRow(1, initialServiceLanguage)]);
    setNextRowId(2);
  }

  async function startNewDbDraft() {
    const defaults = draftPeopleDefaults;
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
    setReferenceAntiphon(undefined);
    setReferenceTopic(undefined);
    setServiceContextGeneration((current) => current + 1);
    setCandidateAntiphonKey("");
    setCandidateSeasonKey("");
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
      else { lookupTracker.invalidatePrefix("song:"); setOrganist(person.displayName); setOrganistId(person.id); }
    });
  }

  function selectAnonymous(role: PersonRole) {
    lookupTracker.invalidate(getPersonLookupScope(role));
    guardedEditorUpdate(() => {
      if (role === "priest") { setPriest("Anonymous"); setPriestId(undefined); }
      else { lookupTracker.invalidatePrefix("song:"); setOrganist("Anonymous"); setOrganistId(undefined); }
    });
  }

  function getCanonicalCandidateUsages(activeRowId: number) {
    return buildCanonicalCandidateUsages({
      currentPlanId: persistedSet?.id,
      serviceDate,
      completedRecords: completedRecords.map((record) => ({ id: record.id, serviceDate: record.serviceContext.serviceDate, rows: record.set.rows.map((row) => ({ songId: row.song?.songId })) })),
      plans: savedDbSets.map((set) => ({ id: set.id, status: set.status, serviceDate: set.serviceContext.serviceDate, rows: set.rows.map((row) => ({ songId: row.song?.songId })) })),
      currentRows: rows.map((row, index) => ({ rowId: row.id, rowLabel: `Row ${index + 1}`, songId: row.selectedSong?.songId })),
      activeRowId,
    });
  }

  async function queryCandidateResults(rowId: number, value: string) {
    const scope = getSongLookupScope(rowId);
    const languageAtRequest = serviceLanguage;
    const requestIdentity = [runtimeMode, serviceContextRecordKey, serviceDate, languageAtRequest, organistId ?? "", referenceAntiphon?.id ?? "", referenceTopic?.id ?? "", value].join("|");
    const token = lookupTracker.begin(scope, requestIdentity);
    setCandidateLoading((current) => ({ ...current, [rowId]: true }));
    setCandidateErrors((current) => ({ ...current, [rowId]: undefined }));
    setCandidateResults((current) => ({ ...current, [rowId]: [] }));
    try {
      const candidates = await interactionClient.queryCandidates(isCompletedRecordOpen ? { serviceDate, serviceLanguage: languageAtRequest, queryText: value, candidateUsages: [], historicalTruth: true } : { serviceDate, serviceLanguage: languageAtRequest, organistPersonId: organistId, referenceAntiphonId: referenceAntiphon?.id, referenceTopicId: referenceTopic?.id, antiphonKey: candidateAntiphonKey, liturgicalSeasonKey: candidateSeasonKey, queryText: value, preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD, candidateUsages: getCanonicalCandidateUsages(rowId), currentPlanId: persistedSet?.id });
      if (!lookupTracker.isCurrent(token, requestIdentity)) return;
      setCandidateResults((current) => ({ ...current, [rowId]: candidates }));
      setCandidateLoading((current) => ({ ...current, [rowId]: false }));
      setCandidateErrors((current) => ({ ...current, [rowId]: undefined }));
      setServiceError(null);
    } catch (error) {
      if (!lookupTracker.isCurrent(token, requestIdentity)) return;
      const candidateError = error as Error & { code?: PlanningServiceError["code"] };
      const message = candidateError.message || "Candidate lookup failed.";
      setCandidateResults((current) => ({ ...current, [rowId]: [] }));
      setCandidateLoading((current) => ({ ...current, [rowId]: false }));
      setCandidateErrors((current) => ({ ...current, [rowId]: message }));
      setServiceError({ code: candidateError.code ?? "invalidInput", message });
    }
  }

  async function loadDetailEligibility(rowId: number) {
    const request = ++detailEligibilityRequest.current;
    setDetailEligibilityCandidates([]);
    setDetailEligibilityError(undefined);
    setDetailEligibilityLoading(true);
    try {
      const candidates = await interactionClient.queryCandidates(isCompletedRecordOpen ? {
        serviceDate,
        serviceLanguage,
        queryText: "",
        candidateUsages: [],
        historicalTruth: true,
      } : {
        serviceDate,
        serviceLanguage,
        organistPersonId: organistId,
        referenceAntiphonId: referenceAntiphon?.id,
        referenceTopicId: referenceTopic?.id,
        antiphonKey: candidateAntiphonKey,
        liturgicalSeasonKey: candidateSeasonKey,
        queryText: "",
        preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD,
        candidateUsages: getCanonicalCandidateUsages(rowId),
        currentPlanId: persistedSet?.id,
      });
      if (request !== detailEligibilityRequest.current) return;
      setDetailEligibilityCandidates(candidates);
      setPlanningExpansion((current) => {
        if (!current || current.kind === "candidateList" || current.rowId !== rowId) return current;
        const refreshedCandidate = candidates.find((candidate) => candidate.songId === current.songId);
        return refreshedCandidate ? { ...current, candidate: refreshedCandidate } : current;
      });
      setDetailEligibilityLoading(false);
    } catch (error) {
      if (request !== detailEligibilityRequest.current) return;
      setDetailEligibilityCandidates([]);
      setDetailEligibilityLoading(false);
      setDetailEligibilityError(error instanceof Error ? error.message : "Replacement eligibility could not be checked.");
    }
  }

  function resetDetailEligibility() {
    detailEligibilityRequest.current += 1;
    setDetailEligibilityCandidates([]);
    setDetailEligibilityLoading(false);
    setDetailEligibilityError(undefined);
  }

  function openCandidateDetail(rowId: number, candidate: CandidateQueryResult) {
    const row = rows.find((item) => item.id === rowId);
    setPlanningExpansion({ kind: "candidateDetail", rowId, songId: candidate.songId, candidate, returnQuery: row?.songSearch ?? "" });
    void loadDetailEligibility(rowId);
  }

  function backToCandidateList() {
    if (planningExpansion?.kind !== "candidateDetail") return;
    const { rowId, songId, returnQuery } = planningExpansion;
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupChanged", text: returnQuery }) : row));
    setPlanningExpansion({ kind: "candidateList", rowId, focusSongId: songId });
    resetDetailEligibility();
    void queryCandidateResults(rowId, returnQuery);
  }

  function showCandidateFromDetail(songId: string) {
    if (planningExpansion?.kind !== "candidateDetail") return;
    const target = detailEligibilityCandidates.find((candidate) => candidate.songId === songId);
    if (!target) return;
    const rowId = planningExpansion.rowId;
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupChanged", text: "" }) : row));
    setCandidateResults((current) => ({ ...current, [rowId]: detailEligibilityCandidates }));
    setPlanningExpansion({ kind: "candidateDetail", rowId, songId: target.songId, candidate: target, returnQuery: "" });
  }

  function openSelectedSongDetail(rowId: number, candidate: CandidateQueryResult) {
    lookupTracker.invalidatePrefix("song:");
    setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    setPlanningExpansion({ kind: "selectedSongDetail", rowId, songId: candidate.songId, candidate });
    void loadDetailEligibility(rowId);
  }

  function closeSelectedSongDetail(rowId: number) {
    setPlanningExpansion(null);
    resetDetailEligibility();
    queueMicrotask(() => document.getElementById(`selected-song-detail-button-${rowId}`)?.focus());
  }

  function replaceFromSelectedDetail(rowId: number, candidate: CandidateQueryResult) {
    if (candidate.availability.kind !== "available") {
      setDetailEligibilityError(`Same melody is already used in ${candidate.availability.rows.map((row) => row.label).join(" and ")}.`);
      return;
    }
    const currentRow = rows.find((row) => row.id === rowId);
    if (currentRow?.selectedSong?.songId === candidate.songId) {
      closeSelectedSongDetail(rowId);
      return;
    }
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId
      ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate })
      : row)));
    setPlanningExpansion(null);
    resetDetailEligibility();
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }

  function retryDetailEligibility() {
    if (planningExpansion && planningExpansion.kind !== "candidateList") void loadDetailEligibility(planningExpansion.rowId);
  }

  function openCandidateList(rowId: number) {
    if (!canEditRows || (planningExpansion?.kind === "candidateList" && planningExpansion.rowId === rowId)) return;
    resetDetailEligibility();
    lookupTracker.invalidatePrefix("song:");
    setRows((currentRows) => openSingleCandidateRow(currentRows, rowId));
    setPlanningExpansion({ kind: "candidateList", rowId });
    setCandidateResults({});
    setCandidateLoading({ [rowId]: true });
    setCandidateErrors({});
    void queryCandidateResults(rowId, "");
  }

  async function updateSongSearch(rowId: number, value: string) {
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupChanged", text: value }) : row));
    await queryCandidateResults(rowId, value);
  }

  function closeCandidateList(rowId: number) {
    lookupTracker.invalidate(getSongLookupScope(rowId));
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    if (openCandidateRowId === rowId) setPlanningExpansion(null);
    setCandidateResults((current) => { const next = { ...current }; delete next[rowId]; return next; });
    setCandidateLoading((current) => { const next = { ...current }; delete next[rowId]; return next; });
    setCandidateErrors((current) => { const next = { ...current }; delete next[rowId]; return next; });
  }

  function selectCandidate(rowId: number, candidate: CandidateQueryResult) {
    if (candidate.availability.kind !== "available") {
      setServiceError({ code: "invalidInput", message: `Same melody is already used in ${candidate.availability.rows.map((row) => row.label).join(" and ")}.` });
      return;
    }
    const currentRow = rows.find((row) => row.id === rowId);
    lookupTracker.invalidatePrefix("song:");
    if (currentRow?.selectedSong?.songId === candidate.songId) {
      setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    } else {
      guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate }) : row)));
    }
    setPlanningExpansion(null);
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }

  function clearRow(rowId: number) {
    resetDetailEligibility();
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "rowCleared" }) : row)));
    setPlanningExpansion(null);
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }

  function focusNoteField(rowId: number) {
    lookupTracker.invalidatePrefix("song:");
    setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    setPlanningExpansion(null);
    resetDetailEligibility();
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    activateExistingRow(rowId);
  }

  function cancelActiveLookup(rowId: number) {
    closeCandidateList(rowId);
    setServiceError(null);
  }

  function activateExistingRow(rowId: number) {
    setRows((currentRows) => restoreRowsExceptActive(currentRows, rowId));
  }

  function updateRow(id: number, changes: Partial<EditableRow>) {
    guardedEditorUpdate(() => setRows((currentRows) =>
      currentRows.map((row) => (row.id === id && typeof changes.note === "string" ? planningCandidateRowReducer({ ...row, ...changes }, { type: "noteChanged", note: changes.note }) : row.id === id ? { ...row, ...changes } : row)),
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
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.filter((row) => row.id !== id)));
    if (planningExpansion?.rowId === id) {
      setPlanningExpansion(null);
      resetDetailEligibility();
    } else if (planningExpansion !== null) setCandidateRefreshGeneration((generation) => generation + 1);
    setSongResults({});
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
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
    lookupTracker.invalidatePrefix("song:");
    setSongResults({});
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    if (planningExpansion !== null) setCandidateRefreshGeneration((generation) => generation + 1);
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateServiceLanguage(nextServiceLanguage: ServiceLanguage) {
    guardedEditorUpdate(() => {
      setServiceLanguage(nextServiceLanguage);
      setRows((currentRows) => preserveRowsOnServiceLanguageChange(currentRows, nextServiceLanguage));
      lookupTracker.invalidatePrefix("song:");
      setSongResults(clearSongLookupResultsOnServiceLanguageChange());
      setCandidateResults({});
    });
  }

  async function saveWorkingSet() {
    if (isCompletedRecordOpen || isFinalSetOpen) return;
    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }
    if (hasAntiphonLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." }); setSaveState("errors"); return; }
    if (hasTopicLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected topic must match the service language." }); setSaveState("errors"); return; }
    if (hasCandidateAvailabilityBlock) { setServiceError({ code: "invalidInput", message: hasUnavailableCandidates ? "Every candidate must be available." : hasCandidateAvailabilityError ? "Candidate availability could not be checked." : "Candidate availability is being checked." }); setSaveState("errors"); return; }
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
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
      existingSetId: persistedSet?.status === "working" ? persistedSet.id : undefined,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
        ...(serviceNote.trim() ? { note: serviceNote.trim() } : {}),
        ...(referenceAntiphon ? { referenceAntiphon: { ...referenceAntiphon } } : {}),
        ...(referenceTopic ? { referenceTopic: { ...referenceTopic } } : {}),
        ...(candidateAntiphonKey.trim() ? { antiphonKey: candidateAntiphonKey.trim() } : {}),
        ...(candidateSeasonKey.trim() ? { liturgicalSeasonKey: candidateSeasonKey.trim() } : {}),
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
    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "working") return;
    if (!hasConcreteFinalPeople) {
      setServiceError({ code: "invalidInput", message: "Choose a concrete active priest and organist before finalization." });
      setSaveState("errors");
      return;
    }
    if (!hasServiceContext) {
      setServiceError({ code: "invalidInput", message: "Complete the service context before finalization." });
      setSaveState("errors");
      return;
    }
    if (hasInvalidLookupState) {
      setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before finalization." });
      setSaveState("errors");
      return;
    }
    if (hasAntiphonLanguageMismatch) {
      setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." });
      setSaveState("errors");
      return;
    }
    if (hasTopicLanguageMismatch) {
      setServiceError({ code: "invalidInput", message: "Selected topic must match the service language." });
      setSaveState("errors");
      return;
    }
    if (hasCandidateAvailabilityBlock) {
      setServiceError({ code: "invalidInput", message: hasUnavailableCandidates ? "Every candidate must be available." : hasCandidateAvailabilityError ? "Candidate availability could not be checked." : "Candidate availability is being checked." });
      setSaveState("errors");
      return;
    }
    if (hasMelodyCollisions) {
      setServiceError({ code: "invalidInput", message: melodyFinalizationReason ?? "Cannot finalize: the same melody is used more than once." });
      setSaveState("errors");
      return;
    }

    const languageDeviationConfirmation = confirmLanguageDeviationSave(planningRows, serviceLanguage, window.confirm);
    if (languageDeviationConfirmation.cancelled) {
      setServiceError({ code: "invalidInput", message: "Finalization cancelled. Rows " + languageDeviationConfirmation.deviationRows.join(", ") + " do not match the " + serviceLanguage + " service language." });
      setSaveState("errors");
      return;
    }

    const saveResult = await planningLifecycleService.saveWorkingSet({
      role: selectedRole,
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
      existingSetId: persistedSet.id,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
        ...(serviceNote.trim() ? { note: serviceNote.trim() } : {}),
        ...(referenceAntiphon ? { referenceAntiphon: { ...referenceAntiphon } } : {}),
        ...(referenceTopic ? { referenceTopic: { ...referenceTopic } } : {}),
        ...(candidateAntiphonKey.trim() ? { antiphonKey: candidateAntiphonKey.trim() } : {}),
        ...(candidateSeasonKey.trim() ? { liturgicalSeasonKey: candidateSeasonKey.trim() } : {}),
      },
      set: { status: "working", language: serviceLanguage, rows: planningRows },
      allowLanguageDeviations: languageDeviationConfirmation.allowLanguageDeviations || undefined,
    });
    if (!saveResult.success) {
      setServiceError(saveResult.error);
      setSaveState("errors");
      return;
    }

    const result = await planningLifecycleService.finalizeWorkingSet({
      role: selectedRole,
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
      workingSetId: saveResult.value.id,
    });
    if (!result.success) {
      const peopleIssue = result.error.issues?.some((issue: { path: string }) => issue.path === "priest" || issue.path === "organist");
      setServiceError(peopleIssue ? { code: result.error.code, message: "Choose a concrete active priest and organist before finalization." } : result.error);
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

  async function reopenFinalSet() {
    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "final" || selectedRole !== "admin") return;
    const result = await planningLifecycleService.reopenFinalSet({
      role: selectedRole,
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
      finalSetId: persistedSet.id,
    });
    if (!result.success) { setServiceError(result.error); setSaveState("errors"); return; }
    setServiceError(null);
    setSaveState("saved");
    await openPersistedSet(result.value);
    await refreshDbSets();
    setWorkspace("planning");
  }

  async function completeFinalSet() {
    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "final") {
      return;
    }

    const result = await planningLifecycleService.completeFinalSet({
      role: selectedRole,
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
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
    if (hasAntiphonLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." }); setSaveState("errors"); return; }
    if (hasTopicLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected topic must match the service language." }); setSaveState("errors"); return; }
    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }

    const baseInput = completedDraftInput(completedRecord);
    const previewImpacts = completedInvalidationPreview?.newlyImpactedPlans ?? [];
    let acceptedPreviewInvalidation = false;
    if (previewImpacts.length > 0) {
      acceptedPreviewInvalidation = window.confirm(`This historical correction invalidates active plans:

${previewImpacts.map((impact) => `• ${impact.reason} ${impact.planStatus === "final" ? "This Final plan will move to Working." : "This Working plan will require revision."}`).join("\n")}

Save the correction and mark those plans for revision?`);
      if (!acceptedPreviewInvalidation) {
        setServiceError(null);
        setSaveState("unsaved");
        return;
      }
    }

    let result = await planningLifecycleService.updateCompletedRecord({ ...baseInput, ...(acceptedPreviewInvalidation ? { acceptPlanInvalidation: true } : {}) });
    if (!result.success) {
      const retroIssues = result.error.issues?.filter((issue: { path: string }) => issue.path.startsWith("retroactivePlan.")) ?? [];
      if (retroIssues.length > 0) {
        const accepted = window.confirm(`This historical correction invalidates active plans:

${retroIssues.map((issue: { message: string }) => `• ${issue.message}`).join("\n")}

Save the correction and mark those plans for revision?`);
        if (!accepted) {
          setServiceError(null);
          setSaveState("unsaved");
          return;
        }
        result = await planningLifecycleService.updateCompletedRecord({ ...baseInput, acceptPlanInvalidation: true });
      }
    }
    if (!result.success) { setServiceError(result.error); setSaveState("errors"); return; }

    setLastSavedRecord({ kind: "completed", id: result.value.id });
    setServiceError(null);
    setCompletedInvalidationPreview(null);
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
    const result = await planningLifecycleService.deleteCompletedRecord({ role: selectedRole, ...({ localActorUserId: activeActor.userId } as Record<string, string>), recordId: deletedRecordId });
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
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
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
    if (nextWorkspace !== workspace && workspace === "planning") {
      lookupTracker.invalidatePrefix("song:");
      setPlanningExpansion(null);
      resetDetailEligibility();
      setCandidateResults({});
      setCandidateLoading({});
      setCandidateErrors({});
      setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    }
    setWorkspace(nextWorkspace);
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

        {workspace !== "planning" && <div className={`status status-${saveState}`} role="status">
          {saveState === "unsaved" && "Unsaved"}
          {saveState === "saved" && (runtimeMode === "db" ? "Saved to DB" : "Saved in memory")}
          {saveState === "finalized" && (runtimeMode === "db" ? "Finalized in DB" : "Finalized in memory")}
          {saveState === "completed" && (runtimeMode === "db" ? "Completed in DB" : "Completed in memory")}
          {saveState === "deleted" && (runtimeMode === "db" ? "Deleted from DB" : "Deleted from memory")}
          {saveState === "errors" && "Service error"}
        </div>}

        {workspace === "plans" && (
          <section className="db-workspace" aria-label="Plans">
            {revisionPlanCount > 0 && <p className="error-summary" role="alert">{revisionPlanCount} conflicting plan{revisionPlanCount === 1 ? "" : "s"} {revisionPlanCount === 1 ? "requires" : "require"} revision.</p>}
            <div className="rows-header"><h2>Working plans</h2><button type="button" onClick={startNewDbDraft}>Start new set</button></div>
            {activeRecordGroups.working.length === 0 ? <p className="field-help">No working plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.working.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}><button type="button" className={set.needsRevision ? "needs-revision-record" : undefined} onClick={() => loadDbSet(set.id)}><RecordListSummary summary={formatPlanningSetSummary(set)} /></button></li>)}</ul>}
            <h2>Final plans</h2>
            {activeRecordGroups.final.length === 0 ? <p className="field-help">No final plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.final.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}><button type="button" className={set.needsRevision ? "needs-revision-record" : undefined} onClick={() => loadDbSet(set.id)}><RecordListSummary summary={formatPlanningSetSummary(set)} /></button></li>)}</ul>}
          </section>
        )}

        {workspace === "history" && (
          <section className="db-workspace" aria-label="Completed history">
            <h2>Completed history</h2>
            {historyConflictCount > 0 && <p className="error-summary" role="alert">{historyConflictCount} completed service{historyConflictCount === 1 ? "" : "s"} conflict{historyConflictCount === 1 ? "s" : ""} with active plans.</p>}
            {completedRecordsNewestFirst.length === 0 ? <p className="field-help">No completed service records saved yet.</p> : <ul className="saved-set-list history-scroll-list">{completedRecordsNewestFirst.map((record) => <li key={record.id} className={recordListClassName(completedRecord?.id === record.id, lastSavedRecord?.kind === "completed" && lastSavedRecord.id === record.id)}><button type="button" className={record.conflictState ? "needs-revision-record" : undefined} onClick={() => loadCompletedRecord(record.id)}><RecordListSummary summary={formatCompletedRecordSummary(record)} /></button></li>)}</ul>}
          </section>
        )}

        {workspace === "planning" && (
        <form className="planning-form" onSubmit={(event) => event.preventDefault()}>
          <div className="planning-context-header">
            <div className="planning-context-info" aria-label="Planning status and opened record">
              <div className={`status status-${saveState}`} role="status">
                {saveState === "unsaved" && "Unsaved"}
                {saveState === "saved" && (runtimeMode === "db" ? "Saved to DB" : "Saved in memory")}
                {saveState === "finalized" && (runtimeMode === "db" ? "Finalized in DB" : "Finalized in memory")}
                {saveState === "completed" && (runtimeMode === "db" ? "Completed in DB" : "Completed in memory")}
                {saveState === "deleted" && (runtimeMode === "db" ? "Deleted from DB" : "Deleted from memory")}
                {saveState === "errors" && "Service error"}
              </div>
              {persistedSet && <p className="saved-summary">Opened {formatPlanningSetSummary(persistedSet)}.</p>}
              {completedRecord && <p className="saved-summary">Opened {formatCompletedRecordSummary(completedRecord)}.</p>}
              {savedWorkingSet && saveState === "saved" && (
                <p className="saved-summary">
                  Saved {savedWorkingSet.rows.length} row{savedWorkingSet.rows.length === 1 ? "" : "s"} for{" "}
                  {savedWorkingSet.serviceDate || "an unscheduled service"}.
                </p>
              )}
            </div>
            <div className="planning-melody-protection-slot" aria-label="Melody Protection reserved area">
              {selectedRole === "admin" && (
                <NonRepetitionPeriodPanel
                  runtimeMode={runtimeMode}
                  actor={activeActor}
                  memoryInteractionRepository={interactionRepository}
                  memoryPlanningSets={repositories.planningSets}
                  onSaved={() => {
                    lookupTracker.invalidatePrefix("song:");
                    setCandidateResults({});
                    setCandidateLoading({});
                    setCandidateErrors({});
                    setCandidateRefreshGeneration((generation) => generation + 1);
                  }}
                />
              )}
            </div>
          </div>

          <fieldset className="field-group planning-service-context">
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
              <select className="planning-person-select" disabled={isEditorLocked} value={priestId ?? ""} onChange={(event) => { if (!event.target.value) selectAnonymous("priest"); else { const person = priestResults.find((p) => p.id === event.target.value); if (person) selectPerson("priest", person); } }}>
                <option value="">Anonymous</option>
                {priestId && !priestResults.some((person) => person.id === priestId) && <option value={priestId} disabled aria-label={`Historical inactive priest ${priest}`}>{priest} (historical inactive)</option>}
                {priestResults.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
              <span className="field-help">{priestId ? "Selected priest." : "Anonymous is allowed while the plan is Working."}</span>
            </label>
            <label>
              Organist
              <select className="planning-person-select" disabled={isEditorLocked} value={organistId ?? ""} onChange={(event) => { if (!event.target.value) selectAnonymous("organist"); else { const person = organistResults.find((p) => p.id === event.target.value); if (person) selectPerson("organist", person); } }}>
                <option value="">Anonymous</option>
                {organistId && !organistResults.some((person) => person.id === organistId) && <option value={organistId} disabled aria-label={`Historical inactive organist ${organist}`}>{organist} (historical inactive)</option>}
                {organistResults.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
              <span className="field-help">{isCompletedRecordOpen ? "Historical truth mode: no Planning filters are applied." : organistId ? "Selected organist; repertoire filter is active." : "Anonymous: repertoire filter is not applied while choosing candidates."}</span>
            </label>
            <label className="note-field">
              Service note
              <textarea rows={4} disabled={isEditorLocked} value={serviceNote} onChange={(event) => guardedEditorUpdate(() => setServiceNote(event.target.value))} placeholder="Gospel readings, links, or planning information" />
            </label>
            <div className="service-antiphon-topic-row">
              <ServiceContextReferenceAntiphonField
                runtime={runtimeMode}
                editable={!isEditorLocked}
                contextKey={serviceContextRecordKey}
                serviceLanguage={serviceLanguage}
                selected={referenceAntiphon}
                recommendedSong={planningAntiphonRecommendation?.recommendedSong}
                recommendationLoading={planningAntiphonRecommendationLoading}
                recommendationError={planningAntiphonRecommendationError}
                recommendationClient={planningAntiphonRecommendationClient ?? undefined}
                invalid={hasAntiphonLanguageMismatch}
                onChange={(value) => { lookupTracker.invalidatePrefix("song:"); guardedEditorUpdate(() => setReferenceAntiphon(value ? { ...value } : undefined)); }}
              />
              <ServiceContextReferenceTopicField
                runtime={runtimeMode}
                editable={!isEditorLocked}
                contextKey={serviceContextRecordKey}
                serviceLanguage={serviceLanguage}
                selected={referenceTopic}
                invalid={hasTopicLanguageMismatch}
                onChange={(value) => { lookupTracker.invalidatePrefix("song:"); guardedEditorUpdate(() => setReferenceTopic(value ? { ...value } : undefined)); }}
              />
            </div>
          </fieldset>

          <div className="rows-header">
            <h2>Rows</h2>
            <button type="button" onClick={addRow} disabled={!canEditRows}>
              Add row
            </button>
          </div>

          <div className="rows-list">
            {rows.map((row, index) => {
              const planningRevisionConflict = persistedSet && !completedRecord
                ? resolvePlanningDraftConflictRow({
                    persistedConflict: Boolean(persistedSet.needsRevision && conflictingRevisionRowIndexes.has(index)),
                    persistedSongId: persistedSet.rows[index]?.song?.songId,
                    draftSongId: planningRows[index]?.song?.songId,
                    selectedCandidateSuppressedByMelodyWindow: row.selectedCandidate?.suppressedByMelodyWindow,
                    currentPreviewKey: planningConflictPreviewKey,
                    preview: planningDraftConflictPreview,
                    rowIndex: index,
                  })
                : false;
              const revisionConflict = Boolean(planningRevisionConflict || (completedRecord && completedConflictRowIndexes.has(index)));
              const candidateValidationConflict = rowCandidateUnavailable(row) || (
                candidateAvailabilityApplies
                && candidateAvailabilityCurrent
                && selectedCandidateAvailability.byRow[row.id] === "error"
              );
              const emptyRowValidationConflict = !isCompletedRecordOpen
                && Boolean(validationResults[index]?.issues.some((issue) => issue.path === "row"));
              const planningAlertConflict = candidateValidationConflict || emptyRowValidationConflict;
              return (
                <fieldset className={`row-card${revisionConflict ? " needs-revision-row" : ""}${planningAlertConflict ? " planning-alert-row" : ""}`} key={row.id} onFocus={() => { if (openCandidateRowId === null || openCandidateRowId === row.id) activateExistingRow(row.id); }} onKeyDown={(event) => { if (event.key === "Escape") cancelActiveLookup(row.id); }}>
                  <legend>Row {index + 1}</legend>
                  <div className="row-icon-palette" role="group" aria-label={`Row ${index + 1} controls`}>
                    <button type="button" className="row-icon-button" aria-label="Move row up" title="Move row up" onClick={() => moveRow(index, -1)} disabled={!canEditRows || index === 0}>↑</button>
                    <button type="button" className="row-icon-button" aria-label="Move row down" title="Move row down" onClick={() => moveRow(index, 1)} disabled={!canEditRows || index === rows.length - 1}>↓</button>
                    <button type="button" className="row-icon-button" aria-label="Clear row" title="Clear row" onClick={() => clearRow(row.id)} disabled={!canEditRows || (!row.selectedSong && !row.note.trim() && !row.songSearch.trim() && planningExpansion?.rowId !== row.id)}>↶</button>
                    <button type="button" className="row-icon-button row-icon-remove" aria-label="Remove row" title="Remove row" onClick={() => removeRow(row.id)} disabled={!canEditRows || rows.length === 1}>×</button>
                  </div>
                  <div className="compact-row-fields">
                    <div className="song-field-row">
                      <CandidateCombobox
                                              rowId={row.id}
                                              rowLabel={`Row ${index + 1}`}
                                              open={planningExpansion?.kind === "candidateList" && planningExpansion.rowId === row.id}
                                              focusSongId={planningExpansion?.kind === "candidateList" && planningExpansion.rowId === row.id ? planningExpansion.focusSongId : undefined}
                                              detail={planningExpansion?.kind === "candidateDetail" && planningExpansion.rowId === row.id ? {
                                                candidate: planningExpansion.candidate,
                                                eligibilityCandidates: detailEligibilityCandidates,
                                                loading: detailEligibilityLoading,
                                                error: detailEligibilityError,
                                              } : undefined}
                                              value={row.songSearch}
                                              selectedSong={row.selectedSong}
                                              candidates={candidateResults[row.id] ?? []}
                                              loading={candidateLoading[row.id] ?? false}
                                              error={candidateErrors[row.id]}
                                              prerequisiteMessage={undefined}
                                              serviceLanguage={serviceLanguage}
                                              disabled={!canEditRows}
                                              selectionUnavailable={rowCandidateUnavailable(row) && Boolean(row.selectedSong && row.songSearch === formatPlanningSongField(row.selectedSong))}
                                              onOpen={() => openCandidateList(row.id)}
                                              onQueryChange={(value) => { void updateSongSearch(row.id, value); }}
                                              onSelect={(candidate) => selectCandidate(row.id, candidate)}
                                              onCancel={() => cancelActiveLookup(row.id)}
                                              onRetry={() => { void queryCandidateResults(row.id, row.songSearch); }}
                                              onOpenDetail={(candidate) => openCandidateDetail(row.id, candidate)}
                                              onBackFromDetail={backToCandidateList}
                                              onRetryDetail={retryDetailEligibility}
                                              onShowDetailCandidate={showCandidateFromDetail}
                                            />
                      <button
                        id={`selected-song-detail-button-${row.id}`}
                        type="button"
                        className="song-field-detail"
                        disabled={!row.selectedSong}
                        onClick={() => row.selectedSong && openSelectedSongDetail(row.id, row.selectedCandidate ?? candidateFromSelectedSong(row.selectedSong))}
                      >
                        Detail
                      </button>
                    </div>
                    <input
                      className="row-note-input"
                      aria-label={`Text note for Row ${index + 1}`}
                      type="text"
                      value={row.note}
                      readOnly={!canEditRows}
                      onFocus={() => focusNoteField(row.id)}
                      onChange={(event) => updateRow(row.id, { note: event.target.value })}
                      placeholder="Text note"
                    />
                  </div>
                  {planningExpansion?.kind === "selectedSongDetail" && planningExpansion.rowId === row.id && (
                    <MelodyClassDetail
                      mode="selected"
                      rowLabel={`Row ${index + 1}`}
                      candidate={planningExpansion.candidate}
                      serviceLanguage={serviceLanguage}
                      currentSongId={row.selectedSong?.songId}
                      eligibilityCandidates={detailEligibilityCandidates}
                      loading={detailEligibilityLoading}
                      error={detailEligibilityError}
                      onClose={() => closeSelectedSongDetail(row.id)}
                      onRetry={retryDetailEligibility}
                      onReplace={canEditRows ? (candidate) => replaceFromSelectedDetail(row.id, candidate) : undefined}
                    />
                  )}
                </fieldset>
              );
            })}
          </div>

          {planningActionValidationMessages.length > 0 && (
            <ul className="validation-list planning-action-validation-list" aria-label="Planning action validation errors">
              {planningActionValidationMessages.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}

          {isCompletedRecordOpen && completedConflictPlanCount > 0 && (
            <p className="error-summary completed-invalidation-warning" role="alert">
              Historical correction conflicts with {completedConflictPlanCount} active plan{completedConflictPlanCount === 1 ? "" : "s"}{completedConflictImpacts.length > 0 ? `: ${completedConflictImpacts.map((impact) => formatConflictPreviewPlanLabel(impact, savedDbSets)).join(", ")}` : ""}.{completedInvalidationPreview && completedInvalidationPreview.newlyImpactedPlans.length > 0 ? " New conflict added." : ""}
            </p>
          )}

          <div className="form-actions">
            <>
                {!isCompletedRecordOpen && !isFinalSetOpen && (
                  <>
                    <button className="save-button" type="button" onClick={saveWorkingSet} disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasAntiphonLanguageMismatch}>
                      Save working set
                    </button>
                    <button type="button" onClick={finalizeWorkingSet} disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || !hasConcreteFinalPeople || !hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasMelodyCollisions || hasAntiphonLanguageMismatch}>
                      Finalize set
                    </button>
                  </>
                )}
                {!isCompletedRecordOpen && (
                  <>
                    {isFinalSetOpen && selectedRole === "admin" && <button type="button" onClick={reopenFinalSet}>Reopen for editing</button>}
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
                    <button className="save-button" type="button" onClick={saveCompletedChanges} disabled={!hasServiceContext || hasInvalidLookupState || hasAntiphonLanguageMismatch}>
                      Save completed changes
                    </button>
                    <button type="button" onClick={deleteCompletedRecord}>Delete completed record</button>
                  </>
                )}
              </>
          </div>
        </form>
        )}


        {workspace === "catalog" && (
          <CatalogWorkspace
            runtime={runtimeMode}
            actor={activeActor}
            organists={organistResults}
            queryCandidates={(input) => interactionClient.queryCatalogCandidates(input)}
            getOwnPreference={(referenceSongId) => interactionClient.getReferenceOwnPreference({ actor: activeActor, referenceSongId })}
            saveOwnPreference={(referenceSongId, score) => interactionClient.saveReferenceOwnPreference({ actor: activeActor, referenceSongId, score })}
            getPreferenceAggregate={(referenceSongId) => interactionClient.getReferencePreferenceAggregate({ actor: activeActor, referenceSongId })}
            setRepertoireMembership={(referenceSongId, organistPersonId, active) => interactionClient.setReferenceRepertoireMembership({ actor: activeActor, referenceSongId, ...(organistPersonId ? { organistPersonId } : {}), active })}
            getMelodyClass={(referenceSongId) => interactionClient.getReferenceMelodyClass({ actor: activeActor, referenceSongId })}
            getMelodyEdge={(referenceSongId, otherReferenceSongId) => interactionClient.getReferenceMelodyEdge({ actor: activeActor, referenceSongId, otherReferenceSongId })}
            addMelodyEdge={(referenceSongId, otherReferenceSongId) => interactionClient.addReferenceMelodyEdge({ actor: activeActor, referenceSongId, otherReferenceSongId })}
            removeMelodyEdge={(referenceSongId, otherReferenceSongId) => interactionClient.removeReferenceMelodyEdge({ actor: activeActor, referenceSongId, otherReferenceSongId })}
            onAntiphonRecommendationChanged={() => {
              setAntiphonRecommendationGeneration((generation) => generation + 1);
              lookupTracker.invalidatePrefix("song:");
              setCandidateResults({});
              setCandidateLoading({});
              setCandidateErrors({});
              setCandidateRefreshGeneration((generation) => generation + 1);
            }}
            onMelodyStructureChanged={() => {
              lookupTracker.invalidatePrefix("song:");
              setCandidateResults({});
              setCandidateLoading({});
              setCandidateErrors({});
              setSelectedCandidateAvailability({ key: "", byRow: {} });
              resetDetailEligibility();
              setPlanningExpansion(null);
              setCandidateRefreshGeneration((generation) => generation + 1);
            }}
          />
        )}
        {workspace === "development" && (
          <section className="release-guidance" aria-label="Development workspace">
            <div><span className="guidance-label">Runtime mode</span><strong>{runtimeMode === "db" ? "Local DB opt-in" : "Local in-memory only"}</strong><p>{runtimeMode === "db" ? "Planning Lifecycle actions use the local database service selected by ORGANY_RUNTIME=db." : "Data is kept only in the current browser runtime and is not durable across refreshes or restarts."}</p></div>
            {runtimeMode === "memory" ? <div><span className="guidance-label">Deterministic test user</span><strong>{activeUser.label} ({activeUser.id})</strong><label>Change user<select value={selectedUserId} onChange={(event) => { const user = demoUsers.find((candidate) => candidate.id === event.target.value); if (user) { setSelectedUserId(user.id); setSelectedAssignedRole(user.roles[0]); } }}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}</select></label><label>Assigned role<select value={effectiveRole} onChange={(event) => selectAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><p>Memory development switches deterministic seeded users and roles.</p></div> : <div><span className="guidance-label">Authenticated user</span><strong>{activeUser.label} ({activeUser.id})</strong>{storedUser.roles.length > 1 && <label>Assigned role<select value={effectiveRole} onChange={(event) => selectAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>}<p>DB runtime identity comes from the protected server session. No user switch is available.</p></div>}
            <div><span className="guidance-label">Local checks</span><strong>Smoke guidance</strong><p>Use npm run db:start, db:migrate, db:seed:catalog, db:lifecycle-smoke, db:catalog-lifecycle-smoke, and db:catalog-seed-smoke for DB runtime verification.</p></div>
          </section>
        )}

        {serviceError && (
          <p className="error-summary" role="alert">
            {serviceError.message}
            {serviceError.issues?.length ? ` ${serviceError.issues.map((issue) => issue.message).join(" ")}` : ""}
          </p>
        )}

        {workspace !== "planning" && persistedSet && (
          <p className="saved-summary">
            Opened {formatPlanningSetSummary(persistedSet)}.
          </p>
        )}

        {workspace !== "planning" && completedRecord && (
          <p className="saved-summary">
            Opened {formatCompletedRecordSummary(completedRecord)}.
          </p>
        )}

        {workspace !== "planning" && savedWorkingSet && saveState === "saved" && (
          <p className="saved-summary">
            Saved {savedWorkingSet.rows.length} row{savedWorkingSet.rows.length === 1 ? "" : "s"} for{" "}
            {savedWorkingSet.serviceDate || "an unscheduled service"}.
          </p>
        )}
      </section>
    </main>
  );
}
