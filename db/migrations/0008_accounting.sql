CREATE TABLE `account_categories` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`name` varchar(80) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `account_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_categories_type_name_key` UNIQUE(`type`,`name`),
	CONSTRAINT `account_categories_name_check` CHECK(char_length(trim(`account_categories`.`name`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `accounting_log` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`entity` enum('receipt','payment') NOT NULL,
	`entity_id` char(36) NOT NULL,
	`action` enum('void','approve','pay') NOT NULL,
	`reason` varchar(300),
	`by` char(36) NOT NULL,
	`at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `accounting_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`name` varchar(120) NOT NULL,
	`event_date` date,
	`budget` decimal(12,2),
	`status` enum('planned','ongoing','closed') NOT NULL DEFAULT 'planned',
	`notes` text,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_name_check` CHECK(char_length(trim(`events`.`name`)) > 0),
	CONSTRAINT `events_budget_check` CHECK(`events`.`budget` is null or `events`.`budget` >= 0)
);
--> statement-breakpoint
CREATE TABLE `opening_balances` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`as_on_date` date NOT NULL,
	`cash` decimal(12,2) NOT NULL DEFAULT '0.00',
	`bank` decimal(12,2) NOT NULL DEFAULT '0.00',
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `opening_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `opening_balances_date_key` UNIQUE(`as_on_date`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`voucher_no` varchar(20) NOT NULL,
	`payment_date` date NOT NULL,
	`paid_to` varchar(120) NOT NULL,
	`category_id` char(36) NOT NULL,
	`event_id` char(36),
	`amount` decimal(12,2) NOT NULL,
	`payment_mode` enum('cash','bank','online') NOT NULL,
	`reference_no` varchar(60),
	`remarks` varchar(300),
	`bill_path` varchar(200),
	`bill_type` varchar(40),
	`requested_by` char(36) NOT NULL,
	`approved_by` char(36),
	`approved_at` datetime(3),
	`paid_at` datetime(3),
	`status` enum('draft','approved','paid','void') NOT NULL DEFAULT 'draft',
	`void_reason` varchar(300),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_no_key` UNIQUE(`voucher_no`),
	CONSTRAINT `payments_amount_check` CHECK(`payments`.`amount` > 0),
	CONSTRAINT `payments_void_reason_check` CHECK(`payments`.`status` <> 'void' or char_length(trim(coalesce(`payments`.`void_reason`, ''))) > 0),
	CONSTRAINT `payments_paid_to_check` CHECK(char_length(trim(`payments`.`paid_to`)) > 0)
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`receipt_no` varchar(20) NOT NULL,
	`receipt_date` date NOT NULL,
	`received_from_type` enum('student','teacher','other') NOT NULL,
	`student_id` char(36),
	`teacher_id` char(36),
	`received_from_name` varchar(120) NOT NULL,
	`class_id` char(36),
	`category_id` char(36) NOT NULL,
	`event_id` char(36),
	`amount` decimal(12,2) NOT NULL,
	`payment_mode` enum('cash','bank','online') NOT NULL,
	`reference_no` varchar(60),
	`remarks` varchar(300),
	`collected_by` char(36) NOT NULL,
	`status` enum('active','void') NOT NULL DEFAULT 'active',
	`void_reason` varchar(300),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `receipts_no_key` UNIQUE(`receipt_no`),
	CONSTRAINT `receipts_amount_check` CHECK(`receipts`.`amount` > 0),
	CONSTRAINT `receipts_void_reason_check` CHECK(`receipts`.`status` <> 'void' or char_length(trim(coalesce(`receipts`.`void_reason`, ''))) > 0),
	CONSTRAINT `receipts_payer_check` CHECK((`receipts`.`received_from_type` = 'student' and `receipts`.`student_id` is not null)
    or (`receipts`.`received_from_type` = 'teacher' and `receipts`.`teacher_id` is not null)
    or (`receipts`.`received_from_type` = 'other' and `receipts`.`student_id` is null and `receipts`.`teacher_id` is null)),
	CONSTRAINT `receipts_name_check` CHECK(char_length(trim(`receipts`.`received_from_name`)) > 0)
);
--> statement-breakpoint
ALTER TABLE `school_settings` ADD `currency_code` char(3) DEFAULT 'SAR' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_settings` ADD `currency_symbol` varchar(8) DEFAULT 'SAR' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_categories` ADD CONSTRAINT `account_categories_created_by_profiles_id_fk` FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_categories` ADD CONSTRAINT `account_categories_updated_by_profiles_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_log` ADD CONSTRAINT `accounting_log_by_profiles_id_fk` FOREIGN KEY (`by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_created_by_profiles_id_fk` FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_updated_by_profiles_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opening_balances` ADD CONSTRAINT `opening_balances_created_by_profiles_id_fk` FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opening_balances` ADD CONSTRAINT `opening_balances_updated_by_profiles_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_category_id_account_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `account_categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_requested_by_profiles_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_approved_by_profiles_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_created_by_profiles_id_fk` FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_updated_by_profiles_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_teacher_id_profiles_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_category_id_account_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `account_categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_collected_by_profiles_id_fk` FOREIGN KEY (`collected_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_created_by_profiles_id_fk` FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_updated_by_profiles_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `accounting_log_entity_idx` ON `accounting_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`event_date`);--> statement-breakpoint
CREATE INDEX `payments_date_idx` ON `payments` (`payment_date`);--> statement-breakpoint
CREATE INDEX `payments_category_idx` ON `payments` (`category_id`);--> statement-breakpoint
CREATE INDEX `payments_event_idx` ON `payments` (`event_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `receipts_date_idx` ON `receipts` (`receipt_date`);--> statement-breakpoint
CREATE INDEX `receipts_student_idx` ON `receipts` (`student_id`);--> statement-breakpoint
CREATE INDEX `receipts_teacher_idx` ON `receipts` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `receipts_class_date_idx` ON `receipts` (`class_id`,`receipt_date`);--> statement-breakpoint
CREATE INDEX `receipts_category_idx` ON `receipts` (`category_id`);--> statement-breakpoint
CREATE INDEX `receipts_event_idx` ON `receipts` (`event_id`);--> statement-breakpoint
CREATE INDEX `receipts_collected_by_idx` ON `receipts` (`collected_by`);