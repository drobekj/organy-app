"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanningRole } from "../src/planning-lifecycle";
import {
  GUIDE_HINTS_CHANGED_EVENT,
  GUIDE_HINTS_STORAGE_KEY,
  GUIDE_LANGUAGE_CHANGED_EVENT,
  GUIDE_LANGUAGE_STORAGE_KEY,
  guideHintCopy,
  isGuideHintKey,
  type GuideHintKey,
  type GuideLanguage,
} from "./guide-content";

type ActiveHint = {
  key: GuideHintKey;
  rect: DOMRect;
  mode: "field" | "info";
};

const GUIDE_FIELD_SELECTOR = 'input:not([type="hidden"]), select, textarea, [role="combobox"]';

function storedLanguage(): GuideLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(GUIDE_LANGUAGE_STORAGE_KEY);
  return stored === "cz" ? "cz" : "en";
}

function storedEnabled(): boolean {
  return typeof window === "undefined" || window.localStorage.getItem(GUIDE_HINTS_STORAGE_KEY) !== "off";
}

function closestElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function scopeFor(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>("[data-guide-hint-scope]") ?? null;
}

function scopedField(target: EventTarget | null): HTMLElement | null {
  const element = closestElement(target);
  const field = element?.closest<HTMLElement>(GUIDE_FIELD_SELECTOR) ?? null;
  return field && scopeFor(field) ? field : null;
}

function hintKeyForScope(scope: HTMLElement | null): GuideHintKey | null {
  const rawKey = scope?.dataset.guideHintScope;
  return rawKey && isGuideHintKey(rawKey) ? rawKey : null;
}

function infoTrigger(target: EventTarget | null): HTMLElement | null {
  return closestElement(target)?.closest<HTMLElement>("[data-guide-hint-trigger]") ?? null;
}

export function GuideHintLayer({ activeRole }: { activeRole: PlanningRole }) {
  const [enabled, setEnabled] = useState(true);
  const [language, setLanguage] = useState<GuideLanguage>("en");
  const [active, setActive] = useState<ActiveHint | null>(null);
  const activeFieldRef = useRef<HTMLElement | null>(null);
  const suppressedFieldRef = useRef<HTMLElement | null>(null);

  const syncSettings = useCallback(() => {
    setEnabled(storedEnabled());
    setLanguage(storedLanguage());
  }, []);

  const hideFieldHint = useCallback((field?: HTMLElement | null) => {
    if (!field || activeFieldRef.current === field) {
      activeFieldRef.current = null;
      setActive((current) => current?.mode === "field" ? null : current);
    }
  }, []);

  const showFieldHint = useCallback((field: HTMLElement) => {
    if (suppressedFieldRef.current === field) return;
    const key = hintKeyForScope(scopeFor(field));
    if (!key) return;
    activeFieldRef.current = field;
    setActive({ key, rect: field.getBoundingClientRect(), mode: "field" });
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
    if (!enabled) {
      activeFieldRef.current = null;
      suppressedFieldRef.current = null;
      setActive(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function onPointerOver(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const field = scopedField(event.target);
      if (field) showFieldHint(field);
    }

    function onPointerOut(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const field = scopedField(event.target);
      if (!field) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && field.contains(next)) return;
      if (suppressedFieldRef.current === field) suppressedFieldRef.current = null;
      hideFieldHint(field);
    }

    function onFocusIn(event: FocusEvent) {
      const field = scopedField(event.target);
      if (field) showFieldHint(field);
    }

    function onFocusOut(event: FocusEvent) {
      const field = scopedField(event.target);
      if (!field) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && field.contains(next)) return;
      hideFieldHint(field);
    }

    function onPointerDown(event: PointerEvent) {
      const field = scopedField(event.target);
      if (!field) return;
      suppressedFieldRef.current = field;
      activeFieldRef.current = null;
      setActive(null);
    }

    function onClick(event: MouseEvent) {
      const trigger = infoTrigger(event.target);
      if (!trigger) return;
      const rawKey = trigger.dataset.guideHintTrigger;
      if (!rawKey || !isGuideHintKey(rawKey)) return;
      activeFieldRef.current = null;
      setActive((current) => (
        current?.mode === "info" && current.key === rawKey
          ? null
          : { key: rawKey, rect: trigger.getBoundingClientRect(), mode: "info" }
      ));
    }

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [enabled, hideFieldHint, showFieldHint]);

  useEffect(() => {
    if (!active) return;
    const activeKey = active.key;

    function refreshPosition() {
      if (activeFieldRef.current?.isConnected) {
        setActive((current) => current ? { ...current, rect: activeFieldRef.current!.getBoundingClientRect() } : null);
        return;
      }

      const trigger = document.querySelector<HTMLElement>(`[data-guide-hint-trigger="${activeKey}"]`);
      if (trigger) {
        setActive((current) => current ? { ...current, rect: trigger.getBoundingClientRect() } : null);
        return;
      }

      setActive(null);
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

  const mobile = active.mode === "info"
    && typeof window !== "undefined"
    && window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const width = Math.min(360, Math.max(260, typeof window === "undefined" ? 360 : window.innerWidth - 24));
  const left = mobile
    ? 12
    : Math.max(12, Math.min(active.rect.left, window.innerWidth - width - 12));
  const below = active.rect.bottom + 8;
  const top = mobile
    ? undefined
    : (below + 165 <= window.innerHeight ? below : Math.max(12, active.rect.top - 165));

  return (
    <aside
      className={`guide-hint-popover${mobile ? " guide-hint-mobile" : ""}`}
      role="tooltip"
      style={mobile ? undefined : { left, top, width }}
      data-guide-hint-key={active.key}
    >
      <strong>{content.title}</strong>
      <p>{content.copy}</p>
      {content.roleCopy && <p className="guide-hint-role">{content.roleCopy}</p>}
    </aside>
  );
}
