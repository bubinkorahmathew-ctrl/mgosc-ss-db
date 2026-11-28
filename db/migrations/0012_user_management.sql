CREATE TABLE `audit_log` (
	`id` char(36) NOT NULL,
	`actor_id` char(36),
	`target_id` char(36),
	`action` varchar(40) NOT NULL,
	`details` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `profiles` MODIFY COLUMN `role` enum('headmaster','super_admin','admin','teacher','ovbs_teacher') NOT NULL DEFAULT 'teacher';--> statement-breakpoint
UPDATE `profiles` SET `role` = 'super_admin' WHERE `role` = 'headmaster' AND `is_super` = true;--> statement-breakpoint
UPDATE `profiles` SET `role` = 'admin' WHERE `role` = 'headmaster';--> statement-breakpoint
ALTER TABLE `profiles` MODIFY COLUMN `role` enum('super_admin','admin','teacher','ovbs_teacher') NOT NULL DEFAULT 'teacher';--> statement-breakpoint
ALTER TABLE `class_teachers` ADD `is_class_teacher` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `class_teachers` ADD `created_at` datetime(3) DEFAULT (current_timestamp(3)) NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `designation` enum('vicar','hm','assistant_hm','acting_hm','teacher','technical_admin');--> statement-breakpoint
ALTER TABLE `profiles` ADD `admin_access_until` datetime(3);--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actor_id_profiles_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_target_id_profiles_id_fk` FOREIGN KEY (`target_id`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);