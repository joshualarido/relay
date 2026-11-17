"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";

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
