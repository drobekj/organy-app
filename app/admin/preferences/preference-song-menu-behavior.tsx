"use client";

import { useEffect } from "react";

export function PreferenceSongMenuBehavior({ menuId }: { menuId: string }) {
  useEffect(() => {
    const menu = document.getElementById(menuId);
    if (!(menu instanceof HTMLDetailsElement)) return;

    const trigger = menu.querySelector("summary");

    function closeMenu() {
      if (!menu.open) return;
      menu.open = false;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menu.open) return;
      const target = event.target;
      if (target instanceof Node && !menu.contains(target)) closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !menu.open) return;
      event.preventDefault();
      closeMenu();
      if (trigger instanceof HTMLElement) trigger.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuId]);

  return null;
}
