import type { CatalogPerson, CatalogService, PersonRole } from "../src/application/catalog";
import type {
  ActorIdentity,
  CatalogCandidateQueryInput,
  CandidateQueryResult,
  InMemoryInteractionRepository,
  ReferenceOwnPreference,
  ReferencePreferenceAggregate,
} from "../src/application/interaction-contracts";
import { apiFailure } from "../src/application/api-error";
import { InteractionService, InMemoryInteractionServiceRepository } from "../src/application/interaction-service";
import type { PlanningLifecycleService, PlanningServiceError, PlanningPlanId } from "../src/application/planning-lifecycle";
import type { ReferenceMelodyClass } from "../src/application/reference-melody";
import type { ReferenceRepertoireMembership } from "../src/application/reference-repertoire";
import { MemoryReferenceThematicSectionProvider } from "../src/application/reference-thematic-section";
import type { PlanningRole, PlanningRow, PlanningPlan, ServiceContext, ServiceLanguage } from "../src/planning-lifecycle";
import { buildCandidateQueryInput, buildCanonicalCandidateUsages } from "../src/planning-lifecycle/candidate-flow";

export type CatalogClient = CatalogService | DbCatalogClient;
type CandidateHydrationClientInput = { songs: NonNullable<PlanningRow["song"]>[]; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string };
type MelodyResult = { success: true; value: ReferenceMelodyClass } | { success: false; error: PlanningServiceError };
type RepertoireResult = { success: true; value: ReferenceRepertoireMembership } | { success: false; error: PlanningServiceError };
export type InteractionClient = { saveOwnPreference(input: { actor: ActorIdentity; songId: string; score: number }): Promise<unknown>; getReferenceOwnPreference(input: { actor: ActorIdentity; referenceSongId: string }): Promise<{ success: true; value: ReferenceOwnPreference } | { success: false; error: PlanningServiceError }>; saveReferenceOwnPreference(input: { actor: ActorIdentity; referenceSongId: string; score: number }): Promise<{ success: true; value: ReferenceOwnPreference } | { success: false; error: PlanningServiceError }>; getReferencePreferenceAggregate(input: { actor: ActorIdentity; referenceSongId: string }): Promise<{ success: true; value: ReferencePreferenceAggregate } | { success: false; error: PlanningServiceError }>; getReferenceRepertoireMembership(input: { actor: ActorIdentity; referenceSongId: string; organistPersonId?: string }): Promise<RepertoireResult>; setReferenceRepertoireMembership(input: { actor: ActorIdentity; referenceSongId: string; organistPersonId?: string; active: boolean }): Promise<RepertoireResult>; getReferenceMelodyClass(input: { actor: ActorIdentity; referenceSongId: string }): Promise<MelodyResult>; mergeReferenceMelodyClasses(input: { actor: ActorIdentity; referenceSongId: string; mergeWithReferenceSongId: string }): Promise<MelodyResult>; getReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }): Promise<{ success: true; value: { exists: boolean } } | { success: false; error: PlanningServiceError }>; addReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }): Promise<MelodyResult>; removeReferenceMelodyEdge(input: { actor: ActorIdentity; referenceSongId: string; otherReferenceSongId: string }): Promise<MelodyResult>; setRepertoire(input: { actor: ActorIdentity; organistPersonId: string; songId: string; active: boolean }): Promise<unknown>; setMelodyWindow(input: { actor: ActorIdentity; months: number }): Promise<unknown>; getOrganistMelodyProtection(input: { actor: ActorIdentity; organistPersonId?: string }): Promise<{ success: true; value: { months: number } } | { success: false; error: PlanningServiceError }>; queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; melodyProtectionMonths?: number; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }): Promise<CandidateQueryResult[]>; queryCatalogCandidates(input: CatalogCandidateQueryInput): Promise<CandidateQueryResult[]>; hydrateCandidates(input: CandidateHydrationClientInput): Promise<CandidateQueryResult[]>; };

export class DbPlanningLifecycleClient {
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

  async loadPlanningSet(setId: PlanningPlanId) {
    return callPlanningLifecycleApi("loadPlanningSet", { setId });
  }

  async previewCompletedRecordInvalidation(input: { role: PlanningRole; localActorUserId: string; recordId: string; serviceContext: ServiceContext; set: PlanningPlan & { status: "final" } }) {
    return callPlanningLifecycleApi("previewCompletedRecordInvalidation", input, actorContextFrom(input));
  }

  async previewPlanningSetConflict(input: { setId: PlanningPlanId; serviceDate: string; melodyProtectionMonths: number; rows: PlanningRow[] }) {
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
  async getOrganistMelodyProtection(input: { actor: ActorIdentity; organistPersonId?: string }) { return this.transport("getOrganistMelodyProtection", input.organistPersonId ? { organistPersonId: input.organistPersonId } : {}, input.actor) as Promise<{ success: true; value: { months: number } } | { success: false; error: PlanningServiceError }>; }
  async queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; melodyProtectionMonths?: number; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }) { return unwrapCandidateResponse(await this.transport("queryCandidates", buildCandidateQueryInput(input))); }
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
  async getOrganistMelodyProtection(input: { actor: ActorIdentity; organistPersonId?: string }) { return { success: true as const, value: { months: input.organistPersonId ? 2 : 0 } }; }
  async queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; melodyProtectionMonths?: number; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }) {
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

export class DbCatalogClient {
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
