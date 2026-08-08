import type { ReferenceAntiphonRecord } from "./reference-antiphon-contract";
import type { ServiceLanguage } from "../planning-lifecycle";

export type ServiceContextAntiphonSearchIdentity = {
  runtimeMode: "memory" | "db";
  contextKey: string;
  editable: boolean;
  serviceLanguage: ServiceLanguage;
};

export type ServiceContextAntiphonSearchToken = { context: number; generation: number };
export type ServiceContextAntiphonSearchSnapshot = {
  identity: ServiceContextAntiphonSearchIdentity;
  context: number;
  generation: number;
  loading: boolean;
  error: string | null;
  records: ReferenceAntiphonRecord[];
};

export class ServiceContextReferenceAntiphonUiState {
  private state: ServiceContextAntiphonSearchSnapshot;
  constructor(identity: ServiceContextAntiphonSearchIdentity) {
    this.state = { identity: { ...identity }, context: 0, generation: 0, loading: false, error: null, records: [] };
  }
  snapshot(): ServiceContextAntiphonSearchSnapshot { return { ...this.state, identity: { ...this.state.identity }, records: [...this.state.records] }; }
  changeIdentity(identity: ServiceContextAntiphonSearchIdentity): boolean {
    if (identity.runtimeMode === this.state.identity.runtimeMode && identity.contextKey === this.state.identity.contextKey && identity.editable === this.state.identity.editable && identity.serviceLanguage === this.state.identity.serviceLanguage) return false;
    this.state = { identity: { ...identity }, context: this.state.context + 1, generation: this.state.generation + 1, loading: false, error: null, records: [] };
    return true;
  }
  begin(): ServiceContextAntiphonSearchToken { const generation = this.state.generation + 1; this.state = { ...this.state, generation, loading: true, error: null, records: [] }; return { context: this.state.context, generation }; }
  cancel(): void { this.state = { ...this.state, generation: this.state.generation + 1, loading: false, error: null, records: [] }; }
  isCurrent(token: ServiceContextAntiphonSearchToken): boolean { return token.context === this.state.context && token.generation === this.state.generation; }
  complete(token: ServiceContextAntiphonSearchToken, records: ReferenceAntiphonRecord[]): boolean { if (!this.isCurrent(token)) return false; this.state = { ...this.state, loading: false, error: null, records: [...records] }; return true; }
  fail(token: ServiceContextAntiphonSearchToken, message: string): boolean { if (!this.isCurrent(token)) return false; this.state = { ...this.state, loading: false, error: message, records: [] }; return true; }
}
