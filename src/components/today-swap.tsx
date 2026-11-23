"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Cross-fades the task area when the day changes state (e.g. the last task clears into "Day clear").
 *  No animation on first load; MotionConfig reducedMotion="user" covers reduced motion. */
export function TodaySwap({ state, children }: { state: string; children: ReactNode }) {
  return <AnimatePresence mode="wait" initial={false}>
    <motion.div key={state} className="today-swap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, filter: "blur(2px)" }} transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}>
      {children}
    </motion.div>
  </AnimatePresence>;
}
