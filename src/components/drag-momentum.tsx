"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Wraps a dragged ghost so it feels physical: it trails the cursor with a soft delay,
 * sways with horizontal velocity (±6deg), and lifts in smoothly instead of popping.
 * The parent positions the wrapper at the pointer; this only adds an eased offset.
 */
export function DragMomentum({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    let px: number | null = null;
    let py = 0;
    let sx = 0;
    let sy = 0;
    let lastX: number | null = null;
    let targetTilt = 0;
    let tilt = 0;
    let lift = 0;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (px === null) {
        sx = e.clientX;
        sy = e.clientY;
      }
      px = e.clientX;
      py = e.clientY;
      if (lastX !== null) targetTilt = Math.max(-6, Math.min(6, (e.clientX - lastX) * 0.28));
      lastX = e.clientX;
    };

    const tick = () => {
      // Trail: the ghost eases toward the pointer, so it lags a little and catches up.
      if (px !== null) {
        sx += (px - sx) * 0.24;
        sy += (py - sy) * 0.24;
      }
      const dx = px === null ? 0 : Math.max(-48, Math.min(48, sx - px));
      const dy = px === null ? 0 : Math.max(-48, Math.min(48, sy - py));
      tilt += (targetTilt - tilt) * 0.2;
      targetTilt *= 0.86;
      lift += (1 - lift) * 0.18;
      const el = ref.current;
      if (el) {
        el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${(0.97 + 0.05 * lift).toFixed(3)})`;
        el.style.opacity = String(Math.min(1, 0.4 + lift));
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
