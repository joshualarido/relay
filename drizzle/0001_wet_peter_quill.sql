CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_state` text NOT NULL,
	`after_state` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_owner_mutation_idx` ON `activity` (`owner_id`,`mutation_id`);--> statement-breakpoint
CREATE INDEX `activity_owner_idx` ON `activity` (`owner_id`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Planned' NOT NULL,
	`deadline` text,
	`position` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`deletion_operation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_owner_idx` ON `project` (`owner_id`);