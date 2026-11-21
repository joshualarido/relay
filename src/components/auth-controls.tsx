"use client";

import { useState } from "react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { Keyboard, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { useShortcutSheet } from "./shortcut-sheet";

export function SignIn({ ready }: { ready: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (result.error) { setError("Google sign-in could not start. Check configuration and try again."); setPending(false); }
    } catch { setError("Could not connect. Try again."); setPending(false); }
  }
  return <div className="stack">
    <Button onClick={signIn} disabled={!ready || pending}>{pending ? "Connecting..." : "Continue with Google"}</Button>
    {error && <p role="alert" className="error-message">{error}</p>}
  </div>;
}

export function SignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <div className="stack">
    <Button variant="outline" disabled={pending} onClick={async () => {
      setPending(true);
      setError("");
      try {
        const result = await authClient.signOut();
        if (result.error) throw new Error("Logout failed");
        router.replace("/login");
        router.refresh();
      } catch { setError("Could not sign out. Try again."); setPending(false); }
    }}>{pending ? "Signing out..." : "Sign out"}</Button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function AccountMenu({ name, onNavigate }: { name: string; onNavigate?: () => void }) {
  const shortcuts = useShortcutSheet();
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger className="nav-footer" aria-label={`Account menu for ${name}`} title={`Account menu for ${name}`}>
      <span className="avatar" aria-hidden="true">{name.slice(0, 1)}</span><div className="nav-label"><strong>{name}</strong><span>Personal workspace</span></div>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-menu account-menu" side="top" align="start" sideOffset={6}>
      <DropdownMenu.Item className="dropdown-item" onSelect={() => shortcuts.open()}>
        <Keyboard size={16} aria-hidden="true" />Keyboard shortcuts<kbd className="ml-auto">?</kbd>
      </DropdownMenu.Item>
      <DropdownMenu.Item asChild><Link className="dropdown-item" href="/settings" onClick={onNavigate}><Settings2 size={16} aria-hidden="true" />Settings</Link></DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
