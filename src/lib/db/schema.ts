import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const preferences = sqliteTable("preferences", {
  userId: text("user_id").primaryKey().references(() => user.id),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  weekStart: integer("week_start").notNull().default(1),
  revision: integer("revision").notNull().default(1),
});

export const project = sqliteTable("project", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["Planned", "Active", "Paused", "Done"] }).notNull().default("Planned"),
  deadline: text("deadline"),
  position: integer("position").notNull().default(0),
  revision: integer("revision").notNull().default(1),
  archivedAt: text("archived_at"),
  deletedAt: text("deleted_at"),
  deletionOperationId: text("deletion_operation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("project_owner_idx").on(t.ownerId)]);

export type Project = typeof project.$inferSelect;

export const task = sqliteTable("task", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  projectId: text("project_id").references(() => project.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Physical SQLite default is still 'Backlog' (changing it needs a table rebuild, deferred to the later cleanup);
  // every app insert (createTask) sets status explicitly via the Zod default "To do".
  status: text("status", { enum: ["To do", "Done"] }).notNull().default("To do"),
  // dormant (v3): priority is not part of the v3 model.
  // ponytail: retain legacy priority for old snapshots/replays; remove only with a versioned history migration.
  priority: text("priority", { enum: ["Low", "Medium", "High"] }).notNull().default("Medium"),
  important: integer("important", { mode: "boolean" }),
  // dormant (v3): urgent is not part of the v3 model.
  urgent: integer("urgent", { mode: "boolean" }),
  // dormant (v3): planned dates are task-linked all-day events since migration 0008; kept for old snapshots.
  plannedDate: text("planned_date"),
  dueDate: text("due_date"),
  dueAt: text("due_at"),
  startAt: text("start_at"),
  endAt: text("end_at"),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  timezone: text("timezone"),
  // dormant (v3): estimates are not part of the v3 model.
  estimateMinutes: integer("estimate_minutes"),
  // dormant (v3): Blocked status folded into Doing; reason kept for history.
  blockerReason: text("blocker_reason").notNull().default(""),
  completedAt: text("completed_at"),
  position: integer("position").notNull().default(0),
  revision: integer("revision").notNull().default(1),
  archivedAt: text("archived_at"),
  deletedAt: text("deleted_at"),
  deletionOperationId: text("deletion_operation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("task_owner_project_idx").on(t.ownerId, t.projectId)]);

export type Task = typeof task.$inferSelect;

export const event = sqliteTable("event", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  projectId: text("project_id").references(() => project.id),
  taskId: text("task_id").references(() => task.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  start: text("start").notNull(),
  end: text("end").notNull(),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  timezone: text("timezone").notNull(),
  location: text("location").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  deletedAt: text("deleted_at"),
  deletionOperationId: text("deletion_operation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("event_owner_idx").on(t.ownerId)]);

export type Event = typeof event.$inferSelect;

// dormant (v3): check-ins are not part of the v3 model; table kept for history.
export const checkIn = sqliteTable("check_in", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  projectId: text("project_id").references(() => project.id),
  taskId: text("task_id").references(() => task.id),
  content: text("content").notNull(),
  revision: integer("revision").notNull().default(1),
  deletedAt: text("deleted_at"),
  deletionOperationId: text("deletion_operation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("check_in_owner_idx").on(t.ownerId)]);

// dormant (v3): dependencies are not part of the v3 model; table kept for history.
export const dependency = sqliteTable("dependency", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  taskId: text("task_id").notNull().references(() => task.id),
  prerequisiteId: text("prerequisite_id").notNull().references(() => task.id),
  revision: integer("revision").notNull().default(1),
  deletedAt: text("deleted_at"),
  deletionOperationId: text("deletion_operation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("dependency_owner_idx").on(t.ownerId)]);

export type CheckIn = typeof checkIn.$inferSelect;
export type Dependency = typeof dependency.$inferSelect;
export type Snapshot = { entityType: "project"; record: Project } | { entityType: "task"; record: Task } |
  { entityType: "event"; record: Event } | { entityType: "check-in"; record: CheckIn } | { entityType: "dependency"; record: Dependency };

export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  mutationId: text("mutation_id").notNull(),
  requestHash: text("request_hash").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeState: text("before_state", { mode: "json" }).$type<Snapshot[]>().notNull(),
  afterState: text("after_state", { mode: "json" }).$type<Snapshot[]>().notNull(),
  result: text("result", { mode: "json" }).$type<unknown>().notNull(),
  createdAt: text("created_at").notNull(),
  undoneAt: text("undone_at"),
}, (t) => [
  uniqueIndex("activity_owner_mutation_idx").on(t.ownerId, t.mutationId),
  index("activity_owner_idx").on(t.ownerId),
]);
