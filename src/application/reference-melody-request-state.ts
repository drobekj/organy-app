import type { ReferenceCatalogRecord } from "./reference-catalog-contract";
import type { ReferenceMelodyClass } from "./reference-melody";

export type ReferenceMelodyRequestState = { melody: ReferenceMelodyClass | null; searchResults: ReferenceCatalogRecord[]; selectedTarget: string; mergeResult: ReferenceMelodyClass | null };
export type ReferenceMelodyRequestScope = "read" | "search" | "merge";
export type ReferenceMelodyRequestToken = { scope: ReferenceMelodyRequestScope; context: number; generation: number };

/** Component coordinator: independent scopes share one context identity without cancelling unrelated work. */
export class ReferenceMelodyRequestStateController {
  private context = 0;
  private generations: Record<ReferenceMelodyRequestScope, number> = { read: 0, search: 0, merge: 0 };
  private value: ReferenceMelodyRequestState = { melody: null, searchResults: [], selectedTarget: "", mergeResult: null };

  contextChanged(): void { this.context++; this.generations.read++; this.generations.search++; this.generations.merge++; this.value = { melody: null, searchResults: [], selectedTarget: "", mergeResult: null }; }
  beginRead(): ReferenceMelodyRequestToken { return this.begin("read"); }
  beginSearch(): ReferenceMelodyRequestToken { this.generations.merge++; this.value = { ...this.value, searchResults: [], selectedTarget: "", mergeResult: null }; return this.begin("search"); }
  selectTarget(selectedTarget: string): void { this.generations.merge++; this.value = { ...this.value, selectedTarget, mergeResult: null }; }
  beginMerge(): ReferenceMelodyRequestToken { return this.begin("merge"); }
  invalidateRead(): void { this.generations.read++; }
  invalidateSearch(): void { this.generations.search++; }
  invalidateMerge(): void { this.generations.merge++; }
  complete(token: ReferenceMelodyRequestToken, patch: Partial<ReferenceMelodyRequestState>): boolean { if (!this.isCurrent(token)) return false; this.value = { ...this.value, ...patch }; return true; }
  isCurrent(token: ReferenceMelodyRequestToken): boolean { return token.context === this.context && token.generation === this.generations[token.scope]; }
  snapshot(): ReferenceMelodyRequestState { return { ...this.value, searchResults: [...this.value.searchResults] }; }
  private begin(scope: ReferenceMelodyRequestScope): ReferenceMelodyRequestToken { return { scope, context: this.context, generation: ++this.generations[scope] }; }
}
