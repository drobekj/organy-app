import type { PlanningRole } from "../planning-lifecycle";
import type { ReferenceAntiphonRecommendation } from "./reference-antiphon-recommendation";

export type ReferenceAntiphonRecommendationActor = { userId: string; role: PlanningRole };
type ProtectedRecommendationActorContext = Pick<ReferenceAntiphonRecommendationActor, "role">;
type Result = { success: true; value: ReferenceAntiphonRecommendation } | { success: false; error: { code: string; message: string } };
type Transport = (action: "getReferenceAntiphonRecommendation" | "setReferenceAntiphonRecommendation", input: unknown, actor: ProtectedRecommendationActorContext) => Promise<Result>;

async function transport(action: "getReferenceAntiphonRecommendation" | "setReferenceAntiphonRecommendation", input: unknown, actor: ProtectedRecommendationActorContext): Promise<Result> {
  const response = await fetch("/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }) });
  return response.json() as Promise<Result>;
}

/** Framework-independent DB transport client; safe to use outside React rendering. */
export class DbReferenceAntiphonRecommendationClient {
  constructor(private readonly actor: ReferenceAntiphonRecommendationActor, private readonly send: Transport = transport) {}
  private actorContext(): ProtectedRecommendationActorContext { return { role: this.actor.role }; }
  get(antiphonId: string) { return this.send("getReferenceAntiphonRecommendation", { antiphonId }, this.actorContext()); }
  set(antiphonId: string, referenceSongId: string | null) { return this.send("setReferenceAntiphonRecommendation", { antiphonId, referenceSongId }, this.actorContext()); }
}
