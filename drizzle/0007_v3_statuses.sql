UPDATE `task` SET `status` = CASE `status` WHEN 'Backlog' THEN 'To do' WHEN 'Next' THEN 'To do' WHEN 'In Progress' THEN 'Doing' WHEN 'Blocked' THEN 'Doing' ELSE `status` END WHERE `status` IN ('Backlog', 'Next', 'In Progress', 'Blocked');--> statement-breakpoint
UPDATE `project` SET `status` = CASE `status` WHEN 'Completed' THEN 'Done' ELSE `status` END WHERE `status` = 'Completed';
