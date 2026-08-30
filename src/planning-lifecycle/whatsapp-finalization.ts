import type { PersistedPlanningSet } from "../application/planning-lifecycle/ports";

export function formatFinalPlanWhatsAppMessage(plan: PersistedPlanningSet): string {
  const context = plan.serviceContext;
  const lines = [
    "Final plan",
    `Date: ${context.serviceDate}`,
    `Time: ${context.serviceTime}`,
    `Language: ${context.language}`,
    `Priest: ${context.priest.displayName}`,
    `Organist: ${context.organist.displayName}`,
  ];

  if (context.referenceAntiphon) {
    lines.push(`Antiphon: ${context.referenceAntiphon.displayNumber} ${context.referenceAntiphon.title}`.trim());
  }
  if (context.referenceTopic) lines.push(`Topic: ${context.referenceTopic.title}`);
  if (context.note?.trim()) lines.push(`Note: ${context.note.trim()}`);

  lines.push("", "Songs:");
  if (plan.rows.length === 0) {
    lines.push("—");
  } else {
    plan.rows.forEach((row, index) => {
      const song = row.song;
      const songText = song
        ? [song.number, song.title?.trim()].filter(Boolean).join(" ")
        : "—";
      const note = row.note?.trim();
      lines.push(`${index + 1}. ${songText}${note ? ` — ${note}` : ""}`);
    });
  }

  return lines.join("\n");
}

export function buildFinalPlanWhatsAppUrl(plan: PersistedPlanningSet): string {
  return `https://wa.me/?text=${encodeURIComponent(formatFinalPlanWhatsAppMessage(plan))}`;
}
