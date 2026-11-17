# Relay — Product Requirements Document

**Version:** 2.4  
**Status:** PRD discussion complete. Workflow/loop pipeline discussion must precede slice planning or implementation.  
**Platform:** Responsive web application  
**Product:** AI-assisted personal organizer  
**Scope:** Single-user MVP, designed for future expansion

### Active Phase 1.2 Overrides

`docs/Phase 1.2 Implementation PRD.md` supersedes earlier priority, completion,
and visual rules: manual importance/urgency replaces Low/Medium/High; confirmed
project completion cascades to unfinished tasks; warm solid full-width bento UI
replaces the initial baseline. Reopen/pause/archive preserve child statuses.
No scroll navigation or AI is included. Execution is single-agent with a final
backed-up local reset only after automated acceptance. Unaffected requirements
and future AI release scope below remain in force.

### Confirmed Decisions and Release Boundary

- SQLite is final. Do not substitute PostgreSQL.
- Every AI-proposed workspace mutation requires an explicit preview and approval. Read-only queries do not.
- Explicit check-in submission may save the user's text and selected association; AI-inferred associations, status changes, and follow-up tasks require approval.
- Stale proposals must not overwrite newer work. Undo and snapshot restoration must also protect subsequent changes.
- Support archiving and soft deletion. Deleting a parent also soft-deletes its children after a preview and confirmation.
- Host the application with SQLite on the user's personal VPS. Deployment and backup setup are deferred to deployment work, not blockers for this requirements discussion.
- The initial deployment will be protected by user-managed Cloudflare email restrictions. Application login uses Google OAuth + Better Auth. Public availability is future work.
- AI features require a configured model. Without one, chat and AI recommendations/planning are unavailable; manual project/task/event management still works. Do not build a replacement recommendation engine without AI.
- Relay is a personal task manager tailored to the user's needs, with a conversational AI assistant. Suggesting next actions from recently completed work is a capability the user requests, not an automatic task-completion trigger. Suggestions require approval before creating or changing records.
- Release includes all features stated in F01-F10, including task dependencies, Focus Mode, the command palette, daily planning, snapshots, and Undo. P0/P1 labels indicate implementation order, not permission to omit features.
- "Optional" features may be optional for the user to invoke or enable; they must still work in the release.
- Desktop and mobile web usability, accessibility, persistence, and failure handling are required throughout development, not deferred until the last phase.
- Section 13 records settled product decisions and topics deliberately deferred to the separate workflow discussion. Report any newly discovered material ambiguity rather than silently selecting product behavior.
- Finish the requirements discussion, explicitly say it is finished, and stop. Discuss the workflow/loop pipeline next; do not automatically split work into slices, scaffold the app, or implement features.

---

## 1. Product Vision

Relay is a personal task management application tailored to the user's needs, with a conversational AI assistant for managing projects, tasks, deadlines, events, and personal productivity.

Its primary purpose is to **minimize the effort required to stay organized, maintain momentum, and resume work after inactivity.**

Alongside ordinary task management, the user can ask Relay's AI to understand current responsibilities, suggest what to do next, and help recover from neglected or disorganized workloads. The assistant responds to user requests rather than autonomously directing work.

### Core Product Loops

**Normal workflow:**

Capture → Organize → Work → Update → Continue

**Optional, user-requested AI assistance:** Ask the assistant → Review its answer or proposed changes → Approve any changes → Continue.

**Next-action capability:** The user may ask the assistant for direct next steps based on recently completed tasks. Completing a task or submitting a check-in must not automatically invoke AI, generate suggestions, or create another task. There is no requirement to produce a follow-up after every completed task or invent work when a goal is finished.

**Recovery workflow:**

Return → Assess → Prioritize → Approve → Resume

### Product Principles

1. **Chat-first, not chat-only:** Everything important must be manageable both manually and through natural language.
    
2. **Minimal maintenance:** Maintaining the task database should require very little effort.
    
3. **Recovery-oriented:** Returning after days or weeks of inactivity must be straightforward.
    
4. **Actionable AI:** Prefer concrete actions over generic advice.
    
5. **User-controlled:** AI suggests and assists; consequential decisions remain with the user.
    
6. **Single source of truth:** Structured database records, not AI conversation history, determine workspace state.
    
7. **Lightweight:** Avoid unnecessary complexity, infrastructure, and dependencies.
    

### Target Users

Students, developers, solo founders, and individuals managing several simultaneous projects.

The primary problem is not creating tasks. It is keeping task management useful when plans change, work accumulates, or the system has been neglected.

---

## 2. Application Structure

### Main Navigation

|Page|Purpose|
|---|---|
|Home|Overview, priorities, upcoming responsibilities, recovery|
|Projects|Project Kanban and project management|
|Inbox|Unassigned tasks and quick capture|
|Calendar|Unified deadlines and events|
|Chat|Natural-language workspace management|
|Settings|Preferences and AI configuration|

**Secondary interfaces:**

- Project details page.
    
- Task details panel.
    
- Focus Mode.
    
- Global command palette (`Ctrl/Cmd + K`).
    
- Collapsible AI assistant panel accessible throughout the app.
    

### Data Hierarchy

- Workspace contains projects, tasks, events, and activity.
    
- Projects contain tasks and may link to events.
    
- Tasks may be project-associated or unassigned.
    
- Events may be independent or linked to projects/tasks.
    
- Check-ins record reported progress.
    
- AI proposals represent changes awaiting approval.
    

---

## 3. Core Features

### F01 — Home Dashboard

**Priority: P0**

The dashboard must immediately communicate the user's current situation.

Requirements:

- Active projects and progress.
    
- Important and overdue tasks.
    
- Upcoming deadlines and events.
    
- Recently updated work.
    
- A maximum of three AI-recommended "Next Up" tasks, generated when the user requests recommendations, not automatically on page load or task completion.

- AI-generated Next Up suggestions require a configured model. Without one, show a clear setup prompt rather than generated advice or a non-AI recommendation fallback.
    
- Quick capture input.
    
- AI assistant access.
    
- Recovery Mode prompt after inactivity.
    

**Definition of Done:**

- Dashboard reflects actual database records.
    
- Every displayed project/task/event links to its details.
    
- Empty, loading, and error states are implemented.
    
- Recommended priorities are clearly distinguished from user-defined priorities.
    

### F02 — Projects

**Priority: P0**

Projects use a drag-and-drop Kanban board.

**Statuses:** Planned, Active, Paused, Completed.

Project properties:

- Name and description.
    
- Status and optional deadline.
    
- Progress percentage.
    
- Creation and update timestamps.
    

Operations:

- Create, edit, archive, delete.
    
- Drag between status columns.
    
- Search and filter.
    
- Open dedicated project details.
    

**Lifecycle requirements:**

- Archive preserves records and their statuses. Provide a way to find and unarchive archived projects.
- Delete means soft delete, not permanent removal from SQLite.
- Project deletion cascades to its tasks, linked events, and associated check-ins after a preview and explicit confirmation. Task deletion cascades to its linked events and associated check-ins.
- Events with no project/task parent are independent and must not be deleted by a project/task cascade. Task dependencies are references, not parent-child ownership: deleting a prerequisite must not delete other tasks that reference it.
- Cascade soft deletion is atomic and records the deletion operation so restoration can distinguish its affected records from previously deleted records.
- Provide access to soft-deleted records and a restore operation. Restore only records affected by the selected operation, never independently deleted records; preserve later work. No automatic permanent purge is required for this release.
- Completing a project must not silently complete its unfinished tasks.

**Project Details must include:**

- Project overview and progress.
    
- Task Kanban and list views.
    
- Related deadlines and events.
    
- Recent check-ins/activity.
    
- Contextual AI assistance.
    

Progress = completed tasks / total tasks, with an empty project displaying 0%.

**Definition of Done:** Project operations persist correctly, update relevant views, and require no AI connection.

### F03 — Tasks and Inbox

**Priority: P0**

**Task statuses:** Backlog, Next, In Progress, Blocked, Done.

**Task properties:**

- Title and description.
    
- Optional project.
    
- Status and priority (Low, Medium, High).
    
- Optional due date and time.
    
- Optional effort estimate.

- Effort estimates use positive whole minutes.
    
- Optional blocker reason.
    
- Creation, update, and completion timestamps.
    

Requirements:

- Full CRUD and task reopening.
    
- Drag-and-drop status changes and reordering.
    
- List and Kanban views.
    
- Search and filtering.
    
- Task details panel.
    
- Check-in history.
    
- Unassigned tasks displayed in Inbox.
    
- Ability to move tasks between projects.

- Warn, but allow confirmed project completion with unfinished tasks; never silently change task statuses.
- Dependencies provide warnings rather than automatic task status changes or hard blocking. Self-links, cross-owner links, and cycles remain forbidden.
- Entering Done sets a completion timestamp; reopening clears it while preserving the history.
- Completing a task does not invoke AI or automatically suggest another task. The user may ask the assistant for next actions based on completed work; do not insert any suggested task before approval.
    

**Additional features (P1; required for release):**

- Task dependencies ("Blocked by Task X").
    
- Focus Mode displaying one active task, relevant context, and a progress-report input.
    

**Definition of Done:** Tasks can be managed independently of AI. Status, project assignment, ordering, and completion persist across refreshes. Task dependencies cannot reference themselves or create cycles.

### F04 — Unified Calendar

**Priority: P0**

Calendar displays **three distinct record types**, differentiated by colors and visual indicators.

|Record type|Color|Representation|
|---|---|---|
|Project deadline|Purple `#8B5CF6`|Project milestone|
|Task deadline|Amber `#F59E0B`|Task due date|
|Event|Blue `#3B82F6`|Scheduled activity|

Requirements:

- Month, week, day, and agenda views.
    
- Unified rendering of all three types.
    
- Filters and legend for each type.
    
- Clicking items opens their appropriate detail views.
    
- Drag-to-reschedule where applicable.
    
- Completed task deadlines may be dimmed or hidden.
    
- Accessible icons/labels alongside color distinctions.
    

**Events must support:**

- Title and description.
    
- Start/end date and time.
    
- All-day events.
    
- Time zone.
    
- Optional project/task link.
    
- Optional location or meeting URL.
    
- Create, edit, and delete operations.
    

**Important distinctions:**

- Project deadline = project target completion date.
    
- Task deadline = when a task is due.
    
- Event = scheduled time commitment.
    

Deadlines must not automatically create time-blocked events.

Date-only deadlines must remain on their intended calendar date regardless of time zone. Timed events must be stored and converted consistently.

**Agreed date rules:**

- Default to Asia/Jakarta and a Monday week start; both are configurable.
- A date-only task becomes overdue after its day ends in the user's timezone.
- Store date-only values without converting them to UTC. Timed records preserve the instant and an IANA timezone.
- Interpret relative dates in the user's timezone and ask when the intended date/time is unclear.
- If an event end is omitted, suggest a visible 60-minute duration for approval.
- All-day ranges use an exclusive end date: a one-day event ends at the start of the following date.
- Dragging a deadline changes its date without adding duration or changing its type. Moving a timed event preserves its duration.

**Definition of Done:** All record types render with correct colors, dates, interactions, and filters. Rescheduling updates the appropriate underlying record.

### F05 — AI Assistant

**Priority: P0**

A conversational assistant that can inspect and manipulate actual workspace data.

**Interface:**

- Dedicated chat page.
    
- Collapsible contextual sidebar.
    
- Streaming responses where supported.
    
- Persistent conversation history.
    
- Referenced record links.
    
- Structured action previews and confirmation controls.
    

**Required capabilities:**

1. **Query:** "What do I need to finish this week?"
    
2. **Create:** "Create a portfolio project with five initial tasks."
    
3. **Update:** "Move the API integration task to In Progress."
    
4. **Organize:** "Group these scattered tasks into the right projects."
    
5. **Schedule:** "Schedule a study session tomorrow at 4 PM."
    
6. **Prioritize:** "What should I work on next?"
    
7. **Decompose:** "Break down authentication implementation."
    
8. **Clean up:** "Find outdated tasks and help reorganize my workspace."
    

The assistant must retrieve actual records before making factual claims.

**AI action categories:**

- Workspace reads.
    
- Project/task/event creation.
    
- Record updates and moves.
    
- Check-in recording.
    
- Task recommendations.
    
- Bulk organization proposals.
    

**Action policy:**

- Read-only queries execute immediately.
    
- Every AI-proposed workspace mutation, including single-record creation or updates, requires a structured preview and explicit approval.
    
- An initial chat instruction requests a proposal; it does not approve execution. Show the exact changes before the separate approval action.
    
- Explicit check-in submission may immediately persist the user's text and selected task/project association. AI-inferred associations or other changes still require approval.
    
- Bulk changes, deletions, and all rescheduling require confirmation of the affected records.

- Editing a proposal invalidates any earlier approval. Only the approved payload may execute.
    
- AI cannot execute arbitrary SQL or code.

- Without a configured model, chat explains that a model must be added in Settings. Do not pretend to answer or apply changes. During provider outages, report the error and keep manual management available.
    

**Definition of Done:** Supported commands result in validated database operations, not simulated chat responses. Invalid requests fail safely, and the assistant accurately reports execution results.

### F06 — AI Model Configuration

**Priority: P0**

Support bring-your-own-key, OpenAI-compatible providers, including gateways such as 9Router.

**Settings:**

- Provider name.
    
- API base URL.
    
- API key.
    
- Model identifier.
    
- Test connection.
    
- Active model selector.
    

Requirements:

- Multiple saved model configurations.
    
- Server-side model requests.
    
- Secure, encrypted API-key storage.
    
- Provider-independent AI service.
    
- Clear errors for invalid credentials, timeouts, and incompatible endpoints.
    
- Structured-output fallback when native tool calling is unsupported.
    

Credentials must never appear in browser-exposed responses after saving, logs, or client bundles.

The user's providers are available over public HTTPS. Custom URLs must still be validated to prevent requests to private/internal networks and unsafe redirects. Cloudflare inbound access controls do not replace outbound provider URL validation. Private/local gateway support is not required.

**Definition of Done:** A user can configure, test, and switch between two compatible model providers without modifying application code.

### F07 — Progress Check-ins and Next Steps

**Priority: P0 — Core Differentiator**

Users can report completed or unfinished work in natural language.

Example:

"Authentication works now, but I haven't implemented password resets or written tests."

Relay should:

1. Identify relevant tasks/projects.
    
2. Save explicitly submitted check-in text with its user-selected association; preview and obtain approval for AI-inferred associations.
    
3. Propose status updates only when completion is explicitly established, and apply them only after approval.
    
4. Identify outstanding work.
    
5. When the user asks for next steps, use the reported or recently completed work to suggest up to three actionable follow-ups. Prefer one clear next step over expanding a large backlog; do not invent unnecessary work or generate suggestions merely because a check-in was saved.
    
6. Allow editing, selective approval, or rejection.
    

Recommendations contain a title, associated project, suggested priority, and short rationale.

**Definition of Done:**

- Check-ins persist independently of chat history.
    
- Follow-up tasks are not inserted before approval.
    
- Approved actions create the correct records exactly once.
    
- Rejected recommendations do not modify the task database.

- Marking a task Done or saving a check-in alone must not invoke AI or generate follow-ups. An explicit user request can produce next-action suggestions; creating or changing records still requires approval. Model failure never undoes an already saved task completion.
- Repeating or retrying a request must not duplicate approved follow-up tasks. The detailed interaction flow is deferred to the workflow discussion.
    

### F08 — Recovery Mode

**Priority: P0 — Core Differentiator**

Recovery Mode helps users resume after inactivity or an overwhelming backlog.

**Triggers:**

- Manual invocation.
    
- Natural-language request.
    
- Optional dashboard prompt after three days without workspace activity (configurable).
    

**Workflow:**

1. **Assess:** Examine active projects, overdue tasks, upcoming commitments, blockers, and recent updates.
    
2. **Summarize:** Explain the current situation concisely.
    
3. **Prioritize:** Identify urgent and relevant responsibilities.
    
4. **Recommend:** Generate a manageable recovery plan.
    
5. **Approve:** Allow selective acceptance of proposed changes.
    
6. **Resume:** Direct the user toward a clear next task.
    

Example:

"You have four overdue tasks and two active projects. Your presentation is due Friday. I'd prioritize preparing the slides and defer the optional UI redesign."

Recovery Mode may suggest:

- Rescheduling overdue tasks.
    
- Reprioritizing work.
    
- Pausing projects.
    
- Moving tasks into Next.
    
- Creating follow-up tasks.
    

It must **never silently delete, archive, or reschedule records**.

**Definition of Done:** Given a workspace with overdue tasks and inactivity, Relay produces a factual recovery summary, a limited actionable plan, and correctly executes only approved changes.

### F09 — Quick Capture, Cleanup, and Planning

**Priority: P0 for capture/cleanup; P1 for daily planning**

Users can paste unstructured notes such as:

"Need to deploy the website, finish mobile UI, prepare for Wednesday's test, and learn Docker sometime."

Relay should:

- Extract tasks and possible projects.
    
- Match existing projects.
    
- Resolve explicit dates where possible.
    
- Detect likely duplicates.
    
- Preview structured records.
    
- Create only approved items.
    

Additional workflows:

- Global command palette for quick capture, search, and navigation.
    
- Inbox triage with AI-assisted categorization.
    
- User-invoked "Plan My Day" action using deadlines, urgency, and estimated effort; required for release.

- Daily planning requires AI. Without a configured model, show the setup prompt; do not build a separate non-AI planning engine.
    

**Definition of Done:** Natural-language capture produces accurate reviewable proposals without duplicate or unintended records.

### F10 — Search, History, and Recovery Safeguards

**Priority: P0 for search/history, safe Undo, and snapshots before any bulk AI mutation**

- Global search for projects and tasks.
    
- Filtering by status, priority, project, and date.
    
- Activity log for manual and AI changes.
    
- Undo for supported reversible operations.

- Undo is required for create, edit, move, reorder, reschedule, archive, and soft-delete operations. Keep recoverable history without automatic expiry in this release; the toast is a shortcut, not the only way to access Undo.
    
- Workspace snapshots before approved bulk AI reorganizations.
    

Snapshots should preserve affected record states, not implement an unnecessarily complicated version-control system.

**Execution and recovery safety:**

- At approval, revalidate ownership, record availability, affected-record revisions, and constraints inside the execution transaction.
- Reject stale proposals without applying any of their writes. Show changed records and require a refreshed preview and new approval.
- If a cascade's affected-record set changes after its preview, invalidate that preview as well.
- A selected set of proposal actions executes atomically; persist its before-state snapshot and successful activity records in the same transaction. Other unselected actions must not execute.
- Enforce idempotency in SQLite so retries and concurrent approvals cannot execute the same approved action twice.
- Undo or snapshot restoration must verify that affected records still match the state produced by the original operation. On conflict, change nothing and report the conflict; never overwrite later work.
- Snapshot support must exist before bulk organization or Recovery Mode can apply multi-record changes.
- Undoing a creation with later dependent records must report a conflict, not silently cascade to those later records.
- If selected proposal actions require another unselected action, explain the dependency and ask the user to revise the selection. Do not silently approve extra actions.

**Definition of Done:** Users can inspect changes and restore affected records from a bulk-operation snapshot without corrupting unrelated data.

---

## 4. Design and UX Requirements

**Direction:** Modern, minimal, calm, refined, and highly readable. The interface should feel lightweight but capable.

**Theme:** Dark throughout the application, including login, navigation, forms, dialogs, calendar, and all loading/error/empty states. Use shared dark-theme tokens, accessible contrast, and visible focus states. Apply the theme from the first paint without a light-theme flash. A light theme or theme switcher is not required.

### Layout

**Desktop**

- Persistent left navigation.
    
- Spacious primary content.
    
- Optional right-side AI panel.
    

**Mobile**

- Compact navigation.
    
- Responsive task lists and Kanban.
    
- Expandable full-screen chat.
    
- Touch-friendly controls.
    

### Design Rules

- Use shadcn/ui as the component foundation.
    
- Follow a consistent token-based design system.
    
- Use clear typography, meaningful whitespace, subtle borders, and restrained color.
    
- Preserve status colors and semantic clarity throughout the product.
    
- Support keyboard navigation and accessible interactions.
    
- Animate meaningful state transitions using Motion.
    
- Respect reduced-motion preferences.
    
- Implement polished empty, loading, error, and confirmation states.
    
- Avoid visually overwhelming dashboards and deeply nested cards.
    

Use **Impeccable** throughout design planning, critique, accessibility auditing, responsiveness, and final polish.

Maintain `PRODUCT.md` and `DESIGN.md` for consistent AI-assisted development.

---

## 5. Exact Technology Stack

Use the following stack unless a documented technical incompatibility requires a change.

| Layer          | Libraries / Tools                                                   |
| -------------- | ------------------------------------------------------------------- |
| Framework      | Next.js App Router, React, TypeScript                               |
| Styling        | Tailwind CSS                                                        |
| Components     | shadcn/ui, Radix UI, lucide-react                                   |
| Animation      | `motion`                                                            |
| Kanban         | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`          |
| Calendar       | FullCalendar v7: `@fullcalendar/react`, `temporal-polyfill`         |
| Backend        | Next.js Route Handlers and server-side services                     |
| Database       | SQLite                                                              |
| Authentication | Better Auth + Google OAuth                                          |
| ORM            | Drizzle ORM, Drizzle Kit, SQLite-compatible driver for the selected Node.js runtime |
| AI             | Vercel AI SDK 7: `ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible` |
| Validation     | Zod                                                                 |
| Data fetching  | TanStack Query, where client-side caching is needed                 |
| Forms          | React Hook Form, `@hookform/resolvers`                              |
| Dates          | `date-fns`                                                          |
| Notifications  | Sonner                                                              |
| Testing        | Vitest, Playwright                                                  |

FullCalendar plugins must use v7 imports such as `@fullcalendar/react/daygrid`, `/timegrid`, `/list`, and `/interaction`, rather than mixing v6 packages.

**Architecture:** Modular monolith. No microservices.

Keep database access, business rules, AI context retrieval, proposal validation, and mutation execution in dedicated modules.

Use server-side reads where appropriate; use TanStack Query for interactive client state rather than duplicating all server data into global stores.

Lock tested dependency versions in the package lockfile.

### Deployment and Access Boundary

- Run SQLite on persistent storage on the user's personal VPS. Select a compatible Node.js runtime/driver and handle backup and key recovery during deployment work; do not reopen the database decision.
- Initial external access is restricted by email through user-managed Cloudflare controls.
- Use Google OAuth + Better Auth for application login, with Cloudflare as the user-managed external email gate.
- Continue enforcing owner-scoped reads and writes, including references between records, even while the application is private.
- Protect application/API traffic from bypassing the configured access boundary. Exact Cloudflare and origin configuration must be established before deployment.
- Public signup, billing, collaboration, and other public-product infrastructure are not release requirements.

### Required AI Coding Skills

Install, if doesn't exist:

```
npx impeccable install
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices
npx skills add vercel/ai --skill ai-sdk
```

**Skill responsibilities:**

- **Impeccable:** UI direction, design system, critique, accessibility, responsiveness, and visual polish.
    
- **Vercel React Best Practices:** React architecture, rendering performance, data fetching, and bundle efficiency.
    
- **Vercel AI SDK Skill:** AI integration, model configuration, streaming, and structured tool use.
    

Initialize Impeccable's product/design documentation before major UI development. Apply its design and review workflows during implementation, not just at the end.

---

## 6. Data Model

Implement the following core entities.

|Entity|Required information|
|---|---|
|User|ID, authentication identity, preferences, timezone|
|Project|ID, owner, name, description, status, deadline, position, revision, archive/deletion metadata, timestamps|
|Task|ID, owner, project ID (nullable), title, description, status, priority, due date/time, estimate, blocker reason, position, revision, deletion metadata, creation/update/completion timestamps|
|TaskDependency|Task ID, prerequisite task ID|
|Event|ID, owner, linked project/task IDs (nullable), title, description, start/end, timezone, all-day flag, location, revision, deletion metadata, timestamps|
|CheckIn|ID, owner, project/task association, content, timestamp|
|Conversation|ID, owner, title, scope, timestamps|
|Message|ID, conversation ID, role, content, timestamp|
|AIProposal|ID, owner, source message, action, payload, rationale, expected record revisions, approval/execution identity, status, timestamps|
|ActivityLog|ID, owner, entity, action, actor, before/after state, timestamp|
|ModelConfig|ID, owner, name, base URL, encrypted key, model ID, active|
|WorkspaceSnapshot|ID, owner, source action, affected before/after record states, timestamp|

**Data constraints:**

- Every record must be scoped to its authenticated owner.
    
- Project association is optional for tasks.
    
- Event links are optional.
    
- Project deadlines are date-only values.
    
- Task deadlines support date-only or date-and-time.
    
- Timed events use consistent time-zone-aware storage.
    
- Deleting projects must not accidentally delete independent events.
    
- AI proposals are distinct from actual database records.
    
- Maintain referential integrity and auditable mutations.

- Child records inherit an authenticated owner through a verified parent or have an explicit owner. Cross-owner project, task, event, dependency, message, and proposal references are invalid.

- Workspace record mutations advance revisions used for proposal, Undo, and restoration conflict checks.

- Normal views, search, AI retrieval, and recommendations exclude soft-deleted records. Archived projects and their associated work are excluded from active-work views without changing child statuses.

- Project progress counts tasks that are neither soft-deleted nor hidden by archive; empty projects show 0%. Archive does not change child statuses.
    

---

## 7. AI Execution Architecture

Follow a deterministic pipeline:

**User Input → Intent → Context Retrieval → Model → Structured Proposal → Validation → Confirmation → Transactional Revalidation → Execution → Response**

### Implementation Requirements

1. Query only relevant workspace context rather than injecting the entire database into every prompt.
    
2. Use typed action schemas validated with Zod.
    
3. Resolve referenced record IDs against the authenticated user's data.
    
4. Perform database writes through controlled server functions.
    
5. Apply each approved selection atomically, including its required snapshot and successful activity records.
    
6. Make AI action execution idempotent with database-enforced uniqueness and transactional claiming; double approval or retries must not duplicate changes.
    
7. Record successful and failed executions appropriately.
    
8. Preserve proposal status: pending, approved, rejected, applied, stale, or failed. A stale proposal requires a refreshed preview and new approval; never replay its original approval.
    
9. Never treat model output as trusted executable instructions.
    
10. Keep manual features operational during model outages.

11. Revalidate record revisions, cascade membership, ownership, and constraints immediately before writing. Treat model output and record content as untrusted; workspace text cannot override tool permissions or approval rules.

12. Retrying an action after an uncertain network response must return its persisted outcome rather than executing it again. Failed transactions must leave no partial workspace changes.

13. Keep everyday chat token use small: retrieve only relevant records and fields, limit result sizes, and send only the conversation context needed for the current request. Do not resend the entire workspace and unlimited chat history on each turn.

14. Test real provider connections and bounded failure/retry behavior. A reconnect or retry must not lose saved records, duplicate actions, or silently reapply a completed mutation. Provider uptime is external; surface outages honestly rather than promising uninterrupted availability.
    

**Do not use LangChain, LangGraph, vector databases, or multi-agent orchestration for the MVP.** Vercel AI SDK is sufficient for the intended workflows.

The model's role is reasoning and proposing. The application's role is validating and executing.

---

## 8. Implementation Roadmap

Build in independently testable vertical slices. Do not attempt the entire application in one generation.

All four phases are required for release. Every slice must meet the global Definition of Done, including responsive and accessible interactions. Phase 4 improves an already usable web application; it is not the first mobile, accessibility, or failure-handling pass.

### Phase 1 — Functional Foundation

Build:

- Authentication and database.
    
- Main navigation and application shell.
    
- Projects Kanban.
    
- Project details.
    
- Tasks, Inbox, and task details.
    
- Dashboard.
    
- Basic activity logging.

- Project archiving, confirmed cascade soft deletion, and restoration according to the resolved lifecycle rules.
    

**Done when:** A user can manage complete project/task workflows without AI, and all data persists correctly.

### Phase 2 — Calendar and AI Infrastructure

Build:

- Unified calendar with distinct item types/colors.
    
- Event CRUD.
    
- Model configuration.
    
- AI chat.
    
- Workspace context retrieval.
    
- Read-only queries and basic write actions.
    
- Approval and validation pipeline.

- Revision conflict checks, database-enforced idempotency, safe Undo, and snapshots before enabling any multi-record AI changes.
    

**Done when:** A user can manage events and perform workspace queries and modifications through chat, with correct persistence and confirmation behavior.

### Phase 3 — Managerial Intelligence

Build:

- Progress check-ins.
    
- Follow-up task recommendations.
    
- Natural-language capture and cleanup.
    
- Recovery Mode.
    
- AI-based prioritization.
    

**Done when:** A user can report progress, approve suggested next steps, and recover from a neglected workspace.

### Phase 4 — Polish and Reliability

Build:

- Focus Mode.
    
- Task dependencies.
    
- Command palette.
    
- Daily planning.
    
- Bulk-change snapshot and restoration regression coverage; snapshot functionality already exists before bulk actions are enabled.
    
- Undo improvements.
    
- Mobile refinement.
    
- Accessibility and performance improvements.
    
- Comprehensive testing.
    

**Done when:** All supported workflows function reliably on desktop and mobile, including failure and recovery scenarios.

---

## 9. Non-Goals and Explicit Restrictions

**Do not implement in the MVP:**

- Team workspaces, collaborative editing, or role management.
    
- External calendar/email integrations.
    
- Notifications or scheduled background AI agents.
    
- Complex recurring tasks.
    
- Advanced analytics or productivity scoring.
    
- File management and document storage.
    
- Native mobile/desktop applications.
    
- Vector databases or persistent AI agent memory.
    
- Autonomous AI changes without appropriate approval.
    
- Microservices or unnecessary abstraction layers.
    
- Elaborate animation systems or GSAP-based page choreography.
    

**Engineering restrictions:**

- Do not create placeholder features that appear functional.
    
- Do not use mock data in production flows.
    
- Do not invent unrelated features beyond this PRD.
    
- Do not introduce new libraries when existing stack capabilities suffice.
    
- Do not duplicate business logic between frontend and backend.
    
- Do not use AI to calculate values obtainable deterministically from the database.
    
- Do not expose credentials or unsafe database operations.
    
- Do not prioritize visual polish over correctness.
    

Use the simplest implementation for minor engineering details that do not alter product behavior. If ambiguity affects user-visible behavior, data loss, access, release scope, or another material requirement, report it and resolve it with the user before proceeding.

---

## 10. Global Definition of Done

A feature is complete only when:

1. **Functional:** Its required user journey works end-to-end.
    
2. **Persistent:** Changes are correctly stored and survive refresh.
    
3. **Validated:** Invalid inputs and unauthorized actions are rejected.
    
4. **Integrated:** Related views reflect changes consistently.
    
5. **Responsive:** Usable on desktop and mobile.
    
6. **Accessible:** Keyboard interaction, labels, focus states, and adequate contrast are present.
    
7. **Resilient:** Loading, empty, error, and failure states are handled.
    
8. **Tested:** Appropriate unit/integration tests and critical end-to-end scenarios pass.
    
9. **Maintainable:** Code follows established architecture and avoids unnecessary complexity.
    
10. **Polished:** Relevant Impeccable critique/audit findings are resolved, without regressions.
    

**Mandatory checks:**

- TypeScript type checking passes.
    
- Linting passes.
    
- Relevant Vitest tests pass.
    
- Relevant Playwright flows pass.
    
- No known blocking console or runtime errors.
    
- No broken navigation or unfinished placeholder interactions.
    

### MVP Release Acceptance Scenarios

The application must successfully demonstrate:

1. Create a project, add tasks, change statuses, and refresh without losing changes.
    
2. Create a task using chat and verify that it appears in the appropriate project.
    
3. Query unfinished work through chat and receive results consistent with the database.
    
4. Report task progress and selectively approve generated next steps.
    
5. Leave a populated workspace inactive, trigger Recovery Mode, and apply an approved recovery plan.
    
6. Create and reschedule calendar events through both UI and chat.
    
7. Display project deadlines, task deadlines, and events with correct differentiated colors.
    
8. Reject AI proposals and confirm that no unintended records change.
    
9. Switch between configured AI models without modifying code.
    
10. Simulate AI failure and verify that manual management continues to work.
    
11. Verify cross-user record access is prevented.
    
12. Verify approved actions do not execute twice when requests are retried.

13. Verify single-record AI changes wait for approval; editing or rejecting a proposal causes no unapproved mutations.

14. Modify a record or cascade membership after preview, then approve the old proposal. Verify it is rejected as stale without partial changes.

15. Apply an approved bulk change, inspect its snapshot, and restore it. Verify restoration and Undo refuse to overwrite subsequent edits.

16. Archive/unarchive a project and confirm statuses are preserved and active-work views are consistent.

17. Preview and confirm a cascade soft deletion, then restore it. Verify unaffected and independently deleted records are not changed.

18. Verify dependencies reject self-references and cycles, and that Focus Mode, the command palette, global search, and daily planning work end-to-end.

19. Verify date-only deadlines remain on the intended date across timezones, and timed/all-day events follow the agreed date rules.

20. Complete critical project, task, calendar, chat, and recovery flows on desktop and mobile with accessible keyboard/touch alternatives to drag-and-drop.

21. Exercise everyday use with 15+ projects, 100+ tasks/events, and daily chat history. Verify the assistant uses relevant context rather than resending the whole workspace/history, and record token usage and connection failures during validation.

22. With no model configured, verify chat, AI recommendations, and daily planning explain the setup requirement while manual project/task/event management remains functional.

23. Complete a task and save a check-in without requesting AI assistance; verify neither action invokes AI or generates follow-up suggestions. Then ask the assistant for next steps based on completed work, review its suggestions, and approve one. Verify it is created once, without unsolicited extra tasks.
    

---

## 11. Instructions for AI Coding Agents

Treat this PRD as the authoritative product specification.

When implementing:

1. Understand the relevant requirements and existing code before editing.
    
2. Plan the smallest coherent vertical slice that delivers working functionality.
    
3. Reuse existing components, services, patterns, and design tokens.
    
4. Follow the specified libraries and installed skills.
    
5. Implement real behavior, including persistence and error handling.
    
6. Validate with appropriate tests and type checking.
    
7. Compare the implementation against the relevant Definition of Done.
    
8. Summarize completed work, tests, known limitations, and the next logical task.
    

**Implementation priorities:**

Correctness → Usability → Reliability → Design quality → Performance optimization.

Do not sacrifice correctness for rapid feature generation.

Do not rebuild working systems unnecessarily.

Do not add speculative infrastructure for future requirements.

Maintain concise implementation notes and update project documentation when architectural or product decisions change.

---

## 12. Final Product Goal

Relay should be a useful personal task manager tailored to the user's needs, with an AI assistant available to talk through and manage actual workspace data when requested.

It should make it easier to maintain and resume an organized workload than to abandon and rebuild it. One important supported experience is:

**A user returns after a week away, asks Relay what has happened and what they should do next, and receives an accurate, manageable plan that can be applied with minimal effort.**

Every major feature should contribute to that outcome.

This recovery example does not make Relay an autonomous manager or require a completion-to-next-task chain. Everyday manual task management and user-requested AI assistance are equally central.

---

## 13. Decision Record and Next Discussion

The PRD discussion is complete. Record the user's answers here without treating deferred deployment or workflow work as unresolved product decisions. Do not start workflow planning, slice planning, or implementation automatically after this discussion.

### D01 - Hosting, SQLite Operations, and Recovery

**Decided:** Personal VPS with SQLite. The user explicitly deferred deployment details. Runtime/driver selection, persistent paths, backups, and separate encryption-secret recovery belong to deployment work, not further product questions now. Do not silently omit safe persistence or key handling when deployment is implemented.

### D02 - Application Identity Behind Cloudflare

**Recorded:** Google OAuth + Better Auth handles application identity; the user controls email access through Cloudflare. This does not add a second app-level email allowlist or remove owner checks. Public signup remains future work.

### D03 - Required AI Providers and Local Gateways

**Decided:** The user's AI endpoints are available over public HTTPS; no local/private gateway exception is needed. Preserve URL validation, safe handling of invalid model output, connection testing, and model switching. Actual connection details can be provided through Settings when testing; they are not needed to finish this discussion.

### D04 - Archive, Cascade, Trash, and Restoration Boundaries

**Decided:** Deleting a parent soft-deletes its children, with a preview and confirmation. A project includes its tasks, linked events, and associated check-ins; a task includes its linked events and associated check-ins. Events with no project/task parent are independent. A task dependency is a reference, not ownership of another task. Preserve activity/audit history. Deleting a conversation removes its messages but not separately stored check-ins or applied workspace changes.

Project archive hides associated work from active views without changing child statuses; standalone task/event archive controls are not additional release requirements. Keep deleted records recoverable without automatic permanent purge in this release. Restore only records changed by that deletion operation; revalidate links, cycle constraints, and conflicts with later work.

### D05 - Date, Time, and Scheduling Defaults

**Decided:** Start with Asia/Jakarta and Monday, both configurable. Date-only tasks become overdue after their local calendar day ends; store date-only values without UTC conversion. Timed records preserve an instant and an IANA timezone. Interpret relative dates in the user's timezone; ask when the intended date/time is unclear. Offer a visible 60-minute duration when an event end is omitted, requiring approval. All-day ranges use an exclusive end date. Dragging a deadline changes its date without adding duration or changing its type; moving a timed event preserves its duration.

### D06 - Status, Dependency, and Progress Semantics

**Decided:** Warn, but allow confirmed project completion without modifying task statuses. Dependencies give warnings, not automatic status changes or hard blocking; self-links, cross-owner links, and cycles remain forbidden. Compute progress from tasks that are not deleted or hidden by archive; empty projects show 0%. Set completion time on entering Done and clear it on reopening; preserve history in the activity log. Store effort as positive whole minutes.

### D07 - Next Up and Daily Planning

**Decided:** AI is required for chat, next-action recommendations, and daily planning. If no model is provided, these features do not run and must explain how to configure a model. Do not implement a non-AI recommendation/planning fallback. Manual database-backed management still works without AI. The exact planning interaction belongs to the separate workflow discussion; any resulting workspace changes still require approval.

### D08 - User-Requested Next Actions and Recovery

**Decided and corrected:** Relay is a personal task manager with an AI the user can talk to. Suggesting direct next actions from recently completed tasks is one AI capability, used when the user asks. Completing a task does not automatically request suggestions or create a next-action chain. There is no minimum number of follow-ups per completed task. Suggestions are optional to accept and require approval before changing workspace records.

**Separate workflow discussion:** Discuss how the user requests assistance, how the assistant selects relevant workspace context, how suggestions and approvals are presented, and how recovery fits ordinary task management. Keep factual summaries grounded in saved records and reuse existing tasks when appropriate. The user explicitly requested this discussion before slices or implementation.

### D09 - Adding a Quick Note Without Creating the Wrong Tasks

**Decided:** If the user types "Fix login and write tests," an ordinary Add Task button saves one task with that exact title. An "Organize with AI" action shows two suggested tasks to approve first. If a task called "Fix login" already exists, show it before adding another one; the user can still choose to create a separate task. If two projects have the same name, ask which one instead of guessing. With no model configured, ordinary Add Task still works and Organize with AI shows the setup requirement.

### D10 - Undo Scope, Lifetime, and Partial Approval

**Decided:** Undo is required. Persist recoverable history for create, edit, move, reorder, reschedule, archive, and soft-delete operations; no automatic history expiry in this release. A brief Undo toast is only a shortcut to the same history operation. Undoing creation of a record with later children is a conflict, not permission for a new silent cascade. Explain incomplete action selections and let the user revise them rather than approving extra actions silently. Apply an approved selection as one transaction.

### D11 - Conversation Scope and Check-in Associations

**Decided:** The panel and Chat page open the same selected conversation. New conversations started from a project default to that project; looking at other projects requires an explicit workspace-wide request. A check-in may link to a project or task; a task's project is derived rather than duplicated. Manual check-in submission requires a selected association. Deleting chat history never deletes separately saved check-ins, applied changes, or audit history.

### D12 - Measurable Release Validation

**Decided:** Support 15+ projects, 100+ tasks/events, and daily chat usage with restrained token consumption, reliable provider connections, and infrequent timeouts/reconnects.

Use this workload in release validation. Record tokens per request and connection failures; investigate excessive context or repeated unnecessary requests. Provider uptime is not controlled by Relay: failures must be clear and recoverable without lost records or duplicate actions. Numeric timeout, context, and retry limits are implementation/test-plan choices to state and verify later, not invented user-approved guarantees.

### Discussion Boundary

Use plain language in future questions. The PRD discussion is finished: tell the user and stop. The next discussion is the workflow/loop pipeline; only after that should slices and implementation be planned with the user.
