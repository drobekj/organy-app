import type { PlanningPlan, ServiceContext } from "./model";

export type PlanExportSource = Pick<PlanningPlan, "status" | "rows"> & {
  serviceContext: ServiceContext;
};

export function formatPlanExportText(plan: PlanExportSource): string {
  const context = plan.serviceContext;
  const lines = [
    plan.status === "final" ? "Final plan" : "Working plan",
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
