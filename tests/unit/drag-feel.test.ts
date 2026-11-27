import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAG_MOUSE_DISTANCE_PX,
  DRAG_TOUCH_HOLD_MS,
  DRAG_TOUCH_TOLERANCE_PX,
  MOUSE_SENSOR_OPTIONS,
  TOUCH_DRAG_BODY_CLASS,
  TOUCH_SENSOR_OPTIONS,
  isTouchActivatorEvent,
  setTouchDragBodyLock,
  splitDragListeners,
  suppressPostDragClick,
  triggerDragHaptic,
} from "@/components/drag-feel";

describe("shared drag sensor configuration", () => {
  it("uses the agreed mouse distance and touch long-press thresholds", () => {
    expect(DRAG_MOUSE_DISTANCE_PX).toBe(6);
    expect(DRAG_TOUCH_HOLD_MS).toBe(250);
    expect(DRAG_TOUCH_TOLERANCE_PX).toBe(8);
    expect(MOUSE_SENSOR_OPTIONS).toEqual({ activationConstraint: { distance: 6 } });
    expect(TOUCH_SENSOR_OPTIONS).toEqual({ activationConstraint: { delay: 250, tolerance: 8 } });
  });

  it("splits dnd-kit listeners cleanly by input modality", () => {
    const onTouchStart = vi.fn();
    const onMouseDown = vi.fn();
    const onKeyDown = vi.fn();
    const split = splitDragListeners({ onTouchStart, onMouseDown, onKeyDown });

    expect(split.touchListeners).toEqual({ onTouchStart });
    expect(split.mouseListeners).toEqual({ onMouseDown });
    expect(split.keyboardListeners).toEqual({ onKeyDown });
    expect(split.pointerListeners).toEqual({ onMouseDown, onTouchStart });
    expect(splitDragListeners(undefined)).toEqual({
      touchListeners: {},
      mouseListeners: {},
      keyboardListeners: {},
      pointerListeners: {},
    });
  });

  it("identifies touch activator events without relying on browser-only globals", () => {
    expect(isTouchActivatorEvent({ type: "touchstart" } as Event)).toBe(true);
    expect(isTouchActivatorEvent({ type: "pointerdown", pointerType: "touch" } as unknown as Event)).toBe(true);
    expect(isTouchActivatorEvent({ type: "mousedown" } as Event)).toBe(false);
    expect(isTouchActivatorEvent({ type: "pointerdown", pointerType: "mouse" } as unknown as Event)).toBe(false);
    expect(isTouchActivatorEvent({ type: "keydown" } as Event)).toBe(false);
    expect(isTouchActivatorEvent(null)).toBe(false);
    expect(isTouchActivatorEvent(undefined)).toBe(false);
  });
});

describe("touch drag feedback helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("triggers navigator.vibrate safely when supported and ignores errors", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    triggerDragHaptic();
    expect(vibrate).toHaveBeenCalledWith(10);

    vibrate.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => triggerDragHaptic(15)).not.toThrow();

    vi.stubGlobal("navigator", {});
    expect(() => triggerDragHaptic()).not.toThrow();
  });

  it("toggles the touch drag lock class on document.body", () => {
    const classes = new Set<string>();
    vi.stubGlobal("document", {
      body: {
        classList: {
          toggle: (name: string, force?: boolean) => {
            if (force) classes.add(name);
            else classes.delete(name);
          },
        },
      },
    });

    setTouchDragBodyLock(true);
    expect(classes.has(TOUCH_DRAG_BODY_CLASS)).toBe(true);

    setTouchDragBodyLock(false);
    expect(classes.has(TOUCH_DRAG_BODY_CLASS)).toBe(false);
  });

  it("suppresses only the synthetic click on the dragged origin and expires after duration", () => {
    vi.useFakeTimers();

    class FakeNode {}
    class FakeElement extends FakeNode {
      constructor(
        private readonly children: FakeNode[] = [],
        private readonly attrs: Record<string, string> = {},
      ) {
        super();
      }
      contains(target: FakeNode) {
        return target === this || this.children.includes(target);
      }
      getAttribute(name: string) {
        return this.attrs[name] ?? null;
      }
      querySelector() {
        return null;
      }
      closest() {
        return null;
      }
    }

    const link = new FakeElement();
    const row = new FakeElement([link], { "data-task-row": "task-1" });
    const otherButton = new FakeElement();

    const listeners: Array<(e: MouseEvent) => void> = [];
    vi.stubGlobal("Node", FakeNode);
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("window", {
      addEventListener: (_type: string, fn: (e: MouseEvent) => void) => listeners.push(fn),
      removeEventListener: (_type: string, fn: (e: MouseEvent) => void) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    });

    suppressPostDragClick(row as unknown as Element, 350);
    expect(listeners).toHaveLength(1);

    // Click on an unrelated button passes through untouched.
    const otherEvent = {
      target: otherButton,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    listeners[0](otherEvent as unknown as MouseEvent);
    expect(otherEvent.preventDefault).not.toHaveBeenCalled();
    expect(otherEvent.stopPropagation).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(1);

    // Synthetic click on the dragged row's link is prevented and cleans up the listener.
    const linkEvent = {
      target: link,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    listeners[0](linkEvent as unknown as MouseEvent);
    expect(linkEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(linkEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);

    // Timer expiration cleans up when no synthetic click fires.
    suppressPostDragClick(row as unknown as Element, 350);
    expect(listeners).toHaveLength(1);
    vi.advanceTimersByTime(350);
    expect(listeners).toHaveLength(0);
  });
});
