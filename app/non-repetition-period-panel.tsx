"use client";

import { useEffect, useState } from "react";
import type { ActorIdentity, InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import type { InMemoryPlanningSetRepository } from "../src/application/planning-lifecycle";
import type { MelodyWindowResult } from "../src/application/non-repetition-period";
import { GuidePanelHelpButton } from "./guide-panel-help-button";

export type NonRepetitionPeriodPanelProps = {
  runtimeMode: "memory" | "db";
  actor: ActorIdentity;
  selectedOrganistPersonId?: string;
  effectiveMonths: number;
  disabled?: boolean;
  memoryInteractionRepository: InMemoryInteractionRepository;
  memoryPlanningSets: InMemoryPlanningSetRepository;
  onEffectiveChange: (months: number) => void;
  onMinimumLoaded?: (months: number) => void;
  onSaved?: (months: number) => void;
};

type PanelFeedback = { kind: "idle" | "loading" | "saved" | "error"; message?: string };

export function canEditSelectedOrganistMelodyProtection(actor: ActorIdentity, selectedOrganistPersonId?: string): boolean {
  if (actor.role !== "organist") return true;
  return Boolean(actor.personId && selectedOrganistPersonId && actor.personId === selectedOrganistPersonId);
}

export function NonRepetitionPeriodPanel({
  runtimeMode,
  actor,
  selectedOrganistPersonId,
  effectiveMonths,
  disabled = false,
  onEffectiveChange,
  onMinimumLoaded,
  onSaved,
}: NonRepetitionPeriodPanelProps) {
  const [minimumMonths, setMinimumMonths] = useState(selectedOrganistPersonId ? 2 : 0);
  const [feedback, setFeedback] = useState<PanelFeedback>({ kind: "loading" });
  const canEditSelectedOrganist = canEditSelectedOrganistMelodyProtection(actor, selectedOrganistPersonId);

  useEffect(() => {
    if (actor.role !== "priest" && actor.role !== "organist" && actor.role !== "admin") return;
    let active = true;
    setFeedback({ kind: "loading" });
    const read = runtimeMode === "db"
      ? callMelodyProtectionApi(
          "getOrganistMelodyProtection",
          selectedOrganistPersonId ? { organistPersonId: selectedOrganistPersonId } : {},
          actor,
        )
      : Promise.resolve({
          success: true,
          value: { months: selectedOrganistPersonId ? 2 : 0 },
        } as MelodyWindowResult);

    void read.then((result) => {
      if (!active) return;
      if (!result.success) {
        setFeedback({ kind: "error", message: result.error.message });
        return;
      }
      const months = result.value.months;
      setMinimumMonths(months);
      onMinimumLoaded?.(months);
      setFeedback({ kind: "idle" });
      // A selected-organist change can finish after the first candidate request.
      // Force dependent candidate/conflict state to be rebuilt from this resolved value.
      onSaved?.(months);
    }).catch((error: unknown) => {
      if (active) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Melody Protection could not be loaded." });
    });
    return () => { active = false; };
  }, [runtimeMode, actor.userId, actor.role, actor.personId, selectedOrganistPersonId]);

  useEffect(() => {
    if (actor.role !== "organist" || feedback.kind === "loading" || feedback.kind === "error") return;
    if (effectiveMonths === minimumMonths) return;
    // For an organist, the effective Planning value follows the Service Context organist,
    // not the signed-in organist. This also repairs a later stale/max update from another read.
    onEffectiveChange(minimumMonths);
    onSaved?.(minimumMonths);
  }, [actor.role, effectiveMonths, minimumMonths, feedback.kind, onEffectiveChange, onSaved]);

  if (actor.role !== "priest" && actor.role !== "organist" && actor.role !== "admin") return null;

  const value = actor.role === "organist"
    ? minimumMonths
    : actor.role === "admin"
      ? effectiveMonths
      : Math.max(effectiveMonths, minimumMonths);

  async function change(months: number) {
    if (!Number.isInteger(months) || months < 0 || months > 12) return;

    if (actor.role === "admin") {
      onEffectiveChange(months);
      onSaved?.(months);
      return;
    }

    if (actor.role === "priest") {
      if (months < minimumMonths) return;
      onEffectiveChange(months);
      onSaved?.(months);
      return;
    }

    if (!canEditSelectedOrganist) return;
    setFeedback({ kind: "loading" });
    const result = runtimeMode === "db"
      ? await callMelodyProtectionApi("setOwnMelodyProtection", { months }, actor)
      : ({ success: true, value: { months } } as MelodyWindowResult);
    if (!result.success) {
      setFeedback({ kind: "error", message: result.error.message });
      return;
    }
    setMinimumMonths(result.value.months);
    onEffectiveChange(result.value.months);
    setFeedback({ kind: "saved" });
    onSaved?.(result.value.months);
  }

  return (
    <fieldset className="melody-protection-panel" aria-label="Melody Protection" data-guide-hint-scope="planning.melody-protection">
      <GuidePanelHelpButton scope="planning.melody-protection" label="Melody Protection help" />
      <legend>Melody Protection</legend>
      <label className="melody-protection-control">
        <span className="sr-only">Melody Protection period</span>
        <select
          aria-label="Melody Protection period"
          data-guide-hint="planning.melody-protection"
          value={value}
          disabled={disabled || feedback.kind === "loading" || !canEditSelectedOrganist}
          onChange={(event) => void change(Number(event.target.value))}
        >
          {Array.from({ length: 13 }, (_, months) => (
            <option key={months} value={months} disabled={actor.role === "priest" && months < minimumMonths}>
              {months} {months === 1 ? "Month" : "Months"}
            </option>
          ))}
        </select>
      </label>
      {actor.role === "organist" && selectedOrganistPersonId && !canEditSelectedOrganist && (
        <span className="field-help">Selected organist&apos;s Melody Protection is read-only.</span>
      )}
      {feedback.kind === "error" && <p className="inline-error" role="alert">{feedback.message}</p>}
    </fieldset>
  );
}

export async function callMelodyProtectionApi(
  action: "getOrganistMelodyProtection" | "getOwnMelodyProtection" | "setOwnMelodyProtection",
  input: unknown,
  actor: ActorIdentity,
): Promise<MelodyWindowResult> {
  const response = await fetch("/api/interaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input, actor: { role: actor.role } }),
  });
  const payload = await response.json().catch(() => undefined) as MelodyWindowResult | { error?: { message?: string } } | undefined;
  if (payload && "success" in payload) return payload;
  return { success: false, error: { code: response.status === 404 ? "notFound" : "permissionDenied", message: payload?.error?.message ?? "Melody Protection request failed." } };
}

/** Historical compatibility seam retained for Phase 31.24 acceptance only. */
export async function callPeriodApi(action: "getMelodyWindow" | "setMelodyWindow", input: unknown, actor: ActorIdentity): Promise<MelodyWindowResult> {
  const response = await fetch("/api/interaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input, actor: { role: actor.role } }),
  });
  const payload = await response.json().catch(() => undefined) as MelodyWindowResult | { error?: { message?: string } } | undefined;
  if (payload && "success" in payload) return payload;
  return { success: false, error: { code: "invalidInput", message: payload?.error?.message ?? "Melody Protection request failed." } };
}
