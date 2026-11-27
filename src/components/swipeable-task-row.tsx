"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
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
 * Yields to long-press drags: once `dragHoldMs` elapses without crossing the horizontal
 * threshold, or once `isDragActive`/`disabled` becomes true, pointer moves are ignored
 * and any pointer capture is released.
 */
export function SwipeableTaskRow({
  disabled = false,
  isDragActive = false,
  dragHoldMs,
  canComplete = true,
  onComplete,
  onTomorrow,
  children,
  className,
  taskId,
}: {
  disabled?: boolean;
  isDragActive?: boolean;
  dragHoldMs?: number;
  canComplete?: boolean;
  onComplete?: () => void | Promise<void>;
  onTomorrow?: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  taskId?: string;
}) {
  const isDisabled = disabled || isDragActive;
  const reduce = useReducedMotion();
  const contentRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    locked: "none" | "horizontal" | "vertical";
    lastDx: number;
  } | null>(null);
  const suppressClickUntil = useRef(0);

  if (wasDisabled !== isDisabled) {
    setWasDisabled(isDisabled);
    if (isDisabled) {
      setSwiping(false);
      setOffsetX(0);
    }
  }

  function releaseCapture(pointerId: number) {
    const el = contentRef.current;
    if (!el) return;
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {}
  }

  useEffect(() => {
    if (!isDisabled) return;
    const g = gesture.current;
    if (g) {
      releaseCapture(g.pointerId);
      gesture.current = null;
    }
  }, [isDisabled]);

  function reset() {
    if (gesture.current) releaseCapture(gesture.current.pointerId);
    gesture.current = null;
    setSwiping(false);
    setOffsetX(0);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (isDisabled) return;
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      locked: "none",
      lastDx: 0,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (isDisabled) {
      reset();
      return;
    }
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.locked === "none") {
      if (dragHoldMs !== undefined && performance.now() - g.startTime >= dragHoldMs) {
        g.locked = "vertical";
        return;
      }
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

    if (!wasHorizontal || isDisabled) return;
    suppressClickUntil.current = Date.now() + 250;

    if (cancelled) return;
    if (dx >= SWIPE_THRESHOLD && canComplete && onComplete) {
      void onComplete();
    } else if (dx <= -SWIPE_THRESHOLD && onTomorrow) {
      void onTomorrow();
    }
  }

  const activeSwiping = isDisabled ? false : swiping;
  const activeOffsetX = isDisabled ? 0 : offsetX;

  return (
    <div
      className={cn("swipe-row", className)}
      data-swipe-row=""
      data-task-row={taskId}
      data-swiping={
        activeSwiping ? (activeOffsetX > 0 ? "right" : activeOffsetX < 0 ? "left" : undefined) : undefined
      }
    >
      {canComplete && onComplete && (
        <div
          className="swipe-underlay swipe-underlay-right"
          aria-hidden="true"
          data-ready={activeOffsetX >= SWIPE_THRESHOLD || undefined}
        >
          <Check size={16} />
          <span>Complete</span>
        </div>
      )}
      {onTomorrow && (
        <div
          className="swipe-underlay swipe-underlay-left"
          aria-hidden="true"
          data-ready={activeOffsetX <= -SWIPE_THRESHOLD || undefined}
        >
          <span>Tomorrow</span>
          <CalendarDays size={16} />
        </div>
      )}
      <div
        ref={contentRef}
        className="swipe-row-content"
        style={{
          transform: activeOffsetX ? `translate3d(${activeOffsetX}px, 0, 0)` : undefined,
          transition: activeSwiping || reduce ? "none" : "transform 180ms ease-out",
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
