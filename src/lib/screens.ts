/** Fixed screen order for keyboard switching and slide direction. */
export const SCREENS = ["/", "/projects", "/calendar"] as const;
export type Screen = (typeof SCREENS)[number];
export type Direction = "left" | "right";

/** Index of the screen a pathname belongs to; nested paths count. -1 when unknown. */
export function screenIndex(pathname: string): number {
  if (pathname === "/") return 0;
  return SCREENS.findIndex((s, i) => i > 0 && (pathname === s || pathname.startsWith(`${s}/`)));
}

/** Adjacent screen, looping at either end (Calendar -> Today, Today -> Calendar); null from an unknown path. */
export function neighbor(pathname: string, side: Direction): Screen | null {
  const i = screenIndex(pathname);
  if (i < 0) return null;
  return SCREENS[(i + (side === "right" ? 1 : -1) + SCREENS.length) % SCREENS.length];
}

/** Direction of the last keyboard switch, so a wrap slides the way the key points. Consumed once by the transition. */
let pendingDirection: Direction | null = null;
export function hintDirection(side: Direction) { pendingDirection = side; }
export function takeDirectionHint(): Direction | null { const d = pendingDirection; pendingDirection = null; return d; }

/** Direction of travel between two screens, or null when either is unknown or they match. */
export function direction(from: string, to: string, hint: Direction | null = null): Direction | null {
  const a = screenIndex(from), b = screenIndex(to);
  if (a < 0 || b < 0 || a === b) return null;
  if (hint && neighbor(from, hint) === SCREENS[b]) return hint; // keyboard wrap follows the key pressed
  return b > a ? "right" : "left";
}

/**
 * True when a global single-key or screen shortcut must not act: already handled,
 * typing in a field, or a dialog / open menu is present. Modifier rules stay with the caller.
 */
export function isShortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  const target = event.target as Element | null;
  if (target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return true;
  return !!document.querySelector("[role=dialog], [role=alertdialog], [role=menu][data-state=open], [role=menu]:not([data-state])");
}
