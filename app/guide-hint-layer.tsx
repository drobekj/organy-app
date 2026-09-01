"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanningRole } from "../src/planning-lifecycle";
import {
  GUIDE_HINTS_CHANGED_EVENT,
  GUIDE_HINTS_STORAGE_KEY,
  GUIDE_LANGUAGE_CHANGED_EVENT,
  GUIDE_LANGUAGE_STORAGE_KEY,
  type GuideLanguage,
} from "./guide-content";
import {
  anyGuideHintCopy,
  guidePanelHintKeys,
  isAnyGuideHintKey,
  type AnyGuideHintKey,
} from "./guide-control-hints";

type ActiveHint = {
  keys: AnyGuideHintKey[];
  rect: DOMRect;
  mode: "control" | "info";
  triggerScope?: string;
};

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

function hintedControl(target: EventTarget | null): HTMLElement | null {
  return closestElement(target)?.closest<HTMLElement>("[data-guide-hint]") ?? null;
}

function hintKeyForControl(control: HTMLElement | null): AnyGuideHintKey | null {
  const rawKey = control?.dataset.guideHint;
  return rawKey && isAnyGuideHintKey(rawKey) ? rawKey : null;
}

function infoTrigger(target: EventTarget | null): HTMLElement | null {
  return closestElement(target)?.closest<HTMLElement>("[data-guide-hint-trigger]") ?? null;
}

export function GuideHintLayer({ activeRole }: { activeRole: PlanningRole }) {
  const [enabled, setEnabled] = useState(true);
  const [language, setLanguage] = useState<GuideLanguage>("en");
  const [active, setActive] = useState<ActiveHint | null>(null);
  const activeControlRef = useRef<HTMLElement | null>(null);
  const suppressedControlRef = useRef<HTMLElement | null>(null);

  const syncSettings = useCallback(() => {
    setEnabled(storedEnabled());
    setLanguage(storedLanguage());
  }, []);

  const hideControlHint = useCallback((control?: HTMLElement | null) => {
    if (!control || activeControlRef.current === control) {
      activeControlRef.current = null;
      setActive((current) => current?.mode === "control" ? null : current);
    }
  }, []);

  const showControlHint = useCallback((control: HTMLElement) => {
    if (suppressedControlRef.current === control) return;
    const key = hintKeyForControl(control);
    if (!key) return;
    activeControlRef.current = control;
    setActive({ keys: [key], rect: control.getBoundingClientRect(), mode: "control" });
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
      activeControlRef.current = null;
      suppressedControlRef.current = null;
      setActive(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function onPointerOver(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const control = hintedControl(event.target);
      if (control) showControlHint(control);
    }

    function onPointerOut(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const control = hintedControl(event.target);
      if (!control) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && control.contains(next)) return;
      if (suppressedControlRef.current === control) suppressedControlRef.current = null;
      hideControlHint(control);
    }

    function onFocusIn(event: FocusEvent) {
      const control = hintedControl(event.target);
      if (control) showControlHint(control);
    }

    function onFocusOut(event: FocusEvent) {
      const control = hintedControl(event.target);
      if (!control) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && control.contains(next)) return;
      hideControlHint(control);
    }

    function onPointerDown(event: PointerEvent) {
      const control = hintedControl(event.target);
      if (!control) return;
      suppressedControlRef.current = control;
      activeControlRef.current = null;
      setActive((current) => current?.mode === "control" ? null : current);
    }

    function onClick(event: MouseEvent) {
      const trigger = infoTrigger(event.target);
      if (!trigger) return;
      const scope = trigger.dataset.guideHintTrigger;
      if (!scope) return;
      const keys = guidePanelHintKeys(scope);
      if (keys.length === 0) return;
      activeControlRef.current = null;
      setActive((current) => (
        current?.mode === "info" && current.triggerScope === scope
          ? null
          : { keys, rect: trigger.getBoundingClientRect(), mode: "info", triggerScope: scope }
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
  }, [enabled, hideControlHint, showControlHint]);

  useEffect(() => {
    if (!active) return;
    const triggerScope = active.triggerScope;

    function refreshPosition() {
      if (activeControlRef.current?.isConnected) {
        setActive((current) => current ? { ...current, rect: activeControlRef.current!.getBoundingClientRect() } : null);
        return;
      }

      if (triggerScope) {
        const trigger = document.querySelector<HTMLElement>(`[data-guide-hint-trigger="${triggerScope}"]`);
        if (trigger) {
          setActive((current) => current ? { ...current, rect: trigger.getBoundingClientRect() } : null);
          return;
        }
      }

      setActive(null);
    }

    window.addEventListener("resize", refreshPosition);
    window.addEventListener("scroll", refreshPosition, true);
    return () => {
      window.removeEventListener("resize", refreshPosition);
      window.removeEventListener("scroll", refreshPosition, true);
    };
  }, [active?.triggerScope, active?.keys.join("|")]);

  const content = useMemo(
    () => active ? active.keys.map((key) => ({ key, ...anyGuideHintCopy(key, language, activeRole) })) : [],
    [active, activeRole, language],
  );

  if (!enabled || !active || content.length === 0) return null;

  const mobile = active.mode === "info"
    && typeof window !== "undefined"
    && window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const width = Math.min(active.mode === "info" ? 430 : 360, Math.max(260, typeof window === "undefined" ? 360 : window.innerWidth - 24));
  const left = mobile
    ? 12
    : Math.max(12, Math.min(active.rect.left, window.innerWidth - width - 12));
  const below = active.rect.bottom + 8;
  const expectedHeight = active.mode === "info" ? 360 : 165;
  const top = mobile
    ? undefined
    : (below + expectedHeight <= window.innerHeight ? below : Math.max(12, active.rect.top - expectedHeight));

  return (
    <aside
      className={`guide-hint-popover${mobile ? " guide-hint-mobile" : ""}${active.mode === "info" ? " guide-hint-summary" : ""}`}
      role="tooltip"
      style={mobile ? undefined : { left, top, width }}
      data-guide-hint-key={active.keys.join("|")}
    >
      {content.map((item) => (
        <div className="guide-hint-item" key={item.key}>
          <strong>{item.title}</strong>
          <p>{item.copy}</p>
          {item.roleCopy && <p className="guide-hint-role">{item.roleCopy}</p>}
        </div>
      ))}
    </aside>
  );
}
