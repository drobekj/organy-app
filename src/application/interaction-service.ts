import { InMemoryInteractionRepository, type ActorIdentity, type AppUser, type CandidateQueryInput, type CandidateQueryResult, type KnowledgeMapping, type MelodyClass, type MelodyNonRepetitionConfig, type PreferenceProfile, type SongPreference } from "./interaction-contracts";
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
  async setMelodyWindow(actor: ActorIdentity, config: MelodyNonRepetitionConfig): Promise<InteractionResult<MelodyNonRepetitionConfig>> { const verified = await this.verifyActor(actor); if (!verified.success) return verified; actor = verified.value; if (!canManageKnowledge(actor.role)) return fail("permissionDenied", "Only admin can manage Knowledge."); if (config.months < 0) return fail("invalidInput", "Melody non-repetition window must be non-negative."); return ok(await this.repo.setMelodyWindow({ months: Math.floor(config.months) })); }
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

export class InMemoryInteractionServiceRepository implements InteractionRepository {
  constructor(private readonly repo: InMemoryInteractionRepository) {}
  async listUsers() { return this.repo.listUsers(); }
  async listProfiles() { return this.repo.profiles.map((profile) => ({ ...profile })); }
  async listPreferences() { return this.repo.listPreferences(); }
  async upsertPreference(preference: SongPreference) { const actor = this.repo.resolveActor(preference.profileId.includes("organist") ? "demo-organist-user" : preference.profileId.includes("member") ? "demo-member-user" : "demo-priest-user")!; return this.repo.saveOwnPreference(actor, preference.songId, preference.score) ?? preference; }
  async listRepertoire(organistPersonId: string) { return this.repo.listRepertoire(organistPersonId); }
  async setRepertoire(organistPersonId: string, songId: string, active: boolean) { const actor = this.repo.resolveActor("demo-admin-user")!; this.repo.setRepertoire(actor, organistPersonId, songId, active); }
  async listMelodyClasses() { return this.repo.listMelodyClasses(); }
  async listKnowledge() { return this.repo.listKnowledge(); }
  async setMelodyWindow(config: MelodyNonRepetitionConfig) { const actor = this.repo.resolveActor("demo-admin-user")!; this.repo.setMelodyWindow(actor, config); return this.repo.getMelodyWindow(); }
}

export function queryCandidatesFromData(songs: CatalogSong[], preferences: SongPreference[], repertoire: Set<string>, knowledge: { antiphons: KnowledgeMapping[]; seasons: KnowledgeMapping[]; melodyClasses: MelodyClass[]; melodyWindow?: MelodyNonRepetitionConfig }, input: CandidateQueryInput): CandidateQueryResult[] {
  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));
  const window = knowledge.melodyWindow ?? { months: 2 };
  const recentClassIds = getRecentMelodyClassIds(knowledge.melodyClasses, input, window);
  const queryText = input.queryText?.trim().toLowerCase();
  const threshold = input.preferenceThreshold ?? 0;
  const songsById = new Map(songs.map((song) => [song.songId, song]));
  const groups = new Map<string, CatalogSong[]>();

  for (const song of songs) {
    if (!song.active || !languageSet.has(song.language)) continue;
    const melody = knowledge.melodyClasses.find((m) => m.songIds.includes(song.songId));
    const classId = melody?.id ?? `song:${song.songId}`;
    if (melody && recentClassIds.has(melody.id)) continue;
    const groupSongs = groups.get(classId) ?? [];
    groupSongs.push(song);
    groups.set(classId, groupSongs);
  }

  const candidates: CandidateQueryResult[] = [];
  for (const [classId, groupSongs] of groups) {
    const melody = knowledge.melodyClasses.find((m) => m.id === classId);
    const allClassSongIds = melody?.songIds ?? groupSongs.map((song) => song.songId);
    const hasRepertoire = !input.organistPersonId || allClassSongIds.some((songId) => repertoire.has(songId));
    if (!hasRepertoire) continue;

    const scored = groupSongs.map((song) => {
      const aggregatePreferenceScore = preferences.filter((pref) => pref.songId === song.songId).reduce((sum, pref) => sum + pref.score, 0);
      const antiphonMatch = Boolean(input.antiphonKey && knowledge.antiphons.some((m) => m.key === input.antiphonKey && m.songId === song.songId));
      const seasonMatch = Boolean(input.liturgicalSeasonKey && knowledge.seasons.some((m) => m.key === input.liturgicalSeasonKey && m.songId === song.songId));
      const signal = getCandidateSignal({ antiphonMatch, seasonMatch });
      return { song, aggregatePreferenceScore, antiphonMatch, seasonMatch, signal, repertoire: repertoire.has(song.songId) };
    });

    const groupPreference = Math.max(...scored.map((item) => item.aggregatePreferenceScore), 0);
    if (groupPreference < threshold) continue;
    if (queryText && !scored.some((item) => item.song.number.toLowerCase().includes(queryText) || item.song.title.toLowerCase().includes(queryText))) continue;

    scored.sort((a, b) => `${a.repertoire ? 0 : 1}:${b.signal === "antiphon" ? 1 : 0}:${999 - b.aggregatePreferenceScore}:${a.song.language}:${a.song.number}`.localeCompare(`${b.repertoire ? 0 : 1}:${a.signal === "antiphon" ? 1 : 0}:${999 - a.aggregatePreferenceScore}:${b.song.language}:${b.song.number}`));
    const primary = scored[0];
    const equivalentNumbers = allClassSongIds
      .filter((songId) => songId !== primary.song.songId)
      .map((songId) => ({ songId, number: songsById.get(songId)?.number ?? songId, repertoire: repertoire.has(songId) }))
      .sort((a, b) => `${a.repertoire ? 0 : 1}:${a.number}`.localeCompare(`${b.repertoire ? 0 : 1}:${b.number}`));

    candidates.push({
      songId: primary.song.songId,
      language: primary.song.language,
      number: primary.song.number,
      title: primary.song.title,
      equivalentNumbers,
      aggregatePreferenceScore: primary.aggregatePreferenceScore,
      antiphonMatch: primary.antiphonMatch,
      seasonMatch: primary.seasonMatch,
      signal: primary.signal,
      preferenceShade: getPreferenceShade(primary.aggregatePreferenceScore),
      repertoire: primary.repertoire,
      suppressedByMelodyWindow: false,
      ...(primary.song.sheetMusicUrl ? { sheetMusicUrl: primary.song.sheetMusicUrl } : {}),
      orderKey: `${primary.signal === "antiphon" ? 0 : primary.signal === "season" ? 1 : 2}:${primary.repertoire ? 0 : 1}:${999 - primary.aggregatePreferenceScore}:${primary.song.language}:${primary.song.number}`,
    });
  }
  return candidates.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
}
function ok<T>(value: T): InteractionResult<T> { return { success: true, value }; }
function fail<T>(code: "permissionDenied" | "notFound" | "invalidInput", message: string): InteractionResult<T> { return { success: false, error: { code, message } }; }

function getRecentMelodyClassIds(classes: MelodyClass[], input: CandidateQueryInput, window: MelodyNonRepetitionConfig): Set<string> {
  const ids = new Set<string>();
  const target = Date.parse(`${input.serviceDate}T00:00:00Z`);
  const datedUsages = (input.candidateUsages ?? []).filter((usage) => !input.currentPlanId || usage.planId !== input.currentPlanId);
  for (const recent of datedUsages) {
    if (!isWithinSymmetricTwoCalendarMonths(target, Date.parse(`${recent.serviceDate}T00:00:00Z`), window.months)) continue;
    for (const melody of classes) if (melody.songIds.includes(recent.songId)) ids.add(melody.id);
  }
  return ids;
}

function isWithinSymmetricTwoCalendarMonths(target: number, usedAt: number, months = 2): boolean { const earlier = addMonthsUtc(target, -months); const later = addMonthsUtc(target, months); return usedAt >= earlier && usedAt <= later; }
function addMonthsUtc(value: number, months: number): number { const date = new Date(value); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()); }
