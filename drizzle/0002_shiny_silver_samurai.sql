CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Backlog' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`due_date` text,
	`due_at` text,
	`timezone` text,
	`estimate_minutes` integer,
	`blocker_reason` text DEFAULT '' NOT NULL,
	`completed_at` text,
	`position` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`deletion_operation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_owner_project_idx` ON `task` (`owner_id`,`project_id`);