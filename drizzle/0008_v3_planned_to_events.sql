INSERT INTO `event` (`id`, `owner_id`, `project_id`, `task_id`, `title`, `start`, `end`, `all_day`, `timezone`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+abs(random())%4,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
  `task`.`owner_id`, NULL, `task`.`id`, `task`.`title`, `task`.`planned_date`, date(`task`.`planned_date`, '+1 day'), 1,
  COALESCE((SELECT `p`.`timezone` FROM `preferences` `p` WHERE `p`.`user_id` = `task`.`owner_id`), 'Asia/Jakarta'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `task`
WHERE `task`.`planned_date` IS NOT NULL AND `task`.`deleted_at` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `event` `e` WHERE `e`.`owner_id` = `task`.`owner_id` AND `e`.`task_id` = `task`.`id`
    AND `e`.`all_day` = 1 AND `e`.`start` = `task`.`planned_date` AND `e`.`deleted_at` IS NULL);--> statement-breakpoint
UPDATE `task` SET `planned_date` = NULL WHERE `planned_date` IS NOT NULL;
