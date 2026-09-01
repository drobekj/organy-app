import type { GuidePanelScope } from "./guide-control-hints";

export function GuidePanelHelpButton({ scope, label }: { scope: GuidePanelScope; label: string }) {
  return (
    <button
      type="button"
      className="guide-scope-info"
      data-guide-hint-trigger={scope}
      aria-label={label}
      title={label}
    >
      i
    </button>
  );
}
