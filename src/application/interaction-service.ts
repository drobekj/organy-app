import type { ActorIdentity, AppUser, CandidateQueryInput, CandidateQueryResult, KnowledgeMapping, MelodyClass, MelodyNonRepetitionConfig, PreferenceProfile, SongPreference } from "./interaction-contracts";
import { canManageKnowledge, canManageRepertoire, getCandidateSignal, getPreferenceShade, languagesForServiceShim, preferenceScoreLimit, validateOwnPreferenceScore } from "./interaction-service-utils";
import type { CatalogSong, CatalogRepository } from "./catalog";

export interface InteractionRepository {
  listUsers(): Promise<AppUser[]>;
  listProfiles(): Promise<PreferenceProfile[]>;
  listPreferences(): Promise<SongPreference[]>;
  upsertPreference(preference: SongPreference): Promise<SongPreference>;
  listRepertoire(organistPersonId: string): Promise<string[]>;
  setRepertoire(organistPersonId: string, songId: string, active: boolean): Promise<void>;
  listMelodyClasses(): Promise<MelodyClass[]>;
  listKnowledge(): Promise<{ antiphons: KnowledgeMapping[]; seasons: KnowledgeMapping[]; melodyWindow: MelodyNonRepetitionConfig; melodyClasses: MelodyClass[] }>;
  setMelodyWindow(config: MelodyNonRepetitionConfig): Promise<MelodyNonRepetitionConfig>;
}

export type InteractionResult<T> = { success: true; value: T } | { success: false; error: { code: "permissionDenied" | "notFound" | "invalidInput"; message: string } };

export class InteractionService {
  constructor(private readonly repo: InteractionRepository, private readonly catalog: Pick<CatalogRepository, "listSongs">) {}
  async resolveActor(userId: string, requestedRole?: ActorIdentity["role"]): Promise<InteractionResult<ActorIdentity>> { const users = await this.repo.listUsers(); const user = users.find((u) => u.id === userId && u.active); if (!user) return fail("notFound", "Actor was not found."); const role = requestedRole && user.roles.includes(requestedRole) ? requestedRole : user.roles[0]; if (!role) return fail("permissionDenied", "Actor has no active role."); return ok({ userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) }); }
  async saveOwnPreference(actor: ActorIdentity, songId: string, score: number): Promise<InteractionResult<SongPreference>> { const verified = await this.verifyActor(actor); if (!verified.success) return verified; actor = verified.value; const profile = (await this.repo.listProfiles()).find((p) => p.userId === actor.userId); if (!profile) return fail("notFound", "Preference profile was not found."); if (!validateOwnPreferenceScore(profile.category, score)) return fail("invalidInput", `Preference score must be between 0 and ${preferenceScoreLimit(profile.category)}.`); return ok(await this.repo.upsertPreference({ profileId: profile.id, songId, score })); }
  async setRepertoire(actor: ActorIdentity, organistPersonId: string, songId: string, active: boolean): Promise<InteractionResult<{ organistPersonId: string; songId: string; active: boolean }>> { const verified = await this.verifyActor(actor); if (!verified.success) return verified; actor = verified.value; if (!canManageRepertoire(actor, organistPersonId)) return fail("permissionDenied", "Actor cannot manage this repertoire."); await this.repo.setRepertoire(organistPersonId, songId, active); return ok({ organistPersonId, songId, active }); }
  async setMelodyWindow(actor: ActorIdentity, config: MelodyNonRepetitionConfig): Promise<InteractionResult<MelodyNonRepetitionConfig>> { const verified = await this.verifyActor(actor); if (!verified.success) return verified; actor = verified.value; if (!canManageKnowledge(actor.role)) return fail("permissionDenied", "Only admin can manage Knowledge."); if (config.daysBefore < 0 || config.daysAfter < 0) return fail("invalidInput", "Melody non-repetition window must be non-negative."); return ok(await this.repo.setMelodyWindow({ daysBefore: Math.floor(config.daysBefore), daysAfter: Math.floor(config.daysAfter) })); }
  async listKnowledge() { return ok(await this.repo.listKnowledge()); }
  private async verifyActor(actor: ActorIdentity): Promise<InteractionResult<ActorIdentity>> {
    const resolved = await this.resolveActor(actor.userId, actor.role);
    if (!resolved.success) return resolved;
    if (resolved.value.role !== actor.role) return fail("permissionDenied", "Actor role is not assigned to the stored user.");
    if ((actor.personId ?? undefined) !== (resolved.value.personId ?? undefined)) return fail("permissionDenied", "Actor person link does not match the stored user.");
    return resolved;
  }

  async queryCandidates(input: CandidateQueryInput): Promise<InteractionResult<CandidateQueryResult[]>> { const [songs, preferences, repertoire, knowledge] = await Promise.all([this.catalog.listSongs(), this.repo.listPreferences(), input.organistPersonId ? this.repo.listRepertoire(input.organistPersonId) : Promise.resolve([]), this.repo.listKnowledge()]); return ok(queryCandidatesFromData(songs, preferences, new Set(repertoire), knowledge, input)); }
}

export function queryCandidatesFromData(songs: CatalogSong[], preferences: SongPreference[], repertoire: Set<string>, knowledge: { antiphons: KnowledgeMapping[]; seasons: KnowledgeMapping[]; melodyClasses: MelodyClass[]; melodyWindow?: MelodyNonRepetitionConfig }, input: CandidateQueryInput): CandidateQueryResult[] { const languageSet = new Set(languagesForServiceShim(input.serviceLanguage)); const recentClassIds = getRecentMelodyClassIds(knowledge.melodyClasses, input, knowledge.melodyWindow ?? { daysBefore: 60, daysAfter: 0 }); return songs.filter((song) => song.active && languageSet.has(song.language)).map((song) => { const melody = knowledge.melodyClasses.find((m) => m.songIds.includes(song.songId)); const equivalentNumbers = melody ? melody.songIds.filter((id) => id !== song.songId).map((songId) => ({ songId, number: songs.find((s) => s.songId === songId)?.number ?? songId, repertoire: repertoire.has(songId) })) : []; const aggregatePreferenceScore = preferences.filter((p) => p.songId === song.songId).reduce((sum, p) => sum + p.score, 0); const antiphonMatch = Boolean(input.antiphonKey && knowledge.antiphons.some((m) => m.key === input.antiphonKey && m.songId === song.songId)); const seasonMatch = Boolean(input.liturgicalSeasonKey && knowledge.seasons.some((m) => m.key === input.liturgicalSeasonKey && m.songId === song.songId)); const suppressedByMelodyWindow = Boolean(melody && recentClassIds.has(melody.id)); const signal = getCandidateSignal({ antiphonMatch, seasonMatch }); return { songId: song.songId, language: song.language, number: song.number, title: song.title, equivalentNumbers, aggregatePreferenceScore, antiphonMatch, seasonMatch, signal, preferenceShade: getPreferenceShade(aggregatePreferenceScore), repertoire: repertoire.has(song.songId), suppressedByMelodyWindow, ...(song.sheetMusicUrl ? { sheetMusicUrl: song.sheetMusicUrl } : {}), orderKey: `${suppressedByMelodyWindow ? 1 : 0}:${signal === "antiphon" ? 0 : signal === "season" ? 1 : 2}:${repertoire.has(song.songId) ? 0 : 1}:${999 - aggregatePreferenceScore}:${song.language}:${song.number}` }; }).sort((a, b) => a.orderKey.localeCompare(b.orderKey)); }
function ok<T>(value: T): InteractionResult<T> { return { success: true, value }; }
function fail<T>(code: "permissionDenied" | "notFound" | "invalidInput", message: string): InteractionResult<T> { return { success: false, error: { code, message } }; }

function getRecentMelodyClassIds(classes: MelodyClass[], input: CandidateQueryInput, window: MelodyNonRepetitionConfig): Set<string> { const ids = new Set<string>(); for (const songId of input.recentSongIds ?? []) for (const melody of classes) if (melody.songIds.includes(songId)) ids.add(melody.id); const target = Date.parse(`${input.serviceDate}T00:00:00Z`); for (const recent of input.recentSongs ?? []) { const days = Math.floor((target - Date.parse(`${recent.serviceDate}T00:00:00Z`)) / 86_400_000); if (days < -window.daysAfter || days > window.daysBefore) continue; for (const melody of classes) if (melody.songIds.includes(recent.songId)) ids.add(melody.id); } return ids; }
