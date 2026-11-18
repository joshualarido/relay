"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { direction } from "@/lib/screens";

const OFFSET = 24;

/**
 * Enter-only screen transition: the new screen replaces the old one at once and slides in
 * from the direction of travel. Keyed by pathname, so a new navigation remounts and cancels
 * a running animation. No animation on first load. Motion leaves `transform: none` at rest,
 * so fixed-position panels inside the page are not trapped in a containing block.
 */
export function ScreenTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  // Previous pathname, tracked with the "adjust state during render" pattern.
  const [route, setRoute] = useState<{ current: string; from: string | null }>({ current: pathname, from: null });
  if (route.current !== pathname) setRoute({ current: pathname, from: route.current });
  const from = route.current === pathname ? route.from : route.current;
  const dir = from === null ? null : direction(from, pathname);
  const initial = from === null ? false
    : reduce || !dir ? { opacity: 0 }
    : { opacity: 0, x: dir === "right" ? OFFSET : -OFFSET };
  return <motion.div key={pathname} className="screen-transition" initial={initial} animate={{ opacity: 1, x: 0 }}
    transition={{ duration: reduce ? 0.1 : dir ? 0.18 : 0.15, ease: "easeOut" }}>{children}</motion.div>;
}
