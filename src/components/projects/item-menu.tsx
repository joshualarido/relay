"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import { ContextMenu, DropdownMenu } from "radix-ui";
import { Check, ChevronRight, MoreHorizontal } from "lucide-react";

export type MenuEntry =
  | { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; checked?: boolean }
  | { label: string; children: MenuEntry[] }
  | "separator";

// Both Radix menus share the same part names, so one renderer serves the ⋯ button and right-click.
type Parts = typeof DropdownMenu;

function Entries({ M, entries }: { M: Parts; entries: MenuEntry[] }) {
  return entries.map((entry, i) => {
    if (entry === "separator") return <M.Separator key={i} className="menu-separator" />;
    if ("children" in entry) return <M.Sub key={entry.label}>
      <M.SubTrigger className="dropdown-item">{entry.label}<ChevronRight size={16} aria-hidden="true" className="ml-auto" /></M.SubTrigger>
      <M.Portal><M.SubContent className="dropdown-menu" sideOffset={4}><Entries M={M} entries={entry.children} /></M.SubContent></M.Portal>
    </M.Sub>;
    return <M.Item key={entry.label} className={entry.danger ? "dropdown-item is-danger" : "dropdown-item"} disabled={entry.disabled} onSelect={entry.onSelect}>
      {entry.label}{entry.checked && <><Check size={16} aria-hidden="true" className="ml-auto" /><span className="sr-only"> (current)</span></>}
    </M.Item>;
  });
}

const hoverQuery = "(hover: hover)";
const subscribe = (callback: () => void) => {
  const query = matchMedia(hoverQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
/** True on devices that can hover (desktop). Touch devices long-press to drag, so they use the ⋯ button instead. */
export function useCanHover() {
  return useSyncExternalStore(subscribe, () => matchMedia(hoverQuery).matches, () => true);
}

/** The ⋯ button: visible on touch, on hover or focus elsewhere (see .row-tools). */
export function MoreMenu({ label, entries }: { label: string; entries: MenuEntry[] }) {
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger className="icon-button" aria-label={label} title={label}><MoreHorizontal size={16} aria-hidden="true" /></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-menu" align="end" sideOffset={4}>
      <Entries M={DropdownMenu} entries={entries} />
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** Right-click menu with the same entries. Off on touch, where a long press starts a drag. */
export function RightClickMenu({ entries, children }: { entries: MenuEntry[]; children: ReactElement }) {
  const canHover = useCanHover();
  return <ContextMenu.Root modal={false}>
    <ContextMenu.Trigger asChild disabled={!canHover}>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Content className="dropdown-menu">
      <Entries M={ContextMenu as unknown as Parts} entries={entries} />
    </ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>;
}
