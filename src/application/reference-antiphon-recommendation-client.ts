import type { PlanningRole } from "../planning-lifecycle";
import type { ReferenceAntiphonRecommendation } from "./reference-antiphon-recommendation";

export type ReferenceAntiphonRecommendationActor = { userId: string; role: PlanningRole };
type Result = { success: true; value: ReferenceAntiphonRecommendation } | { success: false; error: { code: string; message: string } };
type Transport = (action: "getReferenceAntiphonRecommendation" | "setReferenceAntiphonRecommendation", input: unknown, actor: ReferenceAntiphonRecommendationActor) => Promise<Result>;

async function transport(action: "getReferenceAntiphonRecommendation" | "setReferenceAntiphonRecommendation", input: unknown, actor: ReferenceAntiphonRecommendationActor): Promise<Result> {
  const response = await fetch("/api/interaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input, actor: { role: actor.role } }),
  });
  return response.json() as Promise<Result>;
}

/** Framework-independent DB transport client; safe to use outside React rendering. */
export class DbReferenceAntiphonRecommendationClient {
  constructor(private readonly actor: ReferenceAntiphonRecommendationActor, private readonly send: Transport = transport) {}
  get(antiphonId: string) { return this.send("getReferenceAntiphonRecommendation", { antiphonId }, this.actor); }
  set(antiphonId: string, referenceSongId: string | null) { return this.send("setReferenceAntiphonRecommendation", { antiphonId, referenceSongId }, this.actor); }
}
