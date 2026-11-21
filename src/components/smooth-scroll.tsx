"use client";

import { useEffect } from "react";

type ScrollState = {
  target: number;
  current: number;
  raf: number;
  running: boolean;
};

/**
 * Inertial mouse-wheel smooth scrolling (Lenis-style exponential lerp)
 * for both the main window and nested scrollable panes (e.g. Projects list & board).
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const states = new WeakMap<EventTarget, ScrollState>();

    const getState = (target: EventTarget, currentPos: number): ScrollState => {
      let s = states.get(target);
      if (!s) {
        s = { target: currentPos, current: currentPos, raf: 0, running: false };
        states.set(target, s);
      }
      return s;
    };

    const findScrollTarget = (el: Element | null, deltaY: number): HTMLElement | null => {
      let node: Element | null = el;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node instanceof HTMLElement) {
          const style = getComputedStyle(node);
          const overflowY = style.overflowY;
          if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
            const canDown = deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1;
            const canUp = deltaY < 0 && node.scrollTop > 1;
            if (canDown || canUp) return node;
          }
        }
        node = node.parentElement;
      }
      return null;
    };

    const animate = (container: HTMLElement | Window, state: ScrollState) => {
      const diff = state.target - state.current;
      if (Math.abs(diff) < 0.5) {
        state.current = state.target;
        if (container === window) window.scrollTo(0, state.current);
        else (container as HTMLElement).scrollTop = state.current;
        state.running = false;
        return;
      }
      state.current += diff * 0.13;
      if (container === window) window.scrollTo(0, state.current);
      else (container as HTMLElement).scrollTop = state.current;
      state.raf = requestAnimationFrame(() => animate(container, state));
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.deltaY === 0) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      const nested = findScrollTarget(e.target as Element | null, delta);

      if (nested) {
        const limit = Math.max(0, nested.scrollHeight - nested.clientHeight);
        if (limit <= 0) return;
        e.preventDefault();
        const state = getState(nested, nested.scrollTop);
        if (!state.running) {
          state.current = nested.scrollTop;
          state.target = nested.scrollTop;
        }
        state.target = Math.max(0, Math.min(limit, state.target + delta));
        if (!state.running) {
          state.running = true;
          state.raf = requestAnimationFrame(() => animate(nested, state));
        }
        return;
      }

      const limit = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (limit <= 0) return;
      e.preventDefault();
      const state = getState(window, window.scrollY);
      if (!state.running) {
        state.current = window.scrollY;
        state.target = window.scrollY;
      }
      state.target = Math.max(0, Math.min(limit, state.target + delta));
      if (!state.running) {
        state.running = true;
        state.raf = requestAnimationFrame(() => animate(window, state));
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  return null;
}
