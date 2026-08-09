import type { ReferenceThematicSection } from "./reference-thematic-section-contract";
import type { ServiceLanguage } from "../planning-lifecycle";

export type ServiceContextTopicSearchIdentity = {
  runtimeMode: "memory" | "db";
  contextKey: string;
  editable: boolean;
  serviceLanguage: ServiceLanguage;
};

export type ServiceContextTopicSearchToken = { context: number; generation: number };
export type ServiceContextTopicSearchSnapshot = {
  identity: ServiceContextTopicSearchIdentity;
  context: number;
  generation: number;
  loading: boolean;
  error: string | null;
  records: ReferenceThematicSection[];
};

export class ServiceContextReferenceTopicUiState {
  private state: ServiceContextTopicSearchSnapshot;
  constructor(identity: ServiceContextTopicSearchIdentity) {
    this.state = { identity: { ...identity }, context: 0, generation: 0, loading: false, error: null, records: [] };
  }
  snapshot(): ServiceContextTopicSearchSnapshot { return { ...this.state, identity: { ...this.state.identity }, records: this.state.records.map(clone) }; }
  changeIdentity(identity: ServiceContextTopicSearchIdentity): boolean {
    if (identity.runtimeMode === this.state.identity.runtimeMode && identity.contextKey === this.state.identity.contextKey && identity.editable === this.state.identity.editable && identity.serviceLanguage === this.state.identity.serviceLanguage) return false;
    this.state = { identity: { ...identity }, context: this.state.context + 1, generation: this.state.generation + 1, loading: false, error: null, records: [] };
    return true;
  }
  begin(): ServiceContextTopicSearchToken { const generation = this.state.generation + 1; this.state = { ...this.state, generation, loading: true, error: null, records: [] }; return { context: this.state.context, generation }; }
  cancel(): void { this.state = { ...this.state, generation: this.state.generation + 1, loading: false, error: null, records: [] }; }
  isCurrent(token: ServiceContextTopicSearchToken): boolean { return token.context === this.state.context && token.generation === this.state.generation; }
  complete(token: ServiceContextTopicSearchToken, records: ReferenceThematicSection[]): boolean { if (!this.isCurrent(token)) return false; this.state = { ...this.state, loading: false, error: null, records: records.map(clone) }; return true; }
  fail(token: ServiceContextTopicSearchToken, message: string): boolean { if (!this.isCurrent(token)) return false; this.state = { ...this.state, loading: false, error: message, records: [] }; return true; }
}

function clone(section: ReferenceThematicSection): ReferenceThematicSection {
  return { ...section, ranges: section.ranges.map((range) => ({ ...range })), sourcePage: { ...section.sourcePage } };
}
