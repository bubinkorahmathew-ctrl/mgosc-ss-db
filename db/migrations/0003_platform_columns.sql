-- The school's time zone (Asia/Riyadh); forced password change and last sign-in on logins;
-- number_counters gets a free-text `name` (copied from `kind`, which 0004 drops).
ALTER TABLE `number_counters` ADD `name` varchar(20);--> statement-breakpoint
ALTER TABLE `school_settings` ADD `timezone` varchar(64) DEFAULT 'Asia/Riyadh' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` datetime(3);--> statement-breakpoint
UPDATE `number_counters` SET `name` = `kind`;
