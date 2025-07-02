PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`tasks` text,
	`params` text,
	`location` text,
	`type` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	`project_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_generations`("id", "tasks", "params", "location", "type", "created_at", "updated_at", "project_id") SELECT "id", "tasks", "params", "location", "type", "created_at", "updated_at", "project_id" FROM `generations`;--> statement-breakpoint
DROP TABLE `generations`;--> statement-breakpoint
ALTER TABLE `__new_generations` RENAME TO `generations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`aspect_ratio` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "name", "user_id", "aspect_ratio", "created_at") SELECT "id", "name", "user_id", "aspect_ratio", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE TABLE `__new_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_resources`("id", "user_id", "type", "metadata", "created_at") SELECT "id", "user_id", "type", "metadata", "created_at" FROM `resources`;--> statement-breakpoint
DROP TABLE `resources`;--> statement-breakpoint
ALTER TABLE `__new_resources` RENAME TO `resources`;--> statement-breakpoint
CREATE TABLE `__new_shots` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text,
	`project_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shots`("id", "name", "created_at", "updated_at", "project_id") SELECT "id", "name", "created_at", "updated_at", "project_id" FROM `shots`;--> statement-breakpoint
DROP TABLE `shots`;--> statement-breakpoint
ALTER TABLE `__new_shots` RENAME TO `shots`;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`params` text NOT NULL,
	`status` text DEFAULT 'Queued' NOT NULL,
	`dependant_on` text,
	`output_location` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	`project_id` text NOT NULL,
	`generation_processed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "task_type", "params", "status", "dependant_on", "output_location", "created_at", "updated_at", "project_id", "generation_processed_at") SELECT "id", "task_type", "params", "status", "dependant_on", "output_location", "created_at", "updated_at", "project_id", "generation_processed_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `idx_status_created` ON `tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_dependant_on` ON `tasks` (`dependant_on`);--> statement-breakpoint
CREATE INDEX `idx_project_status` ON `tasks` (`project_id`,`status`);