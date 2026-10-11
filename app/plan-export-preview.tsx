"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPlanExportText, type PlanExportSource } from "../src/planning-lifecycle/plan-export";

type Props = {
  plan: PlanExportSource;
  onClose: () => void;
};

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy browser fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed.");
}

export function PlanExportPreview({ plan, onClose }: Props) {
  const text = useMemo(() => formatPlanExportText(plan), [plan]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copy() {
    try {
      await writeClipboardText(text);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div
      className="plan-export-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="plan-export-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-export-dialog-title">
        <div className="plan-export-header">
          <h2 id="plan-export-dialog-title">Export preview</h2>
          <button type="button" className="plan-export-close" onClick={onClose} aria-label="Close export preview">Close</button>
        </div>
        <pre className="plan-export-text">{text}</pre>
        <div className="plan-export-footer">
          <span className="plan-export-copy-feedback" role="status">
            {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : ""}
          </span>
          <button
            type="button"
            className="plan-export-copy"
            onClick={() => { void copy(); }}
            aria-label="Copy export text"
            title="Copy export text"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="8" y="8" width="11" height="11" rx="2.25" />
              <rect x="5" y="5" width="11" height="11" rx="2.25" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  );
}
