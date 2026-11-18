"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SCREENS, isShortcutBlocked, neighbor, screenIndex } from "@/lib/screens";

const isMac = () => /mac/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform);
const scrollKey = (i: number) => `relay-scroll-${i}`;

/** Keyboard screen switching (Ctrl+←/→, macOS ⌘⌥←/→, and 1/2/3), prefetch, and per-screen scroll memory. */
export function ScreenShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { SCREENS.forEach((s) => router.prefetch(s)); }, [router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked(e)) return;
      let to: string | null = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const mac = isMac();
        const ok = mac ? e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey : e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
        if (ok) to = neighbor(location.pathname, e.key === "ArrowRight" ? "right" : "left");
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
      try { y = Number(sessionStorage.getItem(scrollKey(i))) || 0; } catch {}
      if (y) frame = requestAnimationFrame(() => { window.scrollTo(0, y); lastY.current = window.scrollY; });
    }
    return () => {
      cancelAnimationFrame(frame);
      if (i >= 0) try { sessionStorage.setItem(scrollKey(i), String(lastY.current)); } catch {}
    };
  }, [pathname]);

  return null;
}
