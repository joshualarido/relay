"use client";

import { useEffect, useRef } from "react";

const scrollKey = "relay-scroll-/";

/** The current time on Today's timeline. On first show, brings itself into view unless a scroll position is being restored. */
export function NowLine({ label }: { label: string }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    let restoring = false;
    try { restoring = Number(sessionStorage.getItem(scrollKey)) > 0; } catch {}
    if (!restoring && window.scrollY === 0) ref.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, []);
  return <li ref={ref} className="now-line"><span className="sr-only">Now, </span><time className="now-line-label">{label}</time><span className="now-line-rule" aria-hidden="true" /></li>;
}
