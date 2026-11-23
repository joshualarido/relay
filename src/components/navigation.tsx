"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { motion, MotionConfig } from "motion/react";
import { Archive, House, FolderKanban, CalendarDays, Plus, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { AccountMenu } from "./auth-controls";
import { ScreenShortcuts } from "./screen-shortcuts";
import { isShortcutBlocked } from "@/lib/screens";
import { CaptureProvider, useCapture, type CaptureData } from "./capture-dialog";
import { ShortcutSheetProvider } from "./shortcut-sheet";

const SidebarContext = createContext({ collapsed: false, toggle: () => {} });

export function NavigationPreference() {
  const { collapsed, toggle } = useContext(SidebarContext);
  return <div className="stack"><p className="muted">Choose more room for work or keep navigation labels visible. Saved in this browser.</p>
    <Button variant="outline" onClick={toggle}>{collapsed ? "Show navigation labels" : "Use compact navigation"}</Button>
  </div>;
}

const links = [
  { href: "/", label: "Today", icon: House },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

const otherLinks = [
  { href: "/archives", label: "Archives", icon: Archive },
];

export function Navigation({ name, initialCollapsed, projects, capture, children }: {
  name: string; initialCollapsed: boolean; projects: { id: string; name: string }[]; capture: CaptureData; children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `relay-sidebar=${next ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  const onToggleKey = useEffectEvent(() => toggle());
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "b" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || isShortcutBlocked(e)) return;
      e.preventDefault();
      onToggleKey();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const content = (scope: string) => <div className="nav-content">
    <div className="nav-title"><Link href="/" className="wordmark" aria-label="Relay home">relay<span aria-hidden="true">.</span></Link>
      <Button variant="ghost" className="sidebar-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title="Toggle sidebar (Ctrl+B)" onClick={toggle}>
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </Button></div>
    <Button className="palette-trigger" variant="outline" aria-label="Search and commands" title="Search and commands (Ctrl+K)" onClick={(e) => {
      returnFocus.current = e.currentTarget; setSearchOpen(true);
    }}><Search size={17} aria-hidden="true" /><span className="nav-label">Search <kbd>Ctrl K</kbd></span></Button>
    <nav aria-label="Workspace">
      <span className="nav-group-label nav-label">Main</span>
      {links.map(({ href, label, icon: Icon }, i) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Link key={href} href={href} prefetch={true} className={cn("nav-link", active && "active")} aria-label={label} title={`${label} (${i + 1})`}
          aria-current={active ? "page" : undefined}>
          {active && <motion.span layoutId={`nav-indicator-${scope}`} className="nav-indicator" aria-hidden="true" transition={{ duration: 0.12, ease: "easeOut" }} />}
          <Icon size={18} aria-hidden="true" /><span className="nav-label">{label}</span></Link>;
      })}
      <span className="nav-group-label nav-label">Other</span>
      {otherLinks.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return <Link key={href} href={href} className={cn("nav-link", active && "active")} aria-label={label} title={label}
          aria-current={active ? "page" : undefined}>
          {active && <motion.span layoutId={`nav-indicator-${scope}`} className="nav-indicator" aria-hidden="true" transition={{ duration: 0.18, ease: "easeOut" }} />}
          <Icon size={18} aria-hidden="true" /><span className="nav-label">{label}</span></Link>;
      })}
    </nav>
    <AccountMenu name={name} />
  </div>;
  return <MotionConfig reducedMotion="user"><SidebarContext.Provider value={{ collapsed, toggle }}><ShortcutSheetProvider><CaptureProvider data={{ ...capture, projects }}><div className="workspace-shell" data-collapsed={collapsed}>
    <aside className="desktop-sidebar">{content("desktop")}</aside>
    <header className="mobile-header">
      <Link href="/" className="wordmark" aria-label="Relay home">relay<span aria-hidden="true">.</span></Link>
      <Button variant="ghost" className="header-search" aria-label="Search and commands" title="Search and commands (/)" onClick={(e) => { returnFocus.current = e.currentTarget; setSearchOpen(true); }}><Search size={20} /></Button>
      <AccountMenu name={name} />
    </header>
    {children}
    <TabBar pathname={pathname} />
    <ScreenShortcuts />
    <CommandPalette projects={projects} open={searchOpen} onOpenChange={setSearchOpen} returnFocus={returnFocus} />
  </div></CaptureProvider></ShortcutSheetProvider></SidebarContext.Provider></MotionConfig>;
}

function TabBar({ pathname }: { pathname: string }) {
  const capture = useCapture();
  const tab = ({ href, label, icon: Icon }: typeof links[number]) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return <Link key={href} href={href} className={cn("tab-link", active && "active")} aria-current={active ? "page" : undefined}>
      <Icon size={20} aria-hidden="true" /><span>{label}</span></Link>;
  };
  return <nav className="tab-bar" aria-label="Workspace">
    {tab(links[0])}{tab(links[1])}
    <button type="button" className="tab-capture" aria-label="Capture" title="Capture (N)" onClick={(e) => capture.open(e.currentTarget)}>
      <span><Plus size={22} aria-hidden="true" /></span></button>
    {tab(links[2])}
  </nav>;
}
