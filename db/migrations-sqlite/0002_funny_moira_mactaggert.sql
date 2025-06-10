CREATE INDEX `idx_status_created` ON `tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_dependant_on` ON `tasks` (`dependant_on`);--> statement-breakpoint
CREATE INDEX `idx_project_status` ON `tasks` (`project_id`,`status`);