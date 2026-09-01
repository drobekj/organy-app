"use client";

import { useEffect, useState } from "react";
import type { ActorIdentity, InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import type { InMemoryPlanningSetRepository } from "../src/application/planning-lifecycle";
import {
  buildNonRepetitionPlanMelodyUsages,
  findNonRepetitionPlanConflicts,
  melodyWindowConflictMessage,
  validateMelodyWindowMonths,
  type MelodyWindowResult,
} from "../src/application/non-repetition-period";

export type NonRepetitionPeriodPanelProps = {
  runtimeMode: "memory" | "db";
  actor: ActorIdentity;
  memoryInteractionRepository: InMemoryInteractionRepository;
  memoryPlanningSets: InMemoryPlanningSetRepository;
  onSaved?: (months: number) => void;
};

type PanelFeedback = { kind: "idle" | "loading" | "saved" | "error"; message?: string };

export function NonRepetitionPeriodPanel({
  runtimeMode,
  actor,
  memoryInteractionRepository,
  memoryPlanningSets,
  onSaved,
}: NonRepetitionPeriodPanelProps) {
  const [currentMonths, setCurrentMonths] = useState<number | null>(null);
  const [draftMonths, setDraftMonths] = useState("2");
  const [feedback, setFeedback] = useState<PanelFeedback>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setFeedback({ kind: "loading" });
    void readCurrent().then((result) => {
      if (!active) return;
      if (result.success) {
        setCurrentMonths(result.value.months);
        setDraftMonths(String(result.value.months));
        setFeedback({ kind: "idle" });
      } else {
        setFeedback({ kind: "error", message: result.error.message });
      }
    }).catch((error: unknown) => {
      if (active) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Melody Protection could not be loaded." });
    });
    return () => { active = false; };
  }, [runtimeMode, actor.userId, actor.role]);

  async function readCurrent(): Promise<MelodyWindowResult> {
    if (runtimeMode === "memory") {
      return { success: true, value: memoryInteractionRepository.getMelodyWindow() };
    }
    return callPeriodApi("getMelodyWindow", {}, actor);
  }

  async function save(months: number) {
    if (!validateMelodyWindowMonths(months)) {
      setFeedback({ kind: "error", message: "Melody Protection must be between 0 and 12 calendar months." });
      if (currentMonths !== null) setDraftMonths(String(currentMonths));
      return;
    }

    setDraftMonths(String(months));
    setFeedback({ kind: "loading" });
    try {
      const result = runtimeMode === "memory"
        ? await setMemoryPeriod(months)
        : await callPeriodApi("setMelodyWindow", { months }, actor);
      if (!result.success) {
        setFeedback({ kind: "error", message: result.error.message });
        if (currentMonths !== null) setDraftMonths(String(currentMonths));
        return;
      }
      setCurrentMonths(result.value.months);
      setDraftMonths(String(result.value.months));
      setFeedback({ kind: "saved", message: `Saved ${result.value.months} calendar month${result.value.months === 1 ? "" : "s"}.` });
      onSaved?.(result.value.months);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Melody Protection could not be saved." });
      if (currentMonths !== null) setDraftMonths(String(currentMonths));
    }
  }

  async function setMemoryPeriod(months: number): Promise<MelodyWindowResult> {
    if (actor.role !== "admin") return { success: false, error: { code: "permissionDenied", message: "Only admin can change Melody Protection." } };
    if (!validateMelodyWindowMonths(months)) return { success: false, error: { code: "invalidInput", message: "Melody Protection must be between 0 and 12 calendar months." } };

    const plans = await memoryPlanningSets.list();
    const classBySongId = new Map<string, string>();
    for (const melodyClass of memoryInteractionRepository.listMelodyClasses()) {
      for (const songId of melodyClass.songIds) classBySongId.set(songId, melodyClass.id);
    }
    const conflicts = findNonRepetitionPlanConflicts(buildNonRepetitionPlanMelodyUsages(plans, classBySongId), months);
    if (conflicts.length > 0) {
      return { success: false, error: { code: "conflict", message: melodyWindowConflictMessage(conflicts, months), conflicts } };
    }
    const saved = memoryInteractionRepository.setMelodyWindow(actor, { months });
    return saved
      ? { success: true, value: memoryInteractionRepository.getMelodyWindow() }
      : { success: false, error: { code: "invalidInput", message: "Melody Protection could not be saved." } };
  }

  if (actor.role !== "admin") return null;

  return (
    <fieldset className="melody-protection-panel" aria-label="Melody Protection">
      <legend>Melody Protection</legend>
      <label className="melody-protection-control">
        <span className="sr-only">Melody Protection period</span>
        <select
          data-guide-hint="planning.melody-protection"
          aria-label="Melody Protection period"
          value={draftMonths}
          disabled={feedback.kind === "loading"}
          onChange={(event) => void save(Number(event.target.value))}
        >
          {Array.from({ length: 13 }, (_, months) => (
            <option key={months} value={months}>
              {months} {months === 1 ? "Month" : "Months"}
            </option>
          ))}
        </select>
      </label>
      {feedback.kind === "error" && <p className="inline-error" role="alert">{feedback.message}</p>}
    </fieldset>
  );
}

export async function callPeriodApi(action: "getMelodyWindow" | "setMelodyWindow", input: unknown, actor: ActorIdentity): Promise<MelodyWindowResult> {
  const response = await fetch("/api/interaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input, actor: { role: actor.role } }),
  });
  const payload = await response.json().catch(() => undefined) as MelodyWindowResult | { error?: { code?: string; message?: string } } | undefined;
  if (payload && "success" in payload) return payload;
  return { success: false, error: { code: "invalidInput", message: payload?.error?.message ?? `Melody Protection ${action === "getMelodyWindow" ? "read" : "save"} failed.` } };
}
