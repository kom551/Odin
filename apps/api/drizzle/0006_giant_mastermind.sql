DROP INDEX `progress_task_user_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `progress_task_unique` ON `progress` (`task_id`);--> statement-breakpoint
ALTER TABLE `progress` DROP COLUMN `user_id`;--> statement-breakpoint
DROP INDEX `submissions_stage_user_idx`;--> statement-breakpoint
CREATE INDEX `submissions_stage_idx` ON `submissions` (`stage_id`);--> statement-breakpoint
ALTER TABLE `submissions` DROP COLUMN `user_id`;