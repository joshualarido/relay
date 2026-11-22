import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentSession } from "@/lib/auth";
import { Navigation } from "@/components/navigation";
import { ScreenTransition } from "@/components/screen-transition";
import { MutationNotices } from "@/components/mutation-notice";
import { getCachedEvents, getCachedPreferences, getCachedProjects, getCachedTasks } from "@/lib/request-data";
import { WorkspaceProvider } from "@/components/workspace-store";
import { SmoothScroll } from "@/components/smooth-scroll";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const collapsed = (await cookies()).get("relay-sidebar")?.value === "collapsed";
  const projects = getCachedProjects(session.user.id);
  const tasks = getCachedTasks(session.user.id);
  const events = getCachedEvents(session.user.id);
  const prefs = getCachedPreferences(session.user.id);
  const capture = { timezone: prefs.timezone, weekStart: prefs.weekStart };
  return <WorkspaceProvider initialProjects={projects} initialTasks={tasks} initialEvents={events}>
    <Navigation name={session.user.name} initialCollapsed={collapsed} capture={capture}
      projects={projects.map(({ id, name }) => ({ id, name }))}>
      <main className="workspace-main" id="main" tabIndex={-1}><ScreenTransition>{children}</ScreenTransition></main>
    </Navigation><SmoothScroll /><MutationNotices />
  </WorkspaceProvider>;
}
