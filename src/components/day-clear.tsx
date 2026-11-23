"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { burstFrom } from "./task-complete";

const key = (day: string) => `relay-day-clear-${day}`;
const noop = () => () => {};
const LINES = ["Everything you set out to do is done.", "That's the whole list. Nicely done.", "Clean slate. Go enjoy it.", "You showed up and finished it."];

/** The "Day clear" moment. It celebrates only when the day turns clear during the session, once per day;
 *  page loads show it calmly. */
export function DayClear({ day, tasksDone, doneLabel }: { day: string; tasksDone: number; doneLabel: string }) {
  const clientMount = useSyncExternalStore(noop, () => true, () => false);
  const [seen] = useState(() => {
    try { return typeof window === "undefined" || Boolean(sessionStorage.getItem(key(day))); } catch { return true; }
  });
  const fresh = clientMount && !seen;
  const badge = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { sessionStorage.setItem(key(day), "1"); } catch {}
    if (fresh) { const t = setTimeout(() => burstFrom(badge.current, 80), 250); return () => clearTimeout(t); }
  }, [day, fresh]);
  const line = LINES[Number(day.slice(-2)) % LINES.length];
  return <div className="day-clear" role="status">
    <motion.div ref={badge} className="day-clear-badge" initial={fresh ? { scale: 0.4, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}>
      <Check size={34} strokeWidth={2.6} aria-hidden="true" />
    </motion.div>
    <motion.div initial={fresh ? { y: 8, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
      <p className="day-clear-title">Day clear</p>
      <p className="day-clear-line">{line}</p>
      {tasksDone > 0 && <p className="day-clear-stats">{tasksDone} {tasksDone === 1 ? "task" : "tasks"} finished · {doneLabel} of focused work</p>}
    </motion.div>
  </div>;
}
