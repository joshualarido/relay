// Project tasks open on their project page; loose tasks open in the (unlisted) Inbox panel.
export const taskHref = (task: { id: string; projectId: string | null }) => `${task.projectId ? `/projects/${task.projectId}` : "/inbox"}?task=${task.id}`;
