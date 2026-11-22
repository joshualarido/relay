ALTER TABLE `preferences` ADD `working_hours_json` text;
--> statement-breakpoint
ALTER TABLE `preferences` ADD `task_type_minutes_json` text;
--> statement-breakpoint
CREATE TABLE `day_working_hours_override` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`start` text DEFAULT '09:00' NOT NULL,
	`end` text DEFAULT '17:00' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_wh_override_owner_date_idx` ON `day_working_hours_override` (`owner_id`,`date`);
--> statement-breakpoint
ALTER TABLE `task` ADD `execution_date` text;
--> statement-breakpoint
ALTER TABLE `task` ADD `day_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `task` ADD `recurrence_rule` text;
--> statement-breakpoint
ALTER TABLE `task` ADD `recurrence_series_id` text;
--> statement-breakpoint
ALTER TABLE `project` ADD `deadline_at` text;
--> statement-breakpoint
ALTER TABLE `project` ADD `deadline_timezone` text;
--> statement-breakpoint
UPDATE `task` SET `execution_date` = CASE
	WHEN `start_at` IS NOT NULL AND length(`start_at`) >= 10 THEN substr(`start_at`, 1, 10)
	WHEN `due_date` IS NOT NULL THEN `due_date`
	ELSE NULL
END WHERE `execution_date` IS NULL;
