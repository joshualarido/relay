CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`timezone` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`deletion_operation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_owner_idx` ON `event` (`owner_id`);