"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SCREENS, hintDirection, isShortcutBlocked, neighbor, screenIndex } from "@/lib/screens";

const isMac = () => /mac/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform);
const scrollKey = (path: string) => `relay-scroll-${path}`;

/** Keyboard screen switching (Ctrl+←/→, macOS ⌘⌥←/→, and 1/2/3), prefetch, and per-screen scroll memory. */
export function ScreenShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  // router.refresh() and the prefetch stale time invalidate cached screens; re-prefetch each one when that happens
  // "full" fetches the dynamic page, not just the loading shell, so the switch never shows the skeleton.
  useEffect(() => {
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const last = new Map<string, number>();
    // kind "full" is in the public AppRouterInstance.prefetch type (its enum is internal); it matches <Link prefetch>.
    const options = (href: string) => ({ kind: "full", onInvalidate: () => schedule(href) }) as unknown as Parameters<typeof router.prefetch>[1];
    const prefetch = (href: string) => { if (cancelled) return; last.set(href, Date.now()); router.prefetch(href, options(href)); };
    // An invalidation right after a prefetch is deferred, so re-prefetching can never loop hot.
    const schedule = (href: string) => {
      const timer = setTimeout(() => { timers.delete(timer); prefetch(href); }, Math.max(0, 1000 - (Date.now() - (last.get(href) ?? 0))));
      timers.add(timer);
    };
    SCREENS.forEach(prefetch);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked(e)) return;
      let to: string | null = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const mac = isMac();
        const ok = mac ? e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey : e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
        const side = e.key === "ArrowRight" ? "right" : "left";
        if (ok) { to = neighbor(location.pathname, side); if (to && to !== location.pathname) hintDirection(side); }
      } else if (["1", "2", "3"].includes(e.key) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        to = SCREENS[Number(e.key) - 1];
      }
      if (!to || to === location.pathname) return;
      e.preventDefault();
      router.push(to);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  // Scroll memory: the workspace scrolls on the window. Track the last offset while on a
  // screen (the router may reset scroll before cleanup runs), save it on leave, restore after render.
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => { lastY.current = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const i = screenIndex(pathname);
    let frame = 0;
    lastY.current = 0;
    if (i >= 0) {
      let y = 0;
      try { y = Number(sessionStorage.getItem(scrollKey(pathname))) || 0; } catch {}
      if (y) frame = requestAnimationFrame(() => { window.scrollTo(0, y); lastY.current = window.scrollY; });
    }
    return () => {
      cancelAnimationFrame(frame);
      if (i >= 0) try { sessionStorage.setItem(scrollKey(pathname), String(lastY.current)); } catch {}
    };
  }, [pathname]);

  return null;
}
