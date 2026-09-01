"use client";

import { useEffect, useState } from "react";
import {
  GUIDE_HINTS_CHANGED_EVENT,
  GUIDE_HINTS_STORAGE_KEY,
} from "./guide-content";

function readEnabled(): boolean {
  return window.localStorage.getItem(GUIDE_HINTS_STORAGE_KEY) !== "off";
}

export function GuideHintsSetting() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readEnabled());

    function sync() {
      setEnabled(readEnabled());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === GUIDE_HINTS_STORAGE_KEY) sync();
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(GUIDE_HINTS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(GUIDE_HINTS_CHANGED_EVENT, sync);
    };
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    window.localStorage.setItem(GUIDE_HINTS_STORAGE_KEY, next ? "on" : "off");
    window.dispatchEvent(new Event(GUIDE_HINTS_CHANGED_EVENT));
  }

  return (
    <div className="workspace-guide-hints-setting">
      <span>Guide Hints</span>
      <button
        type="button"
        className="workspace-toggle-switch"
        role="switch"
        aria-checked={enabled}
        aria-label={`Guide Hints ${enabled ? "on" : "off"}`}
        onClick={toggle}
      >
        <span className="workspace-toggle-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
