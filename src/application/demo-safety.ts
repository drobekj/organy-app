/**
 * Stage D0 Demo safety foundation.
 *
 * DATA BACKEND and EXPERIENCE are deliberately independent axes.
 * This module is not imported by Production routes or UI in D0.
 */

export const DATA_BACKENDS = ["memory", "db"] as const;
export type DataBackend = (typeof DATA_BACKENDS)[number];

export const EXPERIENCE_MODES = ["standard", "demo"] as const;
export type ExperienceMode = (typeof EXPERIENCE_MODES)[number];

export type RuntimeExperienceContract = Readonly<{
  dataBackend: DataBackend;
  experience: ExperienceMode;
}>;

export type DemoCapabilityPolicy = Readonly<{
  localDraftEditing: true;
  protectedProductionApiAccess: false;
  persistentPlanningWrites: false;
  persistentCatalogWrites: false;
  persistentPreferenceWrites: false;
  persistentRepertoireWrites: false;
  persistentMelodyKnowledgeWrites: false;
  persistentMelodyProtectionWrites: false;
  accountAdministrationWrites: false;
  productionAuditHistoryAccess: false;
}>;

export const DEMO_CAPABILITIES: DemoCapabilityPolicy = Object.freeze({
  localDraftEditing: true,
  protectedProductionApiAccess: false,
  persistentPlanningWrites: false,
  persistentCatalogWrites: false,
  persistentPreferenceWrites: false,
  persistentRepertoireWrites: false,
  persistentMelodyKnowledgeWrites: false,
  persistentMelodyProtectionWrites: false,
  accountAdministrationWrites: false,
  productionAuditHistoryAccess: false,
});

export const DEMO_WRITE_DENIED_CODE = "demoReadOnly" as const;

export class DemoWriteDeniedError extends Error {
  readonly code = DEMO_WRITE_DENIED_CODE;

  constructor(readonly operation: string) {
    super(`Demo mode is read-only for persistent operation '${operation}'.`);
    this.name = "DemoWriteDeniedError";
  }
}

/**
 * Central fail-closed experience gate for future persistent mutation adapters.
 *
 * D0 intentionally does not wire this into existing Production code paths.
 * Future Demo clients must pass every persistent mutation through this boundary.
 */
export function assertPersistentWriteAllowed(experience: ExperienceMode, operation: string): void {
  if (experience === "demo") throw new DemoWriteDeniedError(operation);
}

/**
 * Executes a persistent mutation only when the experience permits it.
 * Demo fails before the mutation callback is invoked; it never returns fake success.
 */
export async function runPersistentMutation<T>(
  experience: ExperienceMode,
  operation: string,
  mutation: () => Promise<T> | T,
): Promise<T> {
  assertPersistentWriteAllowed(experience, operation);
  return await mutation();
}
