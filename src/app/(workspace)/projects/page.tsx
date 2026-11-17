import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getProjectProgress, listProjects } from "@/lib/projects";
import { ProjectBoard } from "@/components/project-board";
import { ProjectForm } from "@/components/project-form";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const userId = await requireUserId();
  const archived = (await searchParams).archived === "true";
  const projects = listProjects(getDatabase(), userId, archived);
  return <div className="page"><header className="page-heading"><div><h1>{archived ? "Archived projects" : "Projects"}</h1></div><ProjectForm /></header>
    <div className="mb-6 flex gap-5"><Link className={!archived ? "text-primary" : "muted"} href="/projects">All projects</Link><Link className={archived ? "text-primary" : "muted"} href="/projects?archived=true">Archived projects</Link></div>
    <ProjectBoard projects={projects} archived={archived} progress={Object.fromEntries(projects.map((p) => [p.id, getProjectProgress(getDatabase(), userId, p.id).percent]))} />
  </div>;
}
