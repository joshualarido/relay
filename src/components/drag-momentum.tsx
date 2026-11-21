"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Wraps a dragged overlay/ghost element to give it subtle, tactile inertia sway
 * based on horizontal pointer velocity (clamped to ±6 deg).
 */
export function DragMomentum({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    let lastX: number | null = null;
    let targetTilt = 0;
    let currentTilt = 0;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (lastX !== null) {
        const dx = e.clientX - lastX;
        targetTilt = Math.max(-6, Math.min(6, dx * 0.28));
      }
      lastX = e.clientX;
    };

    const tick = () => {
      currentTilt += (targetTilt - currentTilt) * 0.22;
      targetTilt *= 0.84;
      if (ref.current) {
        ref.current.style.transform = `rotate(${currentTilt.toFixed(2)}deg) scale(1.02)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
