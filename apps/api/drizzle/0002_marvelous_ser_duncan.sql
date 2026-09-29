ALTER TABLE `stages` ADD `review_type` text NOT NULL;--> statement-breakpoint
ALTER TABLE `stages` ADD `review_prompt` text;--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `requirement`;--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `review_standard`;--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `image_count`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `review_standard`;