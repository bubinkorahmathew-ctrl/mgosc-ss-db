CREATE TABLE `academic_years` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`name` varchar(255) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`is_current` boolean NOT NULL DEFAULT false,
	`current_key` tinyint GENERATED ALWAYS AS (if(`is_current`, 1, null)) VIRTUAL,
	CONSTRAINT `academic_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `academic_years_name_key` UNIQUE(`name`),
	CONSTRAINT `academic_years_one_current` UNIQUE(`current_key`)
);
--> statement-breakpoint
CREATE TABLE `class_teachers` (
	`class_id` char(36) NOT NULL,
	`teacher_id` char(36) NOT NULL,
	CONSTRAINT `class_teachers_class_id_teacher_id_pk` PRIMARY KEY(`class_id`,`teacher_id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`name` varchar(255) NOT NULL,
	`section` varchar(255),
	`section_key` varchar(255) GENERATED ALWAYS AS (coalesce(`section`, '')) VIRTUAL,
	`academic_year_id` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `classes_unique_name` UNIQUE(`academic_year_id`,`name`,`section_key`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`name` varchar(255) NOT NULL,
	`class_id` char(36) NOT NULL,
	`academic_year_id` char(36) NOT NULL,
	`exam_date` date,
	`weight` decimal(5,2) NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `grade_scales` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`min_percent` decimal(5,2) NOT NULL,
	`max_percent` decimal(5,2) NOT NULL,
	`grade` varchar(8) NOT NULL,
	`grade_point` decimal(4,2),
	`remark` varchar(60),
	`is_pass` boolean NOT NULL DEFAULT true,
	CONSTRAINT `grade_scales_id` PRIMARY KEY(`id`),
	CONSTRAINT `grade_scales_grade_key` UNIQUE(`grade`)
);
--> statement-breakpoint
CREATE TABLE `number_counters` (
	`kind` enum('admission','certificate') NOT NULL,
	`year` int NOT NULL,
	`last_value` int NOT NULL DEFAULT 0,
	CONSTRAINT `number_counters_kind_year_pk` PRIMARY KEY(`kind`,`year`)
);
--> statement-breakpoint
CREATE TABLE `prayer_units` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`name` varchar(120) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `prayer_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `prayer_units_name_key` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `school_settings` (
	`id` int NOT NULL DEFAULT 1,
	`school_name` varchar(255) NOT NULL DEFAULT 'Sunday School',
	`address` text,
	`logo_url` text,
	`headmaster_name` text,
	`vicar_name` varchar(120),
	`signature_url` text,
	`vicar_signature_url` text,
	`certificate_wording` json NOT NULL,
	`nav_icons` json,
	`attendance_topper_min_pct` tinyint NOT NULL DEFAULT 50,
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `school_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`name` varchar(255) NOT NULL,
	`max_marks` decimal(6,2) NOT NULL DEFAULT 100,
	`pass_percent` decimal(5,2) NOT NULL DEFAULT 40,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `subjects_name_key` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` char(36) NOT NULL,
	`full_name` varchar(120) NOT NULL,
	`phone` text,
	`twelfth_passed_year` smallint,
	`role` enum('headmaster','teacher') NOT NULL DEFAULT 'teacher',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`is_super` boolean NOT NULL DEFAULT false,
	CONSTRAINT `profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`full_name` varchar(120) NOT NULL,
	`full_name_ml` varchar(120),
	`dob` date NOT NULL,
	`gender` enum('male','female') NOT NULL,
	`father_name` text NOT NULL,
	`father_phone` varchar(16) NOT NULL,
	`mother_name` text,
	`guardian_phone` text NOT NULL,
	`email` varchar(254),
	`address` text,
	`baptised` boolean NOT NULL DEFAULT false,
	`school_class` varchar(255) NOT NULL,
	`school_name` text,
	`prayer_group` varchar(120),
	`prayer_unit_id` char(36) NOT NULL,
	`baptism_name` varchar(120),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`submitted_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`reviewed_by` char(36),
	`reviewed_at` datetime(3),
	`review_note` text,
	`student_id` char(36),
	CONSTRAINT `registrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`admission_no` varchar(32) NOT NULL,
	`full_name` varchar(120) NOT NULL,
	`full_name_ml` varchar(120),
	`dob` date NOT NULL,
	`gender` enum('male','female') NOT NULL,
	`father_name` text NOT NULL,
	`father_phone` varchar(16) NOT NULL,
	`mother_name` text,
	`guardian_phone` text NOT NULL,
	`email` varchar(254),
	`address` text,
	`baptised` boolean NOT NULL DEFAULT false,
	`school_class` varchar(255) NOT NULL,
	`school_name` text,
	`prayer_group` varchar(120),
	`prayer_unit_id` char(36) NOT NULL,
	`baptism_name` varchar(120),
	`photo_url` text,
	`status` enum('active','inactive','passed_out') NOT NULL DEFAULT 'active',
	`inactive_reason` varchar(200),
	`class_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_admission_no_key` UNIQUE(`admission_no`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(254) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`password_changed_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_key` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `activities` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`class_id` char(36) NOT NULL,
	`student_id` char(36),
	`type` enum('competition','memory_verse','event','note') NOT NULL,
	`title` varchar(200) NOT NULL,
	`activity_date` date NOT NULL,
	`score` decimal(8,2),
	`notes` text,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`student_id` char(36) NOT NULL,
	`class_id` char(36) NOT NULL,
	`date` date NOT NULL,
	`status` enum('present','absent','late') NOT NULL,
	`remark` varchar(200),
	`marked_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_student_date_key` UNIQUE(`student_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`certificate_no` varchar(32) NOT NULL,
	`student_id` char(36) NOT NULL,
	`type` enum('completion','merit','attendance','participation','memory_verse','custom') NOT NULL,
	`title` text NOT NULL,
	`body_text` text NOT NULL,
	`academic_year_id` char(36) NOT NULL,
	`exam_id` char(36),
	`activity_id` char(36),
	`student_name` varchar(120) NOT NULL,
	`student_name_ml` varchar(120),
	`class_name` text NOT NULL,
	`class_id` char(36),
	`year_name` text NOT NULL,
	`class_teacher_name` text,
	`issued_on` date NOT NULL,
	`issued_by` char(36),
	`revoked` boolean NOT NULL DEFAULT false,
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `certificates_id` PRIMARY KEY(`id`),
	CONSTRAINT `certificates_no_key` UNIQUE(`certificate_no`)
);
--> statement-breakpoint
CREATE TABLE `exam_attendance` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`exam_id` char(36) NOT NULL,
	`student_id` char(36) NOT NULL,
	`status` enum('present','absent') NOT NULL,
	`remark` varchar(200),
	`marked_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `exam_attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_attendance_unique` UNIQUE(`exam_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `marks` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`exam_id` char(36) NOT NULL,
	`student_id` char(36) NOT NULL,
	`subject_id` char(36) NOT NULL,
	`marks_obtained` decimal(6,2) NOT NULL,
	`is_absent` boolean NOT NULL DEFAULT false,
	`remarks` text,
	`entered_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `marks_id` PRIMARY KEY(`id`),
	CONSTRAINT `marks_exam_student_subject_key` UNIQUE(`exam_id`,`student_id`,`subject_id`)
);
--> statement-breakpoint
CREATE TABLE `toppers` (
	`id` char(36) NOT NULL DEFAULT (uuid()),
	`class_id` char(36) NOT NULL,
	`academic_year_id` char(36) NOT NULL,
	`exam_id` char(36),
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`type` enum('marks','attendance') NOT NULL,
	`student_id` char(36) NOT NULL,
	`value` decimal(6,2) NOT NULL,
	`confirmed_by` char(36),
	`confirmed_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `toppers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branding_images` (
	`kind` enum('signature','vicar_signature') NOT NULL,
	`mime` enum('image/png','image/jpeg') NOT NULL,
	`data` mediumblob NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `branding_images_kind` PRIMARY KEY(`kind`)
);
--> statement-breakpoint
CREATE TABLE `registration_attempts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`ip_hash` varchar(128) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	CONSTRAINT `registration_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` char(64) NOT NULL,
	`user_id` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (current_timestamp(3)),
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `sign_in_attempts` (
	`id` char(36) NOT NULL,
	`account_key` char(64) NOT NULL,
	`ip_key` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `sign_in_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `class_teachers` ADD CONSTRAINT `class_teachers_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_teachers` ADD CONSTRAINT `class_teachers_teacher_id_profiles_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_academic_year_id_academic_years_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_academic_year_id_academic_years_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_prayer_unit_id_prayer_units_id_fk` FOREIGN KEY (`prayer_unit_id`) REFERENCES `prayer_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_reviewed_by_profiles_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_prayer_unit_id_prayer_units_id_fk` FOREIGN KEY (`prayer_unit_id`) REFERENCES `prayer_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_id_profiles_id_fk` FOREIGN KEY (`id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_created_by_profiles_id_fk` FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_marked_by_profiles_id_fk` FOREIGN KEY (`marked_by`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_academic_year_id_academic_years_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_activity_id_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_issued_by_profiles_id_fk` FOREIGN KEY (`issued_by`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_attendance` ADD CONSTRAINT `exam_attendance_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_attendance` ADD CONSTRAINT `exam_attendance_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_attendance` ADD CONSTRAINT `exam_attendance_marked_by_profiles_id_fk` FOREIGN KEY (`marked_by`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `marks` ADD CONSTRAINT `marks_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `marks` ADD CONSTRAINT `marks_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `marks` ADD CONSTRAINT `marks_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `marks` ADD CONSTRAINT `marks_entered_by_profiles_id_fk` FOREIGN KEY (`entered_by`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toppers` ADD CONSTRAINT `toppers_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toppers` ADD CONSTRAINT `toppers_academic_year_id_academic_years_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toppers` ADD CONSTRAINT `toppers_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toppers` ADD CONSTRAINT `toppers_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toppers` ADD CONSTRAINT `toppers_confirmed_by_profiles_id_fk` FOREIGN KEY (`confirmed_by`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `class_teachers_teacher_idx` ON `class_teachers` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `exams_class_idx` ON `exams` (`class_id`);--> statement-breakpoint
CREATE INDEX `exams_academic_year_idx` ON `exams` (`academic_year_id`);--> statement-breakpoint
CREATE INDEX `grade_scales_min_idx` ON `grade_scales` (`min_percent`);--> statement-breakpoint
CREATE INDEX `registrations_status_idx` ON `registrations` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `registrations_reviewed_by_idx` ON `registrations` (`reviewed_by`);--> statement-breakpoint
CREATE INDEX `registrations_student_idx` ON `registrations` (`student_id`);--> statement-breakpoint
CREATE INDEX `students_class_idx` ON `students` (`class_id`);--> statement-breakpoint
CREATE INDEX `students_dob_idx` ON `students` (`dob`);--> statement-breakpoint
CREATE INDEX `students_school_class_idx` ON `students` (`school_class`);--> statement-breakpoint
CREATE INDEX `students_status_idx` ON `students` (`status`);--> statement-breakpoint
CREATE INDEX `activities_class_idx` ON `activities` (`class_id`,`activity_date`);--> statement-breakpoint
CREATE INDEX `activities_student_idx` ON `activities` (`student_id`);--> statement-breakpoint
CREATE INDEX `activities_created_by_idx` ON `activities` (`created_by`);--> statement-breakpoint
CREATE INDEX `attendance_class_date_idx` ON `attendance` (`class_id`,`date`);--> statement-breakpoint
CREATE INDEX `attendance_marked_by_idx` ON `attendance` (`marked_by`);--> statement-breakpoint
CREATE INDEX `certificates_student_idx` ON `certificates` (`student_id`);--> statement-breakpoint
CREATE INDEX `certificates_year_idx` ON `certificates` (`academic_year_id`);--> statement-breakpoint
CREATE INDEX `certificates_exam_idx` ON `certificates` (`exam_id`);--> statement-breakpoint
CREATE INDEX `certificates_activity_idx` ON `certificates` (`activity_id`);--> statement-breakpoint
CREATE INDEX `certificates_class_idx` ON `certificates` (`class_id`);--> statement-breakpoint
CREATE INDEX `certificates_issued_by_idx` ON `certificates` (`issued_by`);--> statement-breakpoint
CREATE INDEX `exam_attendance_student_idx` ON `exam_attendance` (`student_id`);--> statement-breakpoint
CREATE INDEX `exam_attendance_marked_by_idx` ON `exam_attendance` (`marked_by`);--> statement-breakpoint
CREATE INDEX `marks_student_idx` ON `marks` (`student_id`);--> statement-breakpoint
CREATE INDEX `marks_subject_idx` ON `marks` (`subject_id`);--> statement-breakpoint
CREATE INDEX `marks_entered_by_idx` ON `marks` (`entered_by`);--> statement-breakpoint
CREATE INDEX `toppers_class_idx` ON `toppers` (`class_id`,`type`,`period_start`);--> statement-breakpoint
CREATE INDEX `toppers_student_idx` ON `toppers` (`student_id`);--> statement-breakpoint
CREATE INDEX `toppers_exam_idx` ON `toppers` (`exam_id`);--> statement-breakpoint
CREATE INDEX `toppers_year_idx` ON `toppers` (`academic_year_id`);--> statement-breakpoint
CREATE INDEX `toppers_confirmed_by_idx` ON `toppers` (`confirmed_by`);--> statement-breakpoint
CREATE INDEX `registration_attempts_ip_idx` ON `registration_attempts` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sign_in_attempts_account_idx` ON `sign_in_attempts` (`account_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `sign_in_attempts_ip_idx` ON `sign_in_attempts` (`ip_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `sign_in_attempts_created_idx` ON `sign_in_attempts` (`created_at`);