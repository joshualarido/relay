import { redirect } from "next/navigation";
import { authConfiguration, currentSession } from "@/lib/auth";
import { SignIn } from "@/components/auth-controls";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentSession()) redirect("/");
  const config = authConfiguration();
  const ready = config.secretReady && config.googleReady;
  return <main id="main" className="login-screen"><div className="login-content stack">
    <div className="wordmark">relay<span aria-hidden="true">.</span></div>
    <div><h1>Pick up where you left off.</h1><p className="muted">A calm place for your projects, tasks, and the work that matters next.</p></div>
    {!ready && <div className="notice"><strong>Google sign-in needs configuration.</strong>
      <p>Set the persistent authentication secret and Google OAuth credentials in your server environment. Follow <code>docs/Phase 1 Setup.md</code>.</p>
    </div>}
    <SignIn ready={ready} />
    <p className="muted text-sm">Your workspace stays private. Sign-in is required to read or change your records.</p>
  </div></main>;
}
