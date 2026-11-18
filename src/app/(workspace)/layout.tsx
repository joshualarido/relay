import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentSession } from "@/lib/auth";
import { Navigation } from "@/components/navigation";
import { ScreenTransition } from "@/components/screen-transition";
import { MutationNotices } from "@/components/mutation-notice";
import { getDatabase } from "@/lib/db";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const collapsed = (await cookies()).get("relay-sidebar")?.value === "collapsed";
  return <><Navigation name={session.user.name} initialCollapsed={collapsed}
    projects={listProjects(getDatabase(), session.user.id).map(({ id, name }) => ({ id, name }))}>
    <main className="workspace-main" id="main" tabIndex={-1}><ScreenTransition>{children}</ScreenTransition></main>
  </Navigation><MutationNotices /></>;
}
