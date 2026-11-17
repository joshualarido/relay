CREATE TABLE `check_in` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`content` text NOT NULL,
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
CREATE INDEX `check_in_owner_idx` ON `check_in` (`owner_id`);--> statement-breakpoint
CREATE TABLE `dependency` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`task_id` text NOT NULL,
	`prerequisite_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`deletion_operation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prerequisite_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dependency_owner_idx` ON `dependency` (`owner_id`);