import type { CatalogSong } from "./catalog";
import type { ConcreteSongLanguage, PlanningRole, ServiceLanguage } from "../planning-lifecycle";
import { languagesForService } from "./catalog";

export type PreferenceProfileCategory = "priest" | "organist" | "congregationMember";
export type AppUser = { id: string; displayName: string; personId?: string; roles: PlanningRole[]; active: boolean };
export type ActorIdentity = { userId: string; displayName: string; role: PlanningRole; personId?: string };
export type PreferenceProfile = { id: string; userId: string; category: PreferenceProfileCategory };
export type SongPreference = { profileId: string; songId: string; score: number };
export type MelodyClass = { id: string; label: string; songIds: string[]; synthetic: boolean };
export type KnowledgeMapping = { id: string; key: string; songId: string; synthetic: boolean };
export type MelodyNonRepetitionConfig = { months: number };
export type CandidateUsageSource = "completed" | "working" | "final" | "current";
export type CandidateUsage = { songId: string; serviceDate: string; source: CandidateUsageSource; planId?: string; rowId?: number };
export type CandidateQueryInput = { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages?: CandidateUsage[] };
export type CandidateQueryResult = { songId: string; language: ConcreteSongLanguage; number: string; title: string; equivalentNumbers: { songId: string; number: string; repertoire: boolean }[]; aggregatePreferenceScore: number; antiphonMatch: boolean; seasonMatch: boolean; signal: "antiphon" | "season" | "none"; preferenceShade: "none" | "low" | "medium" | "high"; repertoire: boolean; suppressedByMelodyWindow: boolean; sheetMusicUrl?: string; orderKey: string };

export function preferenceScoreLimit(category: PreferenceProfileCategory): number { return category === "priest" ? 3 : category === "organist" ? 2 : 1; }
export function validateOwnPreferenceScore(category: PreferenceProfileCategory, score: number): boolean { return Number.isInteger(score) && score >= 0 && score <= preferenceScoreLimit(category); }
export function canManageKnowledge(role: PlanningRole): boolean { return role === "admin"; }
export function canManageRepertoire(actor: { role: PlanningRole; personId?: string }, organistPersonId: string): boolean { return actor.role === "admin" || (actor.role === "organist" && actor.personId === organistPersonId); }
export function getPreferenceShade(score: number): CandidateQueryResult["preferenceShade"] { return score >= 6 ? "high" : score >= 3 ? "medium" : score > 0 ? "low" : "none"; }
export function getCandidateSignal(input: { antiphonMatch: boolean; seasonMatch: boolean }): CandidateQueryResult["signal"] { return input.antiphonMatch ? "antiphon" : input.seasonMatch ? "season" : "none"; }

export type RowLookupState = { kind: "empty" } | { kind: "selected"; songId: string } | { kind: "noteOnly"; note: string } | { kind: "lookup"; text: string; previous?: Exclude<RowLookupState, { kind: "lookup" }> };
export function isValidRowState(row: RowLookupState): boolean { return row.kind !== "lookup" && (row.kind !== "noteOnly" || row.note.trim().length > 0); }
export function cancelLookup(row: RowLookupState): RowLookupState { return row.kind === "lookup" ? row.previous ?? { kind: "empty" } : row; }
export function canLeaveWorkspace(rows: RowLookupState[]): { allowed: boolean; reason?: string } { return rows.some((r) => r.kind === "lookup" && r.text.trim()) ? { allowed: false, reason: "Select a candidate or cancel the active lookup before leaving Planning." } : { allowed: true }; }
export function canAddOrPersistRows(rows: RowLookupState[]): boolean { return rows.every(isValidRowState); }
export function restoreLookupOnCancel<T extends { lookupOpen?: boolean; songSearch: string; selectedSong?: { language: ConcreteSongLanguage; number: string; title?: string }; note: string }>(row: T): T { return { ...row, lookupOpen: false, songSearch: row.selectedSong ? `${row.selectedSong.language} ${row.selectedSong.number}${row.selectedSong.title ? ` — ${row.selectedSong.title}` : ""}` : "" }; }
export function restoreRowsForRowSwitch<T extends { id: number; lookupOpen?: boolean; songSearch: string; selectedSong?: { language: ConcreteSongLanguage; number: string; title?: string }; note: string }>(rows: T[], targetRowId: number): T[] { return rows.map((row) => row.id === targetRowId ? row : row.lookupOpen ? restoreLookupOnCancel(row) : row); }

export class InMemoryInteractionRepository {
  readonly users: AppUser[] = [
    { id: "demo-priest-user", displayName: "Demo Priest User", personId: "demo-priest", roles: ["priest"], active: true },
    { id: "demo-organist-user", displayName: "Demo Organist User", personId: "demo-organist", roles: ["organist"], active: true },
    { id: "demo-admin-user", displayName: "Demo Admin User", roles: ["admin"], active: true },
    { id: "demo-member-user", displayName: "Demo Congregation User", roles: ["congregationMember"], active: true },
  ];
  readonly profiles: PreferenceProfile[] = [
    { id: "pref-priest", userId: "demo-priest-user", category: "priest" },
    { id: "pref-organist", userId: "demo-organist-user", category: "organist" },
    { id: "pref-member", userId: "demo-member-user", category: "congregationMember" },
  ];
  private preferences = new Map<string, SongPreference>();
  private repertoire = new Set<string>();
  private melodyClasses: MelodyClass[] = [];
  private antiphons: KnowledgeMapping[] = [];
  private seasons: KnowledgeMapping[] = [];
  private melodyWindow: MelodyNonRepetitionConfig = { months: 2 };

  constructor() {
    this.preferences.set(this.preferenceKey("pref-priest", "demo-cz-101"), { profileId: "pref-priest", songId: "demo-cz-101", score: 3 });
    this.preferences.set(this.preferenceKey("pref-organist", "demo-cz-101"), { profileId: "pref-organist", songId: "demo-cz-101", score: 2 });
    this.preferences.set(this.preferenceKey("pref-member", "demo-cz-101"), { profileId: "pref-member", songId: "demo-cz-101", score: 1 });
    this.repertoire.add(this.repertoireKey("demo-organist", "demo-cz-101"));
    this.melodyClasses = [{ id: "synthetic-melody-a", label: "Synthetic melody A", songIds: ["demo-cz-101", "demo-pl-101"], synthetic: true }];
    this.antiphons = [{ id: "synthetic-antiphon-entry", key: "synthetic-entry", songId: "demo-cz-101", synthetic: true }];
    this.seasons = [{ id: "synthetic-season-advent", key: "synthetic-advent", songId: "demo-pl-101", synthetic: true }];
  }

  listUsers(): AppUser[] { return this.users.map((u) => ({ ...u, roles: [...u.roles] })); }
  resolveActor(userId: string, requestedRole?: PlanningRole): ActorIdentity | undefined { const user = this.users.find((u) => u.id === userId && u.active); if (!user) return undefined; const role = requestedRole && user.roles.includes(requestedRole) ? requestedRole : user.roles[0]; return role ? { userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) } : undefined; }
  listPreferences(): SongPreference[] { return [...this.preferences.values()].map((p) => ({ ...p })); }
  saveOwnPreference(actor: ActorIdentity, songId: string, score: number): SongPreference | undefined { const profile = this.profiles.find((p) => p.userId === actor.userId); if (!profile || !validateOwnPreferenceScore(profile.category, score)) return undefined; const pref = { profileId: profile.id, songId, score }; this.preferences.set(this.preferenceKey(profile.id, songId), pref); return { ...pref }; }
  setRepertoire(actor: ActorIdentity, organistPersonId: string, songId: string, active: boolean): boolean { if (!canManageRepertoire(actor, organistPersonId)) return false; const key = this.repertoireKey(organistPersonId, songId); if (active) this.repertoire.add(key); else this.repertoire.delete(key); return true; }
  listRepertoire(organistPersonId: string): string[] { return [...this.repertoire].filter((key) => key.startsWith(`${organistPersonId}:`)).map((key) => key.split(":")[1]); }
  listMelodyClasses(): MelodyClass[] { return this.melodyClasses.map((m) => ({ ...m, songIds: [...m.songIds] })); }
  getMelodyWindow(): MelodyNonRepetitionConfig { return { ...this.melodyWindow }; }
  setMelodyWindow(actor: ActorIdentity, config: MelodyNonRepetitionConfig): boolean { if (!canManageKnowledge(actor.role) || config.months < 0) return false; this.melodyWindow = { months: Math.floor(config.months) }; return true; }
  addKnowledgeMapping(actor: ActorIdentity, kind: "antiphon" | "season", mapping: KnowledgeMapping): boolean { if (!canManageKnowledge(actor.role)) return false; if (kind === "antiphon") this.antiphons.push({ ...mapping, synthetic: true }); else this.seasons.push({ ...mapping, synthetic: true }); return true; }
  listKnowledge() { return { antiphons: this.antiphons.map((m) => ({ ...m })), seasons: this.seasons.map((m) => ({ ...m })), melodyWindow: this.getMelodyWindow(), melodyClasses: this.listMelodyClasses() }; }

  queryCandidates(songs: CatalogSong[], input: CandidateQueryInput): CandidateQueryResult[] {
    const languageSet = new Set(languagesForService(input.serviceLanguage));
    const recentClassIds = getRecentMelodyClassIds(this.melodyClasses, input, this.melodyWindow);
    const queryText = input.queryText?.trim().toLowerCase();
    const threshold = input.preferenceThreshold ?? 0;
    const songsById = new Map(songs.map((song) => [song.songId, song]));
    const groups = new Map<string, CatalogSong[]>();
    for (const song of songs) {
      if (!song.active || !languageSet.has(song.language)) continue;
      const melody = this.melodyClasses.find((m) => m.songIds.includes(song.songId));
      const classId = melody?.id ?? `song:${song.songId}`;
      if (melody && recentClassIds.has(melody.id)) continue;
      groups.set(classId, [...(groups.get(classId) ?? []), song]);
    }
    const candidates: CandidateQueryResult[] = [];
    for (const [classId, groupSongs] of groups) {
      const melody = this.melodyClasses.find((m) => m.id === classId);
      const allClassSongIds = melody?.songIds ?? groupSongs.map((song) => song.songId);
      if (input.organistPersonId && !allClassSongIds.some((songId) => this.repertoire.has(this.repertoireKey(input.organistPersonId!, songId)))) continue;
      const scored = groupSongs.map((song) => {
        const aggregatePreferenceScore = [...this.preferences.values()].filter((p) => p.songId === song.songId).reduce((sum, p) => sum + p.score, 0);
        const antiphonMatch = Boolean(input.antiphonKey && this.antiphons.some((m) => m.key === input.antiphonKey && m.songId === song.songId));
        const seasonMatch = Boolean(input.liturgicalSeasonKey && this.seasons.some((m) => m.key === input.liturgicalSeasonKey && m.songId === song.songId));
        return { song, aggregatePreferenceScore, antiphonMatch, seasonMatch, signal: getCandidateSignal({ antiphonMatch, seasonMatch }), repertoire: input.organistPersonId ? this.repertoire.has(this.repertoireKey(input.organistPersonId, song.songId)) : false };
      });
      if (Math.max(...scored.map((item) => item.aggregatePreferenceScore), 0) < threshold) continue;
      if (queryText && !scored.some((item) => item.song.number.toLowerCase().includes(queryText) || item.song.title.toLowerCase().includes(queryText))) continue;
      scored.sort((a, b) => `${a.repertoire ? 0 : 1}:${a.signal === "antiphon" ? 0 : a.signal === "season" ? 1 : 2}:${999 - a.aggregatePreferenceScore}:${a.song.language}:${a.song.number}`.localeCompare(`${b.repertoire ? 0 : 1}:${b.signal === "antiphon" ? 0 : b.signal === "season" ? 1 : 2}:${999 - b.aggregatePreferenceScore}:${b.song.language}:${b.song.number}`));
      const primary = scored[0];
      const equivalentNumbers = allClassSongIds.filter((songId) => songId !== primary.song.songId).map((songId) => ({ songId, number: songsById.get(songId)?.number ?? songId, repertoire: input.organistPersonId ? this.repertoire.has(this.repertoireKey(input.organistPersonId, songId)) : false })).sort((a, b) => `${a.repertoire ? 0 : 1}:${a.number}`.localeCompare(`${b.repertoire ? 0 : 1}:${b.number}`));
      candidates.push({ songId: primary.song.songId, language: primary.song.language, number: primary.song.number, title: primary.song.title, equivalentNumbers, aggregatePreferenceScore: primary.aggregatePreferenceScore, antiphonMatch: primary.antiphonMatch, seasonMatch: primary.seasonMatch, signal: primary.signal, preferenceShade: getPreferenceShade(primary.aggregatePreferenceScore), repertoire: primary.repertoire, suppressedByMelodyWindow: false, ...(primary.song.sheetMusicUrl ? { sheetMusicUrl: primary.song.sheetMusicUrl } : {}), orderKey: `${primary.signal === "antiphon" ? 0 : primary.signal === "season" ? 1 : 2}:${primary.repertoire ? 0 : 1}:${999 - primary.aggregatePreferenceScore}:${primary.song.language}:${primary.song.number}` });
    }
    return candidates.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  }

  createSyntheticScaleSongs(count: number): CatalogSong[] { return Array.from({ length: count }, (_, index) => ({ songId: `synthetic-scale-${index + 1}`, language: index % 2 === 0 ? "czech" : "polish", number: `SYN-${String(index + 1).padStart(5, "0")}`, title: `Synthetic Scale Song ${index + 1}`, active: true })); }
  private preferenceKey(profileId: string, songId: string) { return `${profileId}:${songId}`; }
  private repertoireKey(personId: string, songId: string) { return `${personId}:${songId}`; }
}

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
