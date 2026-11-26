CREATE TABLE `login_attempts` (
	`id` char(36) NOT NULL,
	`account_key` char(64) NOT NULL,
	`device_key` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `profiles` MODIFY COLUMN `role` enum('headmaster','teacher','ovbs_teacher') NOT NULL DEFAULT 'teacher';--> statement-breakpoint
CREATE INDEX `login_attempts_pair_idx` ON `login_attempts` (`account_key`,`device_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_account_idx` ON `login_attempts` (`account_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_device_idx` ON `login_attempts` (`device_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_created_idx` ON `login_attempts` (`created_at`);