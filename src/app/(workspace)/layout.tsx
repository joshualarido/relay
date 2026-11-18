import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentSession } from "@/lib/auth";
import { Navigation } from "@/components/navigation";
import { ScreenTransition } from "@/components/screen-transition";
import { MutationNotices } from "@/components/mutation-notice";
import { getDatabase } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { getPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const collapsed = (await cookies()).get("relay-sidebar")?.value === "collapsed";
  const db = getDatabase(), projects = listProjects(db, session.user.id);
  // Capture dialog data; the layout re-renders on router.refresh(), which every mutation calls.
  const capture = { projects, tasks: listTasks(db, session.user.id), timezone: getPreferences(db, session.user.id).timezone };
  return <><Navigation name={session.user.name} initialCollapsed={collapsed} capture={capture}
    projects={projects.map(({ id, name }) => ({ id, name }))}>
    <main className="workspace-main" id="main" tabIndex={-1}><ScreenTransition>{children}</ScreenTransition></main>
  </Navigation><MutationNotices /></>;
}
