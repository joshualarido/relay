"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

const OPTIONS = { lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, autoRaf: true } as const;

function isScrollablePane(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return false;
  const { overflowY } = getComputedStyle(el);
  return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
}

/**
 * Lenis-powered smooth wheel scrolling for the page, plus a dedicated Lenis
 * instance for each nested scroll pane (Projects list/board, calendar, etc.).
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = new Lenis({ ...OPTIONS, allowNestedScroll: true });
    const panes = new Map<HTMLElement, Lenis>();

    const attach = (e: Event) => {
      let node = e.target instanceof Element ? e.target : null;
      while (node && node !== document.body) {
        if (node instanceof HTMLElement && !panes.has(node) && !node.closest("[data-lenis-prevent]") && isScrollablePane(node)) {
          panes.set(node, new Lenis({ ...OPTIONS, wrapper: node, content: (node.firstElementChild as HTMLElement) ?? node, allowNestedScroll: true }));
        }
        node = node.parentElement;
      }
      // Drop instances for panes that left the DOM.
      for (const [el, lenis] of panes) if (!el.isConnected) { lenis.destroy(); panes.delete(el); }
    };

    document.addEventListener("pointerover", attach, { passive: true });
    return () => {
      document.removeEventListener("pointerover", attach);
      for (const lenis of panes.values()) lenis.destroy();
      root.destroy();
    };
  }, []);

  return null;
}
