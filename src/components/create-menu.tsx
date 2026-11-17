"use client";

import { useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { CalendarDays, CheckSquare, ChevronDown, FolderKanban, Plus } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { TaskForm } from "./task-form";
import { ProjectForm } from "./project-form";
import { EventForm } from "./event-form";

export function CreateMenu({ projects, tasks, timezone }: { projects: Project[]; tasks: Task[]; timezone: string }) {
  const [kind, setKind] = useState(""), trigger = useRef<HTMLButtonElement>(null);
  function close() { setKind(""); trigger.current?.focus(); }
  return <>
    <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button ref={trigger}><Plus size={18} aria-hidden="true" />Create<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-menu" align="end" sideOffset={8}
        onCloseAutoFocus={(e) => { if (kind) e.preventDefault(); }}>
        {([["task", "Task", CheckSquare], ["project", "Project", FolderKanban], ["event", "Event", CalendarDays]] as const).map(([value, label, Icon]) =>
          <DropdownMenu.Item className="dropdown-item" key={String(value)} onSelect={() => setKind(String(value))}>
            <Icon size={17} aria-hidden="true" />{String(label)}
          </DropdownMenu.Item>)}
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
    {kind === "task" && <TaskForm initialOpen onClose={close} projects={projects} />}
    {kind === "project" && <ProjectForm initialOpen onClose={close} />}
    {kind === "event" && <EventForm initialOpen onClose={close} projects={projects} tasks={tasks} timezone={timezone} />}
  </>;
}
