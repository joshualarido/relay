// Every task opens on the Projects board of its project ("none" for loose tasks), with its details sheet.
export const projectHref = (projectId: string | null) => `/projects?project=${projectId ?? "none"}`;
export const taskHref = (task: { id: string; projectId: string | null }) => `${projectHref(task.projectId)}&task=${task.id}`;
