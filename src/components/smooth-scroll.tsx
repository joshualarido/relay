"use client";

import { useEffect } from "react";

/**
 * Inertial mouse-wheel smooth scrolling (Lenis-style exponential lerp).
 * Respects prefers-reduced-motion and yields to nested scrollable containers.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let targetY = window.scrollY;
    let currentY = window.scrollY;
    let raf = 0;
    let running = false;

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const hasScrollableParent = (el: Element | null, deltaY: number): boolean => {
      let node: Element | null = el;
      while (node && node !== document.body && node !== document.documentElement) {
        const style = getComputedStyle(node);
        const overflowY = style.overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          const canScrollDown = deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1;
          const canScrollUp = deltaY < 0 && node.scrollTop > 1;
          if (canScrollDown || canScrollUp) return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const tick = () => {
      const diff = targetY - currentY;
      if (Math.abs(diff) < 0.5) {
        currentY = targetY;
        window.scrollTo(0, currentY);
        running = false;
        return;
      }
      currentY += diff * 0.12;
      window.scrollTo(0, currentY);
      raf = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.deltaY === 0) return;
      if (hasScrollableParent(e.target as Element | null, e.deltaY)) return;
      const limit = maxScroll();
      if (limit <= 0) return;

      e.preventDefault();
      if (!running) {
        currentY = window.scrollY;
        targetY = currentY;
      }
      const delta = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      targetY = Math.max(0, Math.min(limit, targetY + delta));
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onScroll = () => {
      if (!running) {
        currentY = window.scrollY;
        targetY = currentY;
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
