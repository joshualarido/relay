"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { CalendarDays, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 68;
const MAX_OFFSET = 120;

/**
 * Touch swipe wrapper for task rows:
 * - Swipe right -> complete
 * - Swipe left -> push to tomorrow
 * Mouse drags are ignored so desktop dnd-kit drags and clicks stay undisturbed.
 */
export function SwipeableTaskRow({
  disabled = false,
  canComplete = true,
  onComplete,
  onTomorrow,
  children,
  className,
  taskId,
}: {
  disabled?: boolean;
  canComplete?: boolean;
  onComplete?: () => void | Promise<void>;
  onTomorrow?: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  taskId?: string;
}) {
  const reduce = useReducedMotion();
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    locked: "none" | "horizontal" | "vertical";
    lastDx: number;
  } | null>(null);
  const suppressClickUntil = useRef(0);

  function reset() {
    gesture.current = null;
    setSwiping(false);
    setOffsetX(0);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      locked: "none",
      lastDx: 0,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId || disabled) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.locked === "none") {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        g.locked = "vertical";
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if ((dx > 0 && (!canComplete || !onComplete)) || (dx < 0 && !onTomorrow)) {
          g.locked = "vertical";
          return;
        }
        g.locked = "horizontal";
        setSwiping(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      } else {
        return;
      }
    }

    if (g.locked !== "horizontal") return;
    let clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx));
    if (clamped > 0 && (!canComplete || !onComplete)) clamped = 0;
    if (clamped < 0 && !onTomorrow) clamped = 0;
    g.lastDx = clamped;
    setOffsetX(clamped);
  }

  function finish(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const wasHorizontal = g.locked === "horizontal";
    const dx = g.lastDx;
    reset();

    if (!wasHorizontal) return;
    suppressClickUntil.current = Date.now() + 250;

    if (cancelled || disabled) return;
    if (dx >= SWIPE_THRESHOLD && canComplete && onComplete) {
      void onComplete();
    } else if (dx <= -SWIPE_THRESHOLD && onTomorrow) {
      void onTomorrow();
    }
  }

  return (
    <div
      className={cn("swipe-row", className)}
      data-swipe-row=""
      data-task-row={taskId}
      data-swiping={swiping ? (offsetX > 0 ? "right" : offsetX < 0 ? "left" : undefined) : undefined}
    >
      {canComplete && onComplete && (
        <div
          className="swipe-underlay swipe-underlay-right"
          aria-hidden="true"
          data-ready={offsetX >= SWIPE_THRESHOLD || undefined}
        >
          <Check size={16} />
          <span>Complete</span>
        </div>
      )}
      {onTomorrow && (
        <div
          className="swipe-underlay swipe-underlay-left"
          aria-hidden="true"
          data-ready={offsetX <= -SWIPE_THRESHOLD || undefined}
        >
          <span>Tomorrow</span>
          <CalendarDays size={16} />
        </div>
      )}
      <div
        className="swipe-row-content"
        style={{
          transform: offsetX ? `translate3d(${offsetX}px, 0, 0)` : undefined,
          transition: swiping || reduce ? "none" : "transform 180ms ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClickCapture={(e) => {
          if (Date.now() < suppressClickUntil.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
