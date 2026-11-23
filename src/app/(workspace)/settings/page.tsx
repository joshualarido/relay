import { currentSession, requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getPreferences } from "@/lib/preferences";
import { PreferencesForm } from "@/components/preferences-form";
import { SignOut } from "@/components/auth-controls";
import { NavigationPreference } from "@/components/navigation";
import { ThemeSwitch } from "@/components/theme-switch";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const session = await currentSession();
  return <div className="page"><header className="page-heading"><div><h1>Settings</h1></div></header>
    <div className="settings-grid">
    <section className="section"><h2>Calendar preferences</h2><PreferencesForm initial={getPreferences(getDatabase(), userId)} /></section>
    <section className="section stack"><h2>Appearance</h2><ThemeSwitch /><NavigationPreference /></section>
    <section className="section stack"><h2>Account</h2><p className="muted break-words">{session?.user.email}</p><div><SignOut /></div></section>
    </div>
  </div>;
}
