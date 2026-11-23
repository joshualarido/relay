"use client";

import { motion, useReducedMotion } from "motion/react";

const FLAME = "M20 58C7 58 2 46 7 34c3-7 3-14 7-22 2 9 8 11 8 3 0-6-2-10-2-13 11 9 18 23 16 37-1 12-8 19-16 19Z";
const LAYERS = [
  { id: "outer", scale: 1, colors: ["#F97316", "#DC2626"], opacity: 0.9 },
  { id: "mid", scale: 0.72, colors: ["#FDE047", "#F97316"], opacity: 0.95 },
  { id: "core", scale: 0.42, colors: ["#FFFFFF", "#FDE68A"], opacity: 1 },
];

/** Decorative fire over the momentum score: taller, faster and more violent as momentum rises.
 *  The score and status beside it are the accessible text equivalent. */
export function MomentumFlame({ score }: { score: number }) {
  const reduce = useReducedMotion();
  const i = Math.max(0, Math.min(1, score / 100));
  const height = 22 + 70 * i;
  const period = 1.5 - 1.05 * i; // seconds per flicker
  const sway = 2 + 12 * i; // degrees
  const stretch = 0.06 + 0.22 * i;
  const sparks = i > 0.35 ? Math.round(i * 12) : 0;
  return (
    <div className="momentum-flame" aria-hidden="true" style={{ height, width: height * 0.75, filter: `drop-shadow(0 0 ${4 + 18 * i}px rgb(249 115 22 / ${0.25 + 0.5 * i}))` }}>
      <svg viewBox="0 0 40 60" width="100%" height="100%" overflow="visible">
        <defs>
          {LAYERS.map((l) => (
            <linearGradient key={l.id} id={`flame-${l.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={l.colors[0]} />
              <stop offset="1" stopColor={l.colors[1]} />
            </linearGradient>
          ))}
        </defs>
        {LAYERS.map((l, n) => (
          <motion.path
            key={l.id}
            d={FLAME}
            fill={`url(#flame-${l.id})`}
            opacity={i === 0 ? 0.35 : l.opacity}
            style={{ originX: "50%", originY: "100%", transformBox: "fill-box", scale: l.scale }}
            animate={reduce ? undefined : {
              scaleY: [l.scale, l.scale * (1 + stretch), l.scale * (1 - stretch / 2), l.scale * (1 + stretch * 0.7), l.scale],
              scaleX: [l.scale, l.scale * (1 - stretch / 3), l.scale * (1 + stretch / 4), l.scale],
              skewX: [0, sway, -sway * 0.8, sway * 0.5, 0],
            }}
            transition={{ duration: period * (1 + n * 0.15), repeat: Infinity, ease: "easeInOut", delay: n * 0.08 }}
          />
        ))}
        {!reduce && Array.from({ length: sparks }, (_, k) => (
          <motion.circle
            key={k}
            cx={14 + ((k * 7) % 13)}
            cy={40}
            r={0.9 + (k % 3) * 0.4}
            fill="#FDBA74"
            initial={{ opacity: 0 }}
            animate={{ cy: [40, -10 - 20 * i], cx: [14 + ((k * 7) % 13), 10 + ((k * 11) % 21)], opacity: [0, 1, 0] }}
            transition={{ duration: period * 1.6, repeat: Infinity, delay: (k * period) / Math.max(1, sparks), ease: "easeOut" }}
          />
        ))}
      </svg>
    </div>
  );
}
