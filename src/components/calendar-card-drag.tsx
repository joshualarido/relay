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
        className={`calendar-drag-ghost-wrap${ghost.landing ? " is-landing" : ""}${ghost.unscheduling ? " is-unscheduling" : ""}`}
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
      if (disabled || e.button !== 0 || e.pointerType === "touch") return;
      const card = (e.target as HTMLElement).closest<HTMLElement>('.calendar-record[data-drag="true"]');
      const frame = frameRef.current;
      if (!card || !frame) return;
      const source = cardInfo(card);
      if (!source.kind || !source.id || !source.date) return;
      // Keep FullCalendar's own drag (and its snapping mirror) out of it; resize handles sit outside the card.
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;
      let bases: Base[] = [];
      let src: Base | null = null;
      let target: { date: string; index: number; slot: { top: number; left: number } } | null = null;
      let overUnschedule = false;
      const grab = { x: 0, y: 0 };

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

      const onMove = (ev: PointerEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          started = true;
          measure();
          if (!src) return;
          const r = card.getBoundingClientRect();
          grab.x = startX - r.left;
          grab.y = startY - r.top;
          card.classList.add("is-drag-source");
          touched.add(card);
          document.body.classList.add("is-card-dragging");
          setGhost({
            title: card.querySelector(".calendar-record-title")?.textContent ?? "",
            tag: card.querySelector(".calendar-record-tag")?.textContent ?? "",
            color: card.style.getPropertyValue("--record-color"),
            width: Math.min(320, r.width),
            x: ev.clientX - grab.x,
            y: ev.clientY - grab.y,
            landing: false,
            unscheduling: false,
          });
        }
        const nextUnschedule = isOverUnscheduleZone(ev.clientX, ev.clientY);
        setGhost((g) => (g ? { ...g, x: ev.clientX - grab.x, y: ev.clientY - grab.y, unscheduling: nextUnschedule } : g));
        if (nextUnschedule) {
          if (!overUnschedule) {
            overUnschedule = true;
            target = null;
            for (const el of touched) {
              if (el === card) {
                setShift(card, 0, 0);
              } else {
                setShift(el, 0, 0);
              }
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

      const finish = (commit: boolean) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        cleanup.current = null;
        if (!started || !src) return;
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        document.body.classList.remove("is-card-dragging");

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
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
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
      cleanup.current = () => finish(false);
    },
    [disabled, frameRef, onDrop, onUnschedule, reduce, setGhost, view],
  );

  /** FullCalendar starts its drag on mousedown; stop that for cards we drag ourselves. */
  const onMouseDownCapture = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || e.button !== 0) return;
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

  return { onPointerDown, onMouseDownCapture, onClickCapture, ghostNode };
}
