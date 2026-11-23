ALTER TABLE `day_working_hours_override` ADD `hours` real;
--> statement-breakpoint
UPDATE `day_working_hours_override` SET `hours` = MIN(24.0, MAX(0.5, ROUND(((CAST(substr(`end`, 1, 2) AS REAL) * 60 + CAST(substr(`end`, 4, 2) AS REAL)) - (CAST(substr(`start`, 1, 2) AS REAL) * 60 + CAST(substr(`start`, 4, 2) AS REAL))) / 30.0) / 2.0));
