"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const key = (day: string) => `relay-day-clear-${day}`;
const noop = () => () => {};

/** The calm "Day clear" moment. The check draws only when the day turns clear during the session (a client-side
 *  mount after a completion refresh), once per day; page loads and hydration show it static. */
export function DayClear({ day }: { day: string }) {
  // false during SSR and hydration (page load), true when mounted by a client render such as router.refresh().
  const clientMount = useSyncExternalStore(noop, () => true, () => false);
  const [seen] = useState(() => {
    try { return typeof window === "undefined" || Boolean(sessionStorage.getItem(key(day))); } catch { return true; }
  });
  useEffect(() => { try { sessionStorage.setItem(key(day), "1"); } catch {} }, [day]);
  return <div className={`day-clear${clientMount && !seen ? " is-new" : ""}`} role="status">
    <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><circle cx="12" cy="12" r="10.5" /><path d="M7 12.5l3.2 3.2L17 9" /></svg>
    <p>Day clear</p>
  </div>;
}
