export type CongregationVoterMode = "temporaryBrowser" | "registeredEmail";

/**
 * Temporary product switch while the congregation decides on the email sender setup.
 * Keep this centralized so the eventual registered-email cutover is one explicit change.
 */
export function congregationVoterMode(): CongregationVoterMode {
  return "temporaryBrowser";
}

export function isTemporaryCongregationVoterMode(): boolean {
  return congregationVoterMode() === "temporaryBrowser";
}
