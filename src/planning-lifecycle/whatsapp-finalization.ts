import type { PersistedPlanningPlan } from "../application/planning-lifecycle/ports";
import { whatsAppPhoneDigits } from "../application/whatsapp-phone";

export function formatFinalPlanWhatsAppMessage(plan: PersistedPlanningPlan): string {
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

export function buildFinalPlanWhatsAppUrl(plan: PersistedPlanningPlan, phoneE164: string): string {
  return `https://wa.me/${whatsAppPhoneDigits(phoneE164)}?text=${encodeURIComponent(formatFinalPlanWhatsAppMessage(plan))}`;
}
