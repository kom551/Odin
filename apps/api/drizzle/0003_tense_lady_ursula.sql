DROP INDEX `progress_task_passcode_unique`;--> statement-breakpoint
ALTER TABLE `progress` DROP COLUMN `pass_code`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `pass_code` text;