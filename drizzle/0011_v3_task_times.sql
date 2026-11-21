ALTER TABLE `task` ADD `start_at` text;
--> statement-breakpoint
ALTER TABLE `task` ADD `end_at` text;
--> statement-breakpoint
ALTER TABLE `task` ADD `all_day` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `task` SET `start_at` = `due_date`, `end_at` = date(`due_date`, '+1 day'), `all_day` = 1 WHERE `due_date` IS NOT NULL AND `start_at` IS NULL;
