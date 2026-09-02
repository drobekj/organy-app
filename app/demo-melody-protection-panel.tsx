"use client";

import { useEffect } from "react";
import {
  demoOrganistMelodyProtectionMinimum,
  demoRoleInitialMelodyProtectionMonths,
  type DemoPresentationRole,
} from "../src/demo/d4-presentation-role";
import { GuidePanelHelpButton } from "./guide-panel-help-button";

export function DemoMelodyProtectionPanel({
  role,
  selectedOrganistPersonId,
  effectiveMonths,
  disabled = false,
  onEffectiveChange,
}: {
  role: DemoPresentationRole;
  selectedOrganistPersonId?: string;
  effectiveMonths: number;
  disabled?: boolean;
  onEffectiveChange: (months: number) => void;
}) {
  const minimumMonths = demoOrganistMelodyProtectionMinimum(selectedOrganistPersonId);
  const roleDefault = demoRoleInitialMelodyProtectionMonths(role, selectedOrganistPersonId);

  useEffect(() => {
    if (effectiveMonths !== roleDefault) onEffectiveChange(roleDefault);
  }, [role, selectedOrganistPersonId]);

  const value = role === "priest"
    ? Math.max(effectiveMonths, minimumMonths)
    : effectiveMonths;

  function change(months: number) {
    if (disabled || !Number.isInteger(months) || months < 0 || months > 12) return;
    if (role === "priest" && months < minimumMonths) return;
    onEffectiveChange(months);
  }

  const helper = role === "admin"
    ? `Temporary Admin value for the selected Organist. Demo allows 0–12 months; nothing is saved.`
    : role === "priest"
      ? `Selected Organist minimum: ${minimumMonths} ${minimumMonths === 1 ? "month" : "months"}. Lower values are unavailable.`
      : "Simulated own Organist setting. Changes affect this Demo session only.";

  return (
    <fieldset className="melody-protection-panel demo-melody-protection-panel" aria-label="Melody Protection" data-guide-hint-scope="planning.melody-protection">
      <GuidePanelHelpButton scope="planning.melody-protection" label="Melody Protection help" />
      <legend>Melody Protection</legend>
      <label className="melody-protection-control">
        <span className="sr-only">Melody Protection period</span>
        <select
          aria-label="Melody Protection period"
          data-guide-hint="planning.melody-protection"
          value={value}
          disabled={disabled}
          onChange={(event) => change(Number(event.target.value))}
        >
          {Array.from({ length: 13 }, (_, months) => (
            <option key={months} value={months} disabled={role === "priest" && months < minimumMonths}>
              {months} {months === 1 ? "Month" : "Months"}
            </option>
          ))}
        </select>
      </label>
      <span className="demo-melody-protection-help">{helper}</span>
    </fieldset>
  );
}
