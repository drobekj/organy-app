/** Prevents an older preference request from overwriting state for a newer record or actor. */
export class ReferencePreferenceRequestTracker {
  private generation = 0;
  begin(): number { return ++this.generation; }
  invalidate(): void { this.generation += 1; }
  isCurrent(request: number): boolean { return request === this.generation; }
}
