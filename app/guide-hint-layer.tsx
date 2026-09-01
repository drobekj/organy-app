"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanningRole } from "../src/planning-lifecycle";
import {
  GUIDE_HINTS_CHANGED_EVENT,
  GUIDE_HINTS_STORAGE_KEY,
  GUIDE_LANGUAGE_CHANGED_EVENT,
  GUIDE_LANGUAGE_STORAGE_KEY,
  guideHintCopy,
  guideHints,
  isGuideHintKey,
  type GuideHintKey,
  type GuideLanguage,
} from "./guide-content";

type ActiveHint = {
  key: GuideHintKey;
  rect: DOMRect;
  touch: boolean;
};

function storedLanguage(): GuideLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(GUIDE_LANGUAGE_STORAGE_KEY);
  return stored === "cz" ? "cz" : "en";
}

function storedEnabled(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(GUIDE_HINTS_STORAGE_KEY) === "on";
}

function hintTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-guide-hint]") : null;
}

export function GuideHintLayer({ activeRole }: { activeRole: PlanningRole }) {
  const [enabled, setEnabled] = useState(false);
  const [language, setLanguage] = useState<GuideLanguage>("en");
  const [active, setActive] = useState<ActiveHint | null>(null);

  const syncSettings = useCallback(() => {
    setEnabled(storedEnabled());
    setLanguage(storedLanguage());
  }, []);

  useEffect(() => {
    syncSettings();
    function handleStorage(event: StorageEvent) {
      if (event.key === GUIDE_HINTS_STORAGE_KEY || event.key === GUIDE_LANGUAGE_STORAGE_KEY) syncSettings();
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener(GUIDE_HINTS_CHANGED_EVENT, syncSettings);
    window.addEventListener(GUIDE_LANGUAGE_CHANGED_EVENT, syncSettings);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(GUIDE_HINTS_CHANGED_EVENT, syncSettings);
      window.removeEventListener(GUIDE_LANGUAGE_CHANGED_EVENT, syncSettings);
    };
  }, [syncSettings]);

  useEffect(() => {
    document.documentElement.classList.toggle("guide-hints-enabled", enabled);
    if (!enabled) setActive(null);
    return () => document.documentElement.classList.remove("guide-hints-enabled");
  }, [enabled]);

  const show = useCallback((target: HTMLElement, touch: boolean) => {
    const rawKey = target.dataset.guideHint;
    if (!rawKey || !isGuideHintKey(rawKey)) return;
    setActive({ key: rawKey, rect: target.getBoundingClientRect(), touch });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onPointerOver(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const target = hintTarget(event.target);
      if (target) show(target, false);
    }

    function onPointerOut(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const target = hintTarget(event.target);
      if (!target) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && target.contains(next)) return;
      setActive((current) => current?.touch ? current : null);
    }

    function onFocusIn(event: FocusEvent) {
      const target = hintTarget(event.target);
      if (target) show(target, false);
    }

    function onFocusOut(event: FocusEvent) {
      const target = hintTarget(event.target);
      if (!target) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && target.contains(next)) return;
      setActive((current) => current?.touch ? current : null);
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerType !== "touch") return;
      const target = hintTarget(event.target);
      if (target) show(target, true);
    }

    function onPointerDown(event: PointerEvent) {
      if (!active?.touch) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".guide-hint-popover") || target?.closest("[data-guide-hint]")) return;
      setActive(null);
    }

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active?.touch, enabled, show]);

  useEffect(() => {
    if (!active) return;
    const activeKey = active.key;
    function refreshPosition() {
      const target = document.querySelector<HTMLElement>(`[data-guide-hint="${activeKey}"]`);
      if (!target) {
        setActive(null);
        return;
      }
      setActive((current) => current ? { ...current, rect: target.getBoundingClientRect() } : null);
    }
    window.addEventListener("resize", refreshPosition);
    window.addEventListener("scroll", refreshPosition, true);
    return () => {
      window.removeEventListener("resize", refreshPosition);
      window.removeEventListener("scroll", refreshPosition, true);
    };
  }, [active?.key]);

  const content = useMemo(
    () => active ? guideHintCopy(active.key, language, activeRole) : null,
    [active, activeRole, language],
  );

  if (!enabled || !active || !content) return null;

  const mobile = active.touch || (typeof window !== "undefined" && window.matchMedia("(max-width: 700px), (pointer: coarse)").matches);
  const width = Math.min(360, Math.max(260, typeof window === "undefined" ? 360 : window.innerWidth - 24));
  const left = mobile
    ? 12
    : Math.max(12, Math.min(active.rect.left, window.innerWidth - width - 12));
  const top = mobile
    ? undefined
    : Math.min(window.innerHeight - 180, Math.max(12, active.rect.bottom + 8));

  return (
    <aside
      className={`guide-hint-popover${mobile ? " guide-hint-mobile" : ""}`}
      role="tooltip"
      style={mobile ? undefined : { left, top, width }}
      data-guide-hint-key={active.key}
    >
      <div className="guide-hint-heading">
        <strong>{content.title}</strong>
        <button type="button" aria-label={language === "cz" ? "Zavřít nápovědu" : "Close hint"} onClick={() => setActive(null)}>×</button>
      </div>
      <p>{content.copy}</p>
      {content.roleCopy && <p className="guide-hint-role">{content.roleCopy}</p>}
    </aside>
  );
}

export const guideHintKeys = Object.keys(guideHints) as GuideHintKey[];
