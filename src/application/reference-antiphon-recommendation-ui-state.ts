import type { ReferenceAntiphonRecord } from "./reference-antiphon-contract";
import type { ReferenceAntiphonRecommendation } from "./reference-antiphon-recommendation";
import type { ReferenceCatalogRecord } from "./reference-catalog-contract";

export type RecommendationUiScope = "antiphonSearch" | "recommendationRead" | "songSearch" | "mutation";
export type RecommendationUiRole = "priest" | "organist" | "admin" | "congregationMember";
export type RecommendationUiIdentity = Readonly<{ runtimeMode: "memory" | "db"; userId: string; role: RecommendationUiRole; selectedAntiphonId: string | null }>;
export type RecommendationUiToken = Readonly<{ context: number; scope: RecommendationUiScope; generation: number }>;
export type RecommendationUiRequest = Readonly<{ loading: boolean; error: string | null }>;
export type RecommendationUiSnapshot = Readonly<{
  context: number; identity: RecommendationUiIdentity;
  antiphons: readonly ReferenceAntiphonRecord[]; selectedAntiphon: ReferenceAntiphonRecord | null;
  recommendation: ReferenceAntiphonRecommendation | null;
  songs: readonly ReferenceCatalogRecord[]; selectedSong: ReferenceCatalogRecord | null;
  saved: boolean; requests: Readonly<Record<RecommendationUiScope, RecommendationUiRequest>>;
}>;

const scopes: RecommendationUiScope[] = ["antiphonSearch", "recommendationRead", "songSearch", "mutation"];
const idle = (): RecommendationUiRequest => ({ loading: false, error: null });
const idleRequests = (): Record<RecommendationUiScope, RecommendationUiRequest> => ({ antiphonSearch: idle(), recommendationRead: idle(), songSearch: idle(), mutation: idle() });
const same = (a: RecommendationUiIdentity, b: RecommendationUiIdentity) => a.runtimeMode === b.runtimeMode && a.userId === b.userId && a.role === b.role && a.selectedAntiphonId === b.selectedAntiphonId;

export class ReferenceAntiphonRecommendationUiState {
  private context = 0;
  private generations: Record<RecommendationUiScope, number> = { antiphonSearch: 0, recommendationRead: 0, songSearch: 0, mutation: 0 };
  private value: RecommendationUiSnapshot;

  constructor(identity: RecommendationUiIdentity) {
    this.value = { context: 0, identity, antiphons: [], selectedAntiphon: null, recommendation: null, songs: [], selectedSong: null, saved: false, requests: idleRequests() };
  }
  snapshot(): RecommendationUiSnapshot { return this.value; }
  begin(scope: RecommendationUiScope): RecommendationUiToken {
    const token = { context: this.context, scope, generation: ++this.generations[scope] };
    this.value = { ...this.value, saved: scope === "mutation" ? false : this.value.saved, requests: { ...this.value.requests, [scope]: { loading: true, error: null } } };
    return token;
  }
  isCurrent(token: RecommendationUiToken): boolean { return token.context === this.context && token.generation === this.generations[token.scope]; }
  complete(token: RecommendationUiToken, change: Partial<RecommendationUiSnapshot>): boolean {
    if (!this.isCurrent(token)) return false;
    this.value = { ...this.value, ...change, context: this.context, identity: this.value.identity, requests: { ...this.value.requests, [token.scope]: idle() } };
    return true;
  }
  fail(token: RecommendationUiToken, error: string): boolean {
    if (!this.isCurrent(token)) return false;
    this.value = { ...this.value, saved: token.scope === "mutation" ? false : this.value.saved, requests: { ...this.value.requests, [token.scope]: { loading: false, error } } };
    return true;
  }
  cancel(scope: RecommendationUiScope, change: Partial<RecommendationUiSnapshot> = {}): void {
    ++this.generations[scope];
    this.value = { ...this.value, ...change, context: this.context, identity: this.value.identity, requests: { ...this.value.requests, [scope]: idle() } };
  }
  changeContext(identity: RecommendationUiIdentity, selectedAntiphon: ReferenceAntiphonRecord | null): boolean {
    if (same(this.value.identity, identity)) return false;
    ++this.context; for (const scope of scopes) ++this.generations[scope];
    this.value = { context: this.context, identity, antiphons: identity.runtimeMode === "db" ? this.value.antiphons : [], selectedAntiphon: identity.runtimeMode === "db" ? selectedAntiphon : null, recommendation: null, songs: [], selectedSong: null, saved: false, requests: idleRequests() };
    return true;
  }
  changeRuntimeActor(runtimeMode: "memory" | "db", userId: string, role: RecommendationUiRole): boolean {
    const selected = runtimeMode === "db" ? this.value.selectedAntiphon : null;
    return this.changeContext({ runtimeMode, userId, role, selectedAntiphonId: selected?.id ?? null }, selected);
  }
  selectAntiphon(record: ReferenceAntiphonRecord | null): boolean { return this.changeContext({ ...this.value.identity, selectedAntiphonId: record?.id ?? null }, record); }
  selectSong(record: ReferenceCatalogRecord | null): void {
    ++this.generations.mutation;
    this.value = { ...this.value, selectedSong: record, saved: false, requests: { ...this.value.requests, mutation: idle() } };
  }
  mutationSucceeded(token: RecommendationUiToken, recommendation: ReferenceAntiphonRecommendation): boolean {
    if (!this.isCurrent(token)) return false;
    ++this.generations.songSearch;
    this.value = { ...this.value, recommendation, songs: [], selectedSong: null, saved: true, requests: { ...this.value.requests, mutation: idle(), songSearch: idle() } };
    return true;
  }
}
