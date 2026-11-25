"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import { CalendarOff } from "lucide-react";
import { DragMomentum } from "./drag-momentum";
import { DRAG_EASE } from "./drag-feel";

type Kind = "project" | "task" | "event";

export type CardDrop = {
  kind: Kind;
  id: string;
  fromDate: string;
  toDate: string;
  /** For tasks: the target day's open tasks in their new order (source included). */
  orderedTaskIds: string[] | null;
  occurrenceDate?: string | null;
};

export type CardUnschedule = {
  kind: Kind;
  id: string;
  fromDate: string;
  occurrenceDate?: string | null;
};

type Ghost = {
  title: string;
  tag: string;
  color: string;
  width: number;
  x: number;
  y: number;
  landing: boolean;
  unscheduling: boolean;
  touchPicked: boolean;
};

type GhostStore = {
  get: () => Ghost | null;
  set: (next: Ghost | null | ((g: Ghost | null) => Ghost | null)) => void;
  subscribe: (listener: () => void) => () => void;
};

/** The ghost lives outside React state of the calendar so moving it never re-renders FullCalendar. */
function createGhostStore(): GhostStore {
  let value: Ghost | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === "function" ? next(value) : next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function GhostLayer({
  store,
  zoneRef,
  showUnscheduleZone,
}: {
  store: GhostStore;
  zoneRef: RefObject<HTMLDivElement | null>;
  showUnscheduleZone: boolean;
}) {
  const ghost = useSyncExternalStore(store.subscribe, store.get, () => null);
  if (!ghost) return null;
  return (
    <>
      {showUnscheduleZone && !ghost.landing && (
        <div
          ref={zoneRef}
          className="calendar-unschedule-zone"
          data-unschedule-zone="true"
          data-active={ghost.unscheduling ? "true" : undefined}
          role="region"
          aria-label="Drop here to unschedule"
        >
          <CalendarOff size={16} aria-hidden="true" />
          <span>{ghost.unscheduling ? "Release to unschedule" : "Drop here to unschedule"}</span>
        </div>
      )}
      <div
        className={`calendar-drag-ghost-wrap${ghost.landing ? " is-landing" : ""}${ghost.unscheduling ? " is-unscheduling" : ""}${ghost.touchPicked ? " is-touch-picked" : ""}`}
        data-drag-ghost="true"
        data-touch-picked={ghost.touchPicked ? "true" : undefined}
        style={{ left: `${ghost.x}px`, top: `${ghost.y}px`, width: `${ghost.width}px` }}
        aria-hidden="true"
      >
        <DragMomentum>
          <div className="calendar-drag-ghost" style={{ "--record-color": ghost.color } as React.CSSProperties}>
            <span className="calendar-drag-ghost-title">{ghost.title}</span>
            {ghost.tag && <span className="calendar-drag-ghost-tag">{ghost.tag}</span>}
          </div>
        </DragMomentum>
      </div>
    </>
  );
}

type Base = { el: HTMLElement; top: number; left: number; width: number; height: number };

const SHIFT = `transform 260ms ${DRAG_EASE}`;
const TOUCH_HOLD_MS = 300;
const TOUCH_MOVE_TOLERANCE = 8;
const TOUCH_LIFT_OFFSET = 16;

/** Read the card's identity and its date from the data-* attributes on `.calendar-record`. */
function cardInfo(el: HTMLElement) {
  const [kind, id] = (el.dataset.calendarRecord ?? "").split(":") as [Kind, string];
  return {
    kind,
    id,
    date: el.dataset.date ?? "",
    open: el.dataset.open === "true",
    occurrenceDate: el.dataset.occurrenceDate ?? null,
  };
}

/**
 * Pointer dragging for calendar cards in Agenda, Week and Month. Tasks can be placed at any
 * position in any day (reordering the day's queue); events and deadlines move between days.
 * Dragging onto the unschedule drop zone clears the item's date. Neighbours ease aside to make
 * room, the card's own slot becomes a faded silhouette that glides to where it will land, and a
 * trailing ghost follows the cursor with momentum.
 */
export function useCalendarCardDrag({
  frameRef,
  view,
  disabled,
  onDrop,
  onUnschedule,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  view: "Agenda" | "Week" | "Month";
  disabled: boolean;
  onDrop: (drop: CardDrop) => void;
  onUnschedule?: (card: CardUnschedule) => void;
}) {
  const reduce = useReducedMotion();
  const [store] = useState(createGhostStore);
  const setGhost = store.set;
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return;
      suppressClick.current = false;
      const isTouch = e.pointerType === "touch";
      const pointerId = e.pointerId;
      const card = (e.target as HTMLElement).closest<HTMLElement>('.calendar-record[data-drag="true"]');
      const frame = frameRef.current;
      if (!card || !frame) return;
      const source = cardInfo(card);
      if (!source.kind || !source.id || !source.date) return;
      // Keep FullCalendar's own drag (and its snapping mirror) out of it; resize handles sit outside the card.
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      let lastX = startX;
      let lastY = startY;
      let started = false;
      let bases: Base[] = [];
      let src: Base | null = null;
      let target: { date: string; index: number; slot: { top: number; left: number } } | null = null;
      let overUnschedule = false;
      let holdTimer: number | null = null;
      const grab = { x: 0, y: 0 };
      const liftY = isTouch ? TOUCH_LIFT_OFFSET : 0;

      const clearHoldTimer = () => {
        if (holdTimer !== null) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
        card.classList.remove("is-touch-holding");
      };

      const isOverUnscheduleZone = (x: number, y: number) => {
        if (!onUnschedule) return false;
        const zone = zoneRef.current;
        if (!zone) return false;
        const r = zone.getBoundingClientRect();
        const pad = 10;
        return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
      };

      const page = () => ({ sx: window.scrollX, sy: window.scrollY });
      const measure = () => {
        const { sx, sy } = page();
        // FullCalendar keeps hidden measuring copies of cards; only lay out what is visible.
        const visible = (el: HTMLElement) =>
          el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0;
        bases = Array.from(frame.querySelectorAll<HTMLElement>(".calendar-record[data-date]")).filter(visible).map((el) => {
          const r = el.getBoundingClientRect();
          return { el, top: r.top + sy, left: r.left + sx, width: r.width, height: r.height };
        });
        src = bases.find((b) => b.el === card) ?? null;
      };
      const touched = new Set<HTMLElement>();
      const setShift = (el: HTMLElement, x: number, y: number) => {
        touched.add(el);
        el.style.transition = reduce ? "none" : SHIFT;
        el.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : "";
      };
      const resetShifts = () => {
        for (const el of touched) {
          el.style.transition = "none";
          el.style.transform = "";
          el.classList.remove("is-drag-source");
        }
        touched.clear();
      };

      /** Open-task cards for a date (source excluded), in on-screen order. */
      const tasksOn = (date: string) =>
        bases
          .filter((b) => b.el !== card && cardInfo(b.el).kind === "task" && cardInfo(b.el).open && cardInfo(b.el).date === date)
          .sort((a, b) => a.top - b.top);

      const dayCellAt = (x: number, y: number) => {
        for (const cell of frame.querySelectorAll<HTMLElement>(".calendar-day-cell[data-date]")) {
          const r = cell.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return cell;
        }
        return null;
      };

      const findTarget = (x: number, y: number) => {
        if (!src) return null;
        const { sx, sy } = page();
        const py = y + sy;
        let date: string | null = null;
        let cell: HTMLElement | null = null;
        if (view === "Agenda") {
          // Rows form one vertical list: the nearest row decides the day.
          let best: Base | null = null;
          for (const b of bases) {
            const d = Math.abs(b.top + b.height / 2 - py);
            if (!best || d < Math.abs(best.top + best.height / 2 - py)) best = b;
          }
          date = best ? cardInfo(best.el).date : null;
        } else {
          cell = dayCellAt(x, y);
          date = cell?.dataset.date ?? null;
        }
        if (!date) return null;

        const srcDate = source.date;
        const gapOf = (list: Base[]) => (list.length > 1 ? list[1].top - list[0].top : src!.height + 4);
        const srcDay = tasksOn(srcDate).concat(source.kind === "task" && source.open ? [src] : []).sort((a, b) => a.top - b.top);
        const gap = gapOf(srcDay.length > 1 ? srcDay : tasksOn(date));
        const closed = (b: Base) => b.top - (cardInfo(b.el).date === srcDate && b.top > src!.top && source.kind === "task" && source.open ? gap : 0);

        const others = tasksOn(date);
        const reorder = source.kind === "task" && source.open;
        const index = reorder ? others.filter((b) => closed(b) + b.height / 2 < py).length : others.length;

        let top: number;
        if (reorder && index < others.length) top = closed(others[index]);
        else if (reorder && others.length) top = closed(others[others.length - 1]) + gap;
        else {
          const sameDay = bases.filter((b) => b.el !== card && cardInfo(b.el).date === date);
          if (sameDay.length) top = Math.max(...sameDay.map((b) => closed(b) + b.height)) + 4;
          else if (date === srcDate) top = src.top;
          else top = (cell ? cell.getBoundingClientRect().top + sy : src.top) + (view === "Month" ? 28 : 6);
        }
        const srcCell = card.closest<HTMLElement>(".calendar-day-cell");
        const left =
          view === "Agenda" || !cell
            ? src.left
            : cell.getBoundingClientRect().left + sx + (srcCell ? src.left - (srcCell.getBoundingClientRect().left + sx) : 2);
        return { date, index, slot: { top, left } };
      };

      const applyLayout = () => {
        if (!src || !target) return;
        const srcDate = source.date;
        const reorder = source.kind === "task" && source.open;
        const srcDay = tasksOn(srcDate).concat(reorder ? [src] : []).sort((a, b) => a.top - b.top);
        const gap = srcDay.length > 1 ? srcDay[1].top - srcDay[0].top : src.height + 4;
        const others = reorder ? tasksOn(target.date) : [];
        for (const b of bases) {
          if (b.el === card) continue;
          const info = cardInfo(b.el);
          let dy = 0;
          if (reorder && info.kind === "task" && info.open && info.date === srcDate && b.top > src.top) dy -= gap;
          if (reorder && info.kind === "task" && info.open && info.date === target.date && others.indexOf(b) >= target.index) dy += gap;
          if (dy || touched.has(b.el)) setShift(b.el, 0, dy);
        }
        setShift(card, target.slot.left - src.left, target.slot.top - src.top);
      };

      const startDrag = (clientX: number, clientY: number) => {
        if (started) return;
        started = true;
        clearHoldTimer();
        measure();
        if (!src) return;
        const r = card.getBoundingClientRect();
        grab.x = startX - r.left;
        grab.y = startY - r.top;
        card.classList.add("is-drag-source");
        touched.add(card);
        document.body.classList.add("is-card-dragging");
        if (isTouch) {
          document.body.classList.add("is-touch-card-dragging");
          try {
            navigator.vibrate?.(10);
          } catch {
            // Haptics are optional and unavailable in some browsers.
          }
        }
        const ghostWidth = Math.min(window.innerWidth - 32, Math.max(isTouch ? 160 : 0, Math.min(320, r.width)));
        const ghostX = isTouch
          ? Math.max(16, Math.min(window.innerWidth - ghostWidth - 16, clientX - ghostWidth / 2))
          : clientX - grab.x;
        setGhost({
          title: card.querySelector(".calendar-record-title")?.textContent ?? "",
          tag: card.querySelector(".calendar-record-tag")?.textContent ?? "",
          color: card.style.getPropertyValue("--record-color"),
          width: ghostWidth,
          x: ghostX,
          y: clientY - grab.y - liftY,
          landing: false,
          unscheduling: false,
          touchPicked: isTouch,
        });
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (!started) {
          const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
          if (isTouch) {
            if (dist >= TOUCH_MOVE_TOLERANCE) finish(false);
            return;
          }
          if (dist < 6) return;
          startDrag(ev.clientX, ev.clientY);
          if (!src) return;
        }
        const nextUnschedule = isOverUnscheduleZone(ev.clientX, ev.clientY);
        setGhost((g) => {
          if (!g) return g;
          const x = isTouch
            ? Math.max(16, Math.min(window.innerWidth - g.width - 16, ev.clientX - g.width / 2))
            : ev.clientX - grab.x;
          return { ...g, x, y: ev.clientY - grab.y - liftY, unscheduling: nextUnschedule };
        });
        if (nextUnschedule) {
          if (!overUnschedule) {
            overUnschedule = true;
            target = null;
            for (const el of touched) {
              setShift(el, 0, 0);
            }
          }
          return;
        }
        overUnschedule = false;
        const next = findTarget(ev.clientX, ev.clientY);
        if (next && (next.date !== target?.date || next.index !== target?.index)) {
          target = next;
          applyLayout();
        }
      };

      const onTouchMove = (ev: TouchEvent) => {
        if (!started) {
          if (ev.touches.length > 1) {
            finish(false);
            return;
          }
          const t = ev.touches[0];
          if (t && Math.hypot(t.clientX - startX, t.clientY - startY) >= TOUCH_MOVE_TOLERANCE) {
            finish(false);
          }
          return;
        }
        if (ev.cancelable) ev.preventDefault();
      };

      const onContextMenu = (ev: MouseEvent) => {
        ev.preventDefault();
      };

      const finish = (commit: boolean) => {
        clearHoldTimer();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        if (isTouch) {
          window.removeEventListener("touchmove", onTouchMove);
          window.removeEventListener("contextmenu", onContextMenu, true);
        }
        cleanup.current = null;
        if (!started || !src) return;
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), isTouch ? 350 : 0);
        document.body.classList.remove("is-card-dragging", "is-touch-card-dragging");

        if (commit && overUnschedule && onUnschedule) {
          resetShifts();
          setGhost((g) => (g ? { ...g, landing: true, unscheduling: true } : g));
          window.setTimeout(
            () => {
              onUnschedule({
                kind: source.kind,
                id: source.id,
                fromDate: source.date,
                occurrenceDate: source.occurrenceDate,
              });
              setGhost(null);
            },
            reduce ? 0 : 180,
          );
          return;
        }

        const srcOrder = tasksOn(source.date).concat([src]).sort((a, b) => a.top - b.top);
        const unchanged =
          !target ||
          (target.date === source.date &&
            (!(source.kind === "task" && source.open) || srcOrder.indexOf(src) === target.index));
        const drop = commit && target && !unchanged ? target : null;
        const { sx, sy } = page();
        const land = drop ? drop.slot : { top: src.top, left: src.left };
        setGhost((g) => (g ? { ...g, x: land.left - sx, y: land.top - sy, landing: true, unscheduling: false } : g));
        if (!drop) resetShifts();
        window.setTimeout(
          () => {
            if (drop) {
              const ordered =
                source.kind === "task" && source.open
                  ? (() => {
                      const ids = tasksOn(drop.date).map((b) => cardInfo(b.el).id);
                      ids.splice(drop.index, 0, source.id);
                      return ids;
                    })()
                  : null;
              onDrop({
                kind: source.kind,
                id: source.id,
                fromDate: source.date,
                toDate: drop.date,
                orderedTaskIds: ordered,
                occurrenceDate: source.occurrenceDate,
              });
              requestAnimationFrame(resetShifts);
            }
            setGhost(null);
          },
          reduce ? 0 : 240,
        );
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        finish(true);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        finish(false);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape" || !started) return;
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
      if (isTouch) {
        card.classList.add("is-touch-holding");
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("contextmenu", onContextMenu, true);
        holdTimer = window.setTimeout(() => {
          holdTimer = null;
          startDrag(lastX, lastY);
        }, TOUCH_HOLD_MS);
      }
      cleanup.current = () => finish(false);
    },
    [disabled, frameRef, onDrop, onUnschedule, reduce, setGhost, view],
  );

  /** FullCalendar starts its drag on mousedown/touchstart; stop those for cards we drag ourselves (never preventing default so scroll and taps still work). */
  const onMouseDownCapture = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.calendar-record[data-drag="true"]')) e.stopPropagation();
    },
    [disabled],
  );

  const onTouchStartCapture = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      if ((e.target as HTMLElement).closest('.calendar-record[data-drag="true"]')) e.stopPropagation();
    },
    [disabled],
  );

  /** Swallow the click that follows a drag so the card's link does not open. */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const ghostNode = <GhostLayer store={store} zoneRef={zoneRef} showUnscheduleZone={Boolean(onUnschedule)} />;

  return { onPointerDown, onMouseDownCapture, onTouchStartCapture, onClickCapture, ghostNode };
}
