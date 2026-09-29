CREATE TABLE `progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`current_stage_order` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`pass_code` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_task_user_unique` ON `progress` (`task_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_task_passcode_unique` ON `progress` (`task_id`,`pass_code`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`order` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`requirement` text,
	`review_standard` text NOT NULL,
	`image_count` integer DEFAULT 1 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stages_task_id_order_unique` ON `stages` (`task_id`,`order`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`stage_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`images` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ai_result` text,
	`auto_rejected` integer DEFAULT false NOT NULL,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submissions_stage_user_idx` ON `submissions` (`stage_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `submissions_status_idx` ON `submissions` (`status`);--> statement-breakpoint
CREATE INDEX `submissions_created_at_idx` ON `submissions` (`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`cover_url` text,
	`review_standard` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`pass_score` real DEFAULT 0.6 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL
);
