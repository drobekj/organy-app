export { canManageKnowledge, canManageRepertoire, getCandidateSignal, getPreferenceShade, preferenceScoreLimit, validateOwnPreferenceScore } from "./interaction-contracts";
import type { ServiceLanguage } from "../planning-lifecycle";
export function languagesForServiceShim(language: ServiceLanguage): ("czech" | "polish")[] { return language === "mixed" ? ["czech", "polish"] : [language]; }
