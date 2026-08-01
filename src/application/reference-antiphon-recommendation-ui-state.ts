import type { ReferenceAntiphonRecord } from "./reference-antiphon-contract";
import type { ReferenceAntiphonRecommendation } from "./reference-antiphon-recommendation";
import type { ReferenceCatalogRecord } from "./reference-catalog-contract";

export type RecommendationUiScope = "antiphonSearch" | "recommendationRead" | "songSearch" | "mutation";
export type RecommendationUiToken = Readonly<{ scope: RecommendationUiScope; generation: number }>;
export type RecommendationUiSnapshot = Readonly<{
  antiphons: readonly ReferenceAntiphonRecord[];
  selectedAntiphon: ReferenceAntiphonRecord | null;
  recommendation: ReferenceAntiphonRecommendation | null;
  songs: readonly ReferenceCatalogRecord[];
  selectedSong: ReferenceCatalogRecord | null;
}>;

/** Pure request coordinator. Each of the four asynchronous UI scopes has an independent clock. */
export class ReferenceAntiphonRecommendationUiState {
  private generations: Record<RecommendationUiScope, number> = { antiphonSearch: 0, recommendationRead: 0, songSearch: 0, mutation: 0 };
  private value: RecommendationUiSnapshot = { antiphons: [], selectedAntiphon: null, recommendation: null, songs: [], selectedSong: null };

  begin(scope: RecommendationUiScope): RecommendationUiToken {
    return { scope, generation: ++this.generations[scope] };
  }
  isCurrent(token: RecommendationUiToken): boolean { return this.generations[token.scope] === token.generation; }
  complete(token: RecommendationUiToken, change: Partial<RecommendationUiSnapshot>): boolean {
    if (!this.isCurrent(token)) return false;
    this.value = { ...this.value, ...change };
    return true;
  }
  contextChanged(): void {
    this.invalidate("antiphonSearch", "recommendationRead", "songSearch", "mutation");
    this.value = { antiphons: [], selectedAntiphon: null, recommendation: null, songs: [], selectedSong: null };
  }
  selectAntiphon(record: ReferenceAntiphonRecord | null): void {
    this.invalidate("recommendationRead", "songSearch", "mutation");
    this.value = { ...this.value, selectedAntiphon: record, recommendation: null, songs: [], selectedSong: null };
  }
  selectSong(record: ReferenceCatalogRecord | null): void {
    this.invalidate("mutation");
    this.value = { ...this.value, selectedSong: record };
  }
  snapshot(): RecommendationUiSnapshot { return this.value; }
  private invalidate(...scopes: RecommendationUiScope[]): void { for (const scope of scopes) ++this.generations[scope]; }
}
