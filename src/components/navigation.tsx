"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { House, FolderKanban, CalendarDays, Menu, X, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { AccountMenu } from "./auth-controls";

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

export function Navigation({ name, initialCollapsed, projects, children }: {
  name: string; initialCollapsed: boolean; projects: { id: string; name: string }[]; children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `relay-sidebar=${next ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  const content = <div className="nav-content">
    <div className="nav-title"><Link href="/" className="wordmark" aria-label="Relay home" onClick={() => setOpen(false)}>relay<span aria-hidden="true">.</span></Link>
      <Button variant="ghost" className="sidebar-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={toggle}>
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </Button></div>
    <Button className="palette-trigger" variant="outline" aria-label="Search and commands" title="Search and commands (Ctrl/Cmd+K)" onClick={(e) => {
      returnFocus.current = open ? mobileTrigger.current : e.currentTarget;
      setOpen(false); setSearchOpen(true);
    }}><Search size={17} aria-hidden="true" /><span className="nav-label">Search <kbd>Ctrl K</kbd></span></Button>
    <nav aria-label="Workspace">
      {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href}
        className={cn("nav-link", (href === "/" ? pathname === "/" : pathname.startsWith(href)) && "active")} aria-label={label} title={label}
        aria-current={(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "page" : undefined}
        onClick={() => setOpen(false)}><Icon size={18} aria-hidden="true" /><span className="nav-label">{label}</span></Link>)}
    </nav>
    <AccountMenu name={name} onNavigate={() => setOpen(false)} />
  </div>;
  return <SidebarContext.Provider value={{ collapsed, toggle }}><div className="workspace-shell" data-collapsed={collapsed}>
    <aside className="desktop-sidebar">{content}</aside>
    <header className="mobile-header">
      <Link href="/" className="wordmark">relay<span aria-hidden="true">.</span></Link>
      <Button variant="ghost" aria-label="Search and commands" onClick={(e) => { returnFocus.current = e.currentTarget; setSearchOpen(true); }}><Search size={20} /></Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild><Button ref={mobileTrigger} variant="ghost" aria-label="Open navigation"><Menu size={22} /></Button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="mobile-sidebar" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
            <Dialog.Close asChild><Button className="close-nav" variant="ghost" aria-label="Close navigation"><X size={22} /></Button></Dialog.Close>
            {content}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
    {children}
    <CommandPalette projects={projects} open={searchOpen} onOpenChange={setSearchOpen} returnFocus={returnFocus} />
  </div></SidebarContext.Provider>;
}
