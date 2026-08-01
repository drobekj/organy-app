import type { PlanningRole } from "../planning-lifecycle";
import type { ReferenceAntiphonRecommendation } from "./reference-antiphon-recommendation";

export type ReferenceAntiphonRecommendationActor = { userId: string; role: PlanningRole };
type Result = { success: true; value: ReferenceAntiphonRecommendation } | { success: false; error: { code: string; message: string } };
type Transport = (action: "getReferenceAntiphonRecommendation" | "setReferenceAntiphonRecommendation", input: unknown, actor: ReferenceAntiphonRecommendationActor) => Promise<Result>;

async function transport(action: "getReferenceAntiphonRecommendation" | "setReferenceAntiphonRecommendation", input: unknown, actor: ReferenceAntiphonRecommendationActor): Promise<Result> {
  const response = await fetch("/api/interaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, actor }) });
  return response.json() as Promise<Result>;
}

export function narrowReferenceAntiphonRecommendationActor(actor: ReferenceAntiphonRecommendationActor): ReferenceAntiphonRecommendationActor {
  return { userId: actor.userId, role: actor.role };
}

/** Framework-independent DB transport client; safe to use outside React rendering. */
export class DbReferenceAntiphonRecommendationClient {
  private readonly actor: ReferenceAntiphonRecommendationActor;

  constructor(actor: ReferenceAntiphonRecommendationActor, private readonly send: Transport = transport) {
    this.actor = narrowReferenceAntiphonRecommendationActor(actor);
  }

  get(antiphonId: string) { return this.send("getReferenceAntiphonRecommendation", { antiphonId }, this.actor); }
  set(antiphonId: string, referenceSongId: string | null) { return this.send("setReferenceAntiphonRecommendation", { antiphonId, referenceSongId }, this.actor); }
}
