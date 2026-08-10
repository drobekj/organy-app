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
};

type PanelFeedback = { kind: "idle" | "loading" | "saved" | "error"; message?: string };

export function NonRepetitionPeriodPanel({
  runtimeMode,
  actor,
  memoryInteractionRepository,
  memoryPlanningSets,
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
      if (active) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Melody non-repetition period could not be loaded." });
    });
    return () => { active = false; };
  }, [runtimeMode, actor.userId, actor.role]);

  async function readCurrent(): Promise<MelodyWindowResult> {
    if (runtimeMode === "memory") {
      return { success: true, value: memoryInteractionRepository.getMelodyWindow() };
    }
    return callPeriodApi("getMelodyWindow", {}, actor);
  }

  async function save() {
    const months = Number(draftMonths);
    if (!draftMonths.trim() || !validateMelodyWindowMonths(months) || String(months) !== draftMonths.trim()) {
      setFeedback({ kind: "error", message: "Melody non-repetition period must be a finite non-negative integer number of calendar months." });
      return;
    }

    setFeedback({ kind: "loading" });
    try {
      const result = runtimeMode === "memory"
        ? await setMemoryPeriod(months)
        : await callPeriodApi("setMelodyWindow", { months }, actor);
      if (!result.success) {
        setFeedback({ kind: "error", message: result.error.message });
        return;
      }
      setCurrentMonths(result.value.months);
      setDraftMonths(String(result.value.months));
      setFeedback({ kind: "saved", message: `Saved ${result.value.months} calendar month${result.value.months === 1 ? "" : "s"}.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Melody non-repetition period could not be saved." });
    }
  }

  async function setMemoryPeriod(months: number): Promise<MelodyWindowResult> {
    if (actor.role !== "admin") return { success: false, error: { code: "permissionDenied", message: "Only admin can change the melody non-repetition period." } };
    if (!validateMelodyWindowMonths(months)) return { success: false, error: { code: "invalidInput", message: "Melody non-repetition period must be a finite non-negative integer number of calendar months." } };

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
      : { success: false, error: { code: "invalidInput", message: "Melody non-repetition period could not be saved." } };
  }

  const currentLabel = currentMonths === null
    ? "Melody non-repetition period unavailable."
    : `Melody non-repetition: ${currentMonths} calendar month${currentMonths === 1 ? "" : "s"} before and after.`;

  return (
    <div className="non-repetition-period-panel">
      <p className="field-help" aria-live="polite">{currentLabel}</p>
      {actor.role === "admin" ? (
        <div className="row-actions">
          <label>
            Period (calendar months)
            <input
              aria-label="Melody non-repetition period"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draftMonths}
              disabled={feedback.kind === "loading"}
              onChange={(event) => { setDraftMonths(event.target.value); setFeedback({ kind: "idle" }); }}
            />
          </label>
          <button type="button" disabled={feedback.kind === "loading"} onClick={() => void save()}>Save period</button>
        </div>
      ) : null}
      {feedback.kind === "saved" && <p className="field-help" role="status">{feedback.message}</p>}
      {feedback.kind === "error" && <p className="inline-error" role="alert">{feedback.message}</p>}
    </div>
  );
}

async function callPeriodApi(action: "getMelodyWindow" | "setMelodyWindow", input: unknown, actor: ActorIdentity): Promise<MelodyWindowResult> {
  const response = await fetch("/api/interaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input, actor: { userId: actor.userId, role: actor.role } }),
  });
  const payload = await response.json().catch(() => undefined) as MelodyWindowResult | { error?: { code?: string; message?: string } } | undefined;
  if (payload && "success" in payload) return payload;
  return { success: false, error: { code: "invalidInput", message: payload?.error?.message ?? `Melody non-repetition ${action === "getMelodyWindow" ? "read" : "save"} failed.` } };
}
