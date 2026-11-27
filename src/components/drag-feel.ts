import type { MouseEventHandler, KeyboardEventHandler, TouchEventHandler } from "react";
import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";

/** One easing for every drag in the app: items glide aside and settle, never snap. */
export const DRAG_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Shared mouse drag activation distance so clicks stay crisp on desktop. */
export const DRAG_MOUSE_DISTANCE_PX = 6;

/** Shared touch long-press delay and finger jitter tolerance across Today and Projects. */
export const DRAG_TOUCH_HOLD_MS = 250;
export const DRAG_TOUCH_TOLERANCE_PX = 8;

/** Shared dnd-kit sensor activation constraints for Today and Projects. */
export const MOUSE_SENSOR_OPTIONS = {
  activationConstraint: { distance: DRAG_MOUSE_DISTANCE_PX },
} as const;

export const TOUCH_SENSOR_OPTIONS = {
  activationConstraint: { delay: DRAG_TOUCH_HOLD_MS, tolerance: DRAG_TOUCH_TOLERANCE_PX },
} as const;

export const TOUCH_DRAG_BODY_CLASS = "is-touch-card-dragging";
export const POST_DRAG_CLICK_SUPPRESS_TOUCH_MS = 350;
export const POST_DRAG_CLICK_SUPPRESS_MOUSE_MS = 50;

/** Sortable neighbours ease out of the way while you drag. */
export const SORT_TRANSITION = { duration: 260, easing: DRAG_EASE };

/** The ghost glides into its slot on drop while the silhouette fades back in. */
export const DROP_ANIMATION: DropAnimation = {
  duration: 240,
  easing: DRAG_EASE,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "1" } } }),
};

/** Keep the silhouette's opacity easing alongside dnd-kit's inline transform transition. */
export function withFade(transition: string | undefined): string {
  const fade = `background-color 220ms ${DRAG_EASE}, border-color 220ms ${DRAG_EASE}`;
  return transition ? `${transition}, ${fade}` : fade;
}

/**
 * Split dnd-kit's synthetic listener map by input modality so whole rows can accept
 * touch long-press (or mouse + touch on board cards) while keyboard and grip controls
 * stay on their dedicated button.
 */
export function splitDragListeners(listeners: Record<string, unknown> | undefined): {
  touchListeners: { onTouchStart?: TouchEventHandler };
  mouseListeners: { onMouseDown?: MouseEventHandler };
  keyboardListeners: { onKeyDown?: KeyboardEventHandler };
  pointerListeners: { onMouseDown?: MouseEventHandler; onTouchStart?: TouchEventHandler };
} {
  const onTouchStart = listeners?.onTouchStart as TouchEventHandler | undefined;
  const onMouseDown = listeners?.onMouseDown as MouseEventHandler | undefined;
  const onKeyDown = listeners?.onKeyDown as KeyboardEventHandler | undefined;
  return {
    touchListeners: onTouchStart ? { onTouchStart } : {},
    mouseListeners: onMouseDown ? { onMouseDown } : {},
    keyboardListeners: onKeyDown ? { onKeyDown } : {},
    pointerListeners: {
      ...(onMouseDown ? { onMouseDown } : {}),
      ...(onTouchStart ? { onTouchStart } : {}),
    },
  };
}

/** True when a dnd-kit drag was initiated by a touch gesture. */
export function isTouchActivatorEvent(event: Event | null | undefined): boolean {
  if (!event) return false;
  if (event.type.startsWith("touch")) return true;
  if ("pointerType" in event && (event as { pointerType?: unknown }).pointerType === "touch") return true;
  return false;
}

/** Subtle haptic tick when a touch hold registers, where supported. */
export function triggerDragHaptic(durationMs = 10): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // Haptics are optional and unavailable in some browsers.
  }
}

/** Lock body touch-action while a touch drag is active so the page does not scroll. */
export function setTouchDragBodyLock(active: boolean): void {
  if (typeof document === "undefined" || !document.body) return;
  document.body.classList.toggle(TOUCH_DRAG_BODY_CLASS, active);
}

/** Resolve the draggable row or card container from a dnd-kit activator event. */
export function resolveDragOriginElement(event: Event | null | undefined): Element | null {
  const rawTarget = event?.target ?? null;
  if (!rawTarget || typeof Node === "undefined") return null;
  const el =
    typeof Element !== "undefined" && rawTarget instanceof Element
      ? rawTarget
      : rawTarget instanceof Node
        ? rawTarget.parentElement
        : null;
  if (!el) return null;
  return el.closest("[data-task-row], [data-task-card], .project-row") ?? el;
}

function originMatchSelector(origin: Element): string | null {
  const taskCard = origin.getAttribute("data-task-card");
  if (taskCard) return `[data-task-card="${CSS.escape(taskCard)}"]`;
  const taskRow = origin.getAttribute("data-task-row");
  if (taskRow) return `[data-task-row="${CSS.escape(taskRow)}"]`;
  const projectRow =
    origin.getAttribute("data-project-row") ??
    origin.querySelector("[data-project-row]")?.getAttribute("data-project-row");
  if (projectRow) return `[data-project-row="${CSS.escape(projectRow)}"]`;
  return null;
}

/**
 * Prevent a synthetic click / Link navigation that fires on the dragged item right after
 * a drop. Runs in the window capture phase so it precedes dnd-kit's document capture
 * listener (which only stops propagation and does not call preventDefault).
 */
export function suppressPostDragClick(origin: Element | null, durationMs: number): () => void {
  if (typeof window === "undefined" || !origin || durationMs <= 0) return () => {};
  const selector = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? originMatchSelector(origin) : null;
  let cleaned = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("click", onClickCapture, true);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const onClickCapture = (e: MouseEvent) => {
    const target = e.target;
    const matchesNode = target instanceof Node && origin.contains(target);
    const matchesSelector = Boolean(selector && target instanceof Element && target.closest(selector));
    if (!matchesNode && !matchesSelector) return;
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  };

  window.addEventListener("click", onClickCapture, true);
  timer = setTimeout(cleanup, durationMs);
  return cleanup;
}
