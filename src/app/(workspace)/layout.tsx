import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentSession } from "@/lib/auth";
import { Navigation } from "@/components/navigation";
import { ScreenTransition } from "@/components/screen-transition";
import { MutationNotices } from "@/components/mutation-notice";
import { getDatabase } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { listEvents } from "@/lib/events";
import { getPreferences } from "@/lib/preferences";
import { WorkspaceProvider } from "@/components/workspace-store";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const collapsed = (await cookies()).get("relay-sidebar")?.value === "collapsed";
  const db = getDatabase(), projects = listProjects(db, session.user.id);
  const tasks = listTasks(db, session.user.id);
  const events = listEvents(db, session.user.id);
  const prefs = getPreferences(db, session.user.id);
  const capture = { timezone: prefs.timezone, weekStart: prefs.weekStart };
  return <WorkspaceProvider initialProjects={projects} initialTasks={tasks} initialEvents={events}>
    <Navigation name={session.user.name} initialCollapsed={collapsed} capture={capture}
      projects={projects.map(({ id, name }) => ({ id, name }))}>
      <main className="workspace-main" id="main" tabIndex={-1}><ScreenTransition>{children}</ScreenTransition></main>
    </Navigation><MutationNotices />
  </WorkspaceProvider>;
}
