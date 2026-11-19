import { redirect } from "next/navigation";

// Projects is one split view; old project links open that project's board.
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ task?: string }> }) {
  const query = new URLSearchParams({ project: (await params).projectId });
  const { task } = await searchParams;
  if (task) query.set("task", task);
  redirect(`/projects?${query}`);
}
