import type { ConcreteSongLanguage, PlanningRole, ServiceLanguage } from "../planning-lifecycle";

export type PreferenceProfileCategory = "priest" | "organist" | "congregationMember";
export type AppUser = { id: string; displayName: string; personId?: string; roles: PlanningRole[]; active: boolean };
export type PreferenceProfile = { id: string; userId: string; category: PreferenceProfileCategory };
export type CandidateQueryInput = { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; preferenceThreshold?: number; antiphonKey?: string; liturgicalSeasonKey?: string; currentPlanId?: string };
export type CandidateQueryResult = { songId: string; language: ConcreteSongLanguage; number: string; title: string; equivalentNumbers: { songId: string; number: string; repertoire: boolean }[]; aggregatePreferenceScore: number; antiphonMatch: boolean; seasonMatch: boolean; signal: "antiphon" | "season" | "none"; preferenceShade: "none" | "low" | "medium" | "high"; sheetMusicUrl?: string; orderKey: string };

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
