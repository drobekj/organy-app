import type { ReferenceCatalogRecord } from "./reference-catalog-contract";
import type { ReferenceMelodyClass } from "./reference-melody";

export type ReferenceMelodyRequestState = {
  melody: ReferenceMelodyClass | null;
  searchResults: ReferenceCatalogRecord[];
  selectedTarget: string;
  mergeResult: ReferenceMelodyClass | null;
};

/** Owns the browser-visible state and makes every async completion generation-safe. */
export class ReferenceMelodyRequestStateController {
  private generation = 0;
  private value: ReferenceMelodyRequestState = { melody: null, searchResults: [], selectedTarget: "", mergeResult: null };
  begin(): number { return ++this.generation; }
  invalidate(): void { ++this.generation; }
  isCurrent(token: number): boolean { return token === this.generation; }
  apply(token: number, patch: Partial<ReferenceMelodyRequestState>): boolean {
    if (!this.isCurrent(token)) return false;
    this.value = { ...this.value, ...patch };
    return true;
  }
  reset(patch: Partial<ReferenceMelodyRequestState> = {}): void {
    this.invalidate();
    this.value = { melody: null, searchResults: [], selectedTarget: "", mergeResult: null, ...patch };
  }
  snapshot(): ReferenceMelodyRequestState { return { ...this.value, searchResults: [...this.value.searchResults] }; }
}
