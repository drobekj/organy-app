export type CongregationVoterMode = "temporaryBrowser" | "registeredEmail";

/**
 * Current product switch: browser-bound congregation voting is active, while the
 * registered-email implementation remains dormant for a possible later cutover.
 * Keep this centralized so any future mode change stays explicit.
 */
export function congregationVoterMode(): CongregationVoterMode {
  return "temporaryBrowser";
}

export function isTemporaryCongregationVoterMode(): boolean {
  return congregationVoterMode() === "temporaryBrowser";
}
